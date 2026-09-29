(() => {
  'use strict';

  const STORE_KEY = 'mouse-wheel-picker:v1';
  const DEMO_NAMES = ['王小明', '李小華', '陳大文', '林美美', '張志豪', '黃怡君', '吳建宏', '劉家豪', '蔡宜蓁', '楊承恩', '許雅婷', '鄭宇翔'];
  const FURS = ['#b9b2aa', '#d8b48a', '#f3ede4', '#9c7a5b', '#cfc7be', '#7d7169'];
  const WHEELS = ['#ff8c61', '#4fa3e0', '#6cc070', '#f2b632', '#b47ee5', '#ef6f9c'];

  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const statsEl = $('stats');
  const historyList = $('historyList');
  const btnDraw = $('btnDraw');
  const btnList = $('btnList');
  const btnSound = $('btnSound');
  const btnFull = $('btnFull');
  const btnReset = $('btnReset');
  const backdrop = $('backdrop');
  const result = $('result');
  const resultSub = $('resultSub');
  const resultName = $('resultName');
  const listDialog = $('listDialog');
  const namesInput = $('namesInput');
  const nameCount = $('nameCount');
  const noRepeatBox = $('noRepeat');
  const toastEl = $('toast');

  let state = { names: [], drawn: [], noRepeat: true, sound: true, custom: false };
  let cells = [];
  let busy = false;
  let resultOpen = false;
  let currentWinner = -1;
  let flyer = null;

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 用 crypto 產生公平的亂數（避免取餘數偏差）
  function randInt(n) {
    if (window.crypto && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      const limit = Math.floor(0x100000000 / n) * n;
      let x;
      do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }

  /* ---------- 儲存 ---------- */
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.names) && saved.names.length) {
        state = { ...state, ...saved };
        state.drawn = (state.drawn || []).filter(i => Number.isInteger(i) && i < state.names.length);
      }
    } catch (e) { /* 無法讀取就用預設值 */ }
    if (!state.names.length) state.names = DEMO_NAMES.slice();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 音效（WebAudio 即時合成，不需要音檔） ---------- */
  const Sound = {
    ctx: null,
    init() {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    tone(freq, dur, type = 'sine', vol = 0.15, freqEnd = null, delay = 0) {
      if (!state.sound || !this.ctx) return;
      const t = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    tick(p) { this.tone(700 + p * 700, 0.05, 'square', 0.05); },
    squeak() {
      this.tone(1700, 0.09, 'sine', 0.12, 2600);
      this.tone(1900, 0.13, 'sine', 0.12, 2900, 0.12);
    },
    whistle(d) { this.tone(1800, d, 'sine', 0.07, 280); },
    thud() { this.tone(150, 0.3, 'triangle', 0.35, 55); },
    fanfare() {
      [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.14, null, i * 0.11));
      this.tone(1047, 0.6, 'triangle', 0.16, null, 0.33);
    },
  };

  /* ---------- SVG 素材 ---------- */
  const WHEEL_SVG = (() => {
    const pt = (r, a) => `${(r * Math.cos(a)).toFixed(2)} ${(r * Math.sin(a)).toFixed(2)}`;
    let s = '<svg viewBox="-60 -60 120 120" aria-hidden="true"><circle class="w-back" r="52"/>';
    for (let i = 0; i < 8; i++) {
      const [x, y] = pt(44, (i / 8) * Math.PI * 2).split(' ');
      s += `<line class="w-spoke" x1="0" y1="0" x2="${x}" y2="${y}"/>`;
    }
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const [x1, y1] = pt(44, a).split(' ');
      const [x2, y2] = pt(52, a).split(' ');
      s += `<line class="w-rung" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
    return s + '<circle class="w-rim" r="52"/><circle class="w-rim2" r="44"/><circle class="w-hub" r="5"/></svg>';
  })();

  const STAND_SVG = '<svg class="stand" viewBox="-60 -60 120 120" aria-hidden="true"><path d="M0 0 L-30 57 M0 0 L30 57"/><path d="M-44 57 H44"/></svg>';

  const OUTLINE = 'stroke="rgba(60,40,30,.28)" stroke-width="1.2"';
  const mouseSVG = fur => `
    <svg class="mouse-svg" viewBox="0 0 100 70" aria-hidden="true">
      <path class="tail" d="M22 48 C10 48 6 36 12 28 C17 21 10 12 2 14" fill="none" stroke="#e9a1a8" stroke-width="3" stroke-linecap="round"/>
      <g class="legs-b"><ellipse cx="38" cy="61" rx="6" ry="3.6" fill="#d98c96"/><ellipse cx="57" cy="61" rx="5" ry="3.2" fill="#d98c96"/></g>
      <g class="legs-a"><ellipse cx="30" cy="61" rx="6" ry="3.6" fill="#eaa2aa"/><ellipse cx="64" cy="61" rx="5" ry="3.2" fill="#eaa2aa"/></g>
      <g class="body">
        <ellipse cx="44" cy="44" rx="28" ry="17" fill="${fur}" ${OUTLINE}/>
        <ellipse cx="46" cy="52" rx="18" ry="7" fill="#fff" opacity=".35"/>
        <path d="M58 34 Q68 22 82 29 Q95 36 95 41 Q91 47 78 49 Q63 51 57 45 Z" fill="${fur}" ${OUTLINE}/>
        <circle cx="64" cy="23" r="10.5" fill="${fur}" ${OUTLINE}/>
        <circle cx="64.5" cy="23.5" r="6.5" fill="#f5b3b9"/>
        <circle cx="79" cy="35" r="3" fill="#2b2522"/>
        <circle cx="80.2" cy="33.8" r="1" fill="#fff"/>
        <circle cx="80" cy="43" r="3.2" fill="#f59aa5" opacity=".45"/>
        <circle cx="95" cy="41" r="3.2" fill="#e8707f"/>
        <path d="M89 43 L100 39 M89 44.5 L100 46" stroke="#6b5f58" stroke-width=".8" stroke-linecap="round"/>
      </g>
    </svg>`;

  // 老鼠跑步的小動作（腳、身體上下、尾巴），用 Web Animations 以便平滑調整速度
  function startMouseAnims(root) {
    const legOpt = { duration: 260, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' };
    return [
      root.querySelector('.legs-a').animate([{ transform: 'translate(-5px,0)' }, { transform: 'translate(5px,-2.5px)' }], legOpt),
      root.querySelector('.legs-b').animate([{ transform: 'translate(5px,-2.5px)' }, { transform: 'translate(-5px,0)' }], legOpt),
      root.querySelector('.body').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-1.8px)' }],
        { duration: 130, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }),
      root.querySelector('.tail').animate([{ transform: 'rotate(-7deg)' }, { transform: 'rotate(7deg)' }],
        { duration: 520, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }),
    ];
  }

  /* ---------- 建立舞台 ---------- */
  function buildStage() {
    cells.forEach(c => { c.wheelAnim.cancel(); c.bodyAnims.forEach(a => a.cancel()); });
    stage.innerHTML = '';
    cells = [];
    const frag = document.createDocumentFragment();

    state.names.forEach((name, i) => {
      const fur = FURS[(i * 5) % FURS.length];
      const el = document.createElement('div');
      el.className = 'cell';
      el.title = name;
      el.style.setProperty('--wheel', WHEELS[i % WHEELS.length]);
      el.innerHTML = `
        <div class="wheel-wrap">${STAND_SVG}<div class="wheel">${WHEEL_SVG}</div><div class="mouse">${mouseSVG(fur)}</div></div>
        <div class="name"><span class="badge"></span><span class="label"></span></div>`;
      el.querySelector('.label').textContent = name;
      frag.appendChild(el);

      const wheelEl = el.querySelector('.wheel');
      const mouse = el.querySelector('.mouse');
      const wheelAnim = wheelEl.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 2600 * (0.8 + Math.random() * 0.4), iterations: Infinity }
      );
      const bodyAnims = startMouseAnims(mouse);
      [wheelAnim, ...bodyAnims].forEach(a => { a.currentTime = Math.random() * 2000; });

      cells.push({ i, el, mouse, fur, wheelAnim, bodyAnims, badge: el.querySelector('.badge'), rate: 1 });
    });

    stage.appendChild(frag);
    layout();
    refreshCells();
    cells.forEach(c => setCellRate(c, defaultRate(c)));
  }

  // 依照名單人數與畫面大小，算出讓格子最大的欄數
  function layout() {
    const n = cells.length;
    if (!n) return;
    const cs = getComputedStyle(stage);
    const W = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const H = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    let best = 0, bestCols = 1;
    for (let c = 1; c <= n; c++) {
      const rows = Math.ceil(n / c);
      const s = Math.min(W / c, H / (rows * 1.2));
      if (s > best) { best = s; bestCols = c; }
    }
    stage.style.setProperty('--cell', Math.floor(Math.min(best, 240)) + 'px');
    stage.style.setProperty('--cols', bestCols);
  }

  /* ---------- 速度控制 ---------- */
  const isEmpty = i => state.noRepeat && state.drawn.includes(i);
  const defaultRate = c => (isEmpty(c.i) ? 0 : 1);

  function setCellRate(c, r) {
    c.rate = r;
    c.wheelAnim.playbackRate = r;
    const body = Math.min(r, 3);
    c.bodyAnims.forEach(a => { a.playbackRate = body; });
  }

  let rampRaf = 0;
  function rampRates(getTarget, ms) {
    cancelAnimationFrame(rampRaf);
    const from = cells.map(c => c.rate);
    const to = cells.map(getTarget);
    const t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      cells.forEach((c, k) => setCellRate(c, from[k] + (to[k] - from[k]) * e));
      if (p < 1) rampRaf = requestAnimationFrame(step);
    };
    rampRaf = requestAnimationFrame(step);
  }

  /* ---------- 畫面更新 ---------- */
  function refreshCells() {
    cells.forEach(c => {
      const empty = isEmpty(c.i);
      c.el.classList.toggle('empty', empty);
      c.badge.textContent = empty ? state.drawn.indexOf(c.i) + 1 : '';
    });
  }

  function availablePool() {
    return cells.map(c => c.i).filter(i => !isEmpty(i));
  }

  function updateUI() {
    const n = state.names.length;
    statsEl.textContent = state.noRepeat
      ? `還有 ${availablePool().length} / ${n} 隻老鼠在跑`
      : `共 ${n} 隻老鼠（可重複抽）`;

    historyList.innerHTML = '';
    if (!state.drawn.length) {
      const li = document.createElement('li');
      li.className = 'empty-hint';
      li.textContent = '還沒有人上台';
      historyList.appendChild(li);
    } else {
      state.drawn.forEach((idx, k) => {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = k + 1;
        li.append(b, state.names[idx]);
        historyList.appendChild(li);
      });
      historyList.scrollLeft = historyList.scrollWidth;
    }

    btnSound.textContent = state.sound ? '🔊' : '🔇';
    btnDraw.disabled = busy;
    btnList.disabled = busy;
    btnReset.disabled = busy;
  }

  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
  }

  /* ---------- 抽籤流程 ---------- */
  async function draw() {
    if (busy || resultOpen || listDialog.open) return;
    const pool = availablePool();
    if (!pool.length) {
      toast('🎉 全部都抽過了！按「↺ 重置」重新開始');
      return;
    }

    busy = true;
    updateUI();
    Sound.init();

    const winner = pool[randInt(pool.length)];
    currentWinner = winner;

    // 1. 全部老鼠加速狂奔
    rampRates(c => (isEmpty(c.i) ? 0 : 4.5), 700);
    await wait(350);

    // 2. 聚光燈在滾輪之間亂跳，越來越慢，最後停在被抽中的那隻
    const hops = pool.length === 1 ? 6 : 22 + randInt(6);
    let prev = -1;
    for (let k = 0; k < hops; k++) {
      let idx;
      if (k === hops - 1) {
        idx = winner;
      } else {
        let cand = pool.filter(x => x !== prev);
        if (k === hops - 2 && cand.length > 1) cand = cand.filter(x => x !== winner);
        idx = cand.length ? cand[randInt(cand.length)] : winner;
      }
      if (prev >= 0) cells[prev].el.classList.remove('lit');
      cells[idx].el.classList.add('lit');
      Sound.tick(k / hops);
      prev = idx;
      await wait(45 + 430 * Math.pow(k / (hops - 1 || 1), 3));
    }

    // 3. 被抽中的滾輪暴衝、搖晃
    cells[winner].el.classList.add('chosen');
    rampRates(c => (c.i === winner ? 9 : isEmpty(c.i) ? 0 : 0.4), 450);
    Sound.squeak();
    await wait(900);

    // 4. 老鼠被甩出去、從天而降
    const landing = await launch(winner);

    // 5. 公布名字
    if (state.noRepeat && state.drawn.includes(winner)) state.drawn = state.drawn.filter(x => x !== winner);
    state.drawn.push(winner);
    save();
    showResult(winner, landing);
  }

  async function launch(i) {
    const cell = cells[i];
    const r = cell.mouse.getBoundingClientRect();

    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = mouseSVG(cell.fur);
    Object.assign(el.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px' });
    document.body.appendChild(el);
    flyer = { el, anims: startMouseAnims(el) };
    flyer.anims.forEach(a => { a.playbackRate = 3; });

    cell.mouse.style.visibility = 'hidden';
    backdrop.classList.add('show');
    // 空掉的滾輪靠慣性慢慢停下，其他老鼠也放慢
    rampRates(c => (c.i === i || isEmpty(c.i) ? 0 : 0.35), 2600);

    const vw = window.innerWidth, vh = window.innerHeight;
    const h = r.width * 0.7;
    const targetW = Math.max(140, Math.min(vw * 0.3, (vh * 0.3) / 0.7, 300));
    const S = targetW / r.width;
    const cx = r.left + r.width / 2, cy = r.top + h / 2;
    const tx = vw / 2, ty = vh * 0.3;
    const dx = tx - cx, dy = ty - cy;
    const topY = -cy - h * S;
    const T = (x, y, rot, sx, sy = sx) => `translate(${x}px,${y}px) rotate(${rot}deg) scale(${sx},${sy})`;

    const anim = el.animate([
      { offset: 0,    transform: T(0, 0, 0, 1),                          easing: 'cubic-bezier(.2,.7,.4,1)' },
      { offset: 0.3,  transform: T(dx * 0.5, topY, -540, S * 0.8),       easing: 'cubic-bezier(.5,0,1,.7)' },
      { offset: 0.72, transform: T(dx, dy, -1080, S),                    easing: 'ease-out' },
      { offset: 0.8,  transform: T(dx, dy + h * S * 0.12, -1080, S * 1.3, S * 0.72), easing: 'ease-out' },
      { offset: 0.9,  transform: T(dx, dy - h * S * 0.35, -1080, S * 0.94, S * 1.08), easing: 'ease-in' },
      { offset: 1,    transform: T(dx, dy, -1080, S) },
    ], { duration: 2000, fill: 'forwards' });

    setTimeout(() => Sound.whistle(0.85), 600);
    setTimeout(() => {
      Sound.thud();
      confetti.burst(tx, ty);
      Sound.fanfare();
    }, 1440);

    await anim.finished;
    flyer.anims.forEach(a => { a.playbackRate = 0.7; });
    return { ty, height: h * S };
  }

  function showResult(i, landing) {
    resultOpen = true;
    const left = availablePool().length;
    resultSub.textContent = state.noRepeat
      ? `🎉 第 ${state.drawn.length} 位上台（還剩 ${left} 位）`
      : `🎉 第 ${state.drawn.length} 次抽籤`;
    resultName.textContent = state.names[i];
    result.style.top = Math.round(landing.ty + landing.height / 2 + 14) + 'px';
    result.hidden = false;
    result.classList.remove('pop');
    void result.offsetWidth;
    result.classList.add('pop');
    updateUI();
  }

  function closeResult() {
    if (!resultOpen) return;
    resultOpen = false;
    result.hidden = true;
    backdrop.classList.remove('show');
    if (flyer) {
      flyer.anims.forEach(a => a.cancel());
      flyer.el.remove();
      flyer = null;
    }
    const c = cells[currentWinner];
    if (c) {
      c.mouse.style.visibility = '';
      c.el.classList.remove('chosen', 'lit');
    }
    refreshCells();
    rampRates(defaultRate, 900);
    busy = false;
    updateUI();
  }

  /* ---------- 彩帶 ---------- */
  const confetti = (() => {
    const cv = $('confetti');
    const ctx = cv.getContext('2d');
    const COLORS = ['#ffc93c', '#ff7a59', '#4fa3e0', '#6cc070', '#ef6f9c', '#b47ee5', '#ffffff'];
    let parts = [];
    let raf = 0;

    function resize() {
      const d = window.devicePixelRatio || 1;
      cv.width = window.innerWidth * d;
      cv.height = window.innerHeight * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    }
    function spray(x, y, angle, spread, count, speed) {
      for (let k = 0; k < count; k++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const sp = speed * (0.5 + Math.random() * 0.7);
        parts.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          w: 6 + Math.random() * 6,
          h: 4 + Math.random() * 6,
          c: COLORS[k % COLORS.length],
          cheese: Math.random() < 0.07,
          life: 0,
        });
      }
    }
    function tick() {
      const W = window.innerWidth, H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.3;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.cheese) {
          ctx.font = '22px serif';
          ctx.fillText('🧀', -11, 8);
        } else {
          ctx.fillStyle = p.c;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.cos(p.life * 0.2));
        }
        ctx.restore();
      }
      parts = parts.filter(p => p.y < H + 40 && p.life < 420);
      if (parts.length) raf = requestAnimationFrame(tick);
      else { raf = 0; ctx.clearRect(0, 0, W, H); }
    }
    return {
      burst(x, y) {
        resize();
        const W = window.innerWidth, H = window.innerHeight;
        spray(x, y, -Math.PI / 2, Math.PI * 2, 110, 13);
        spray(0, H, -Math.PI / 3, 0.6, 60, 24);
        spray(W, H, (-2 * Math.PI) / 3, 0.6, 60, 24);
        if (!raf) raf = requestAnimationFrame(tick);
      },
    };
  })();

  /* ---------- 名單視窗 ---------- */
  function parseNames(text) {
    return text
      .split(/\r?\n|[,，、;；]/)
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function openList() {
    if (busy) return;
    namesInput.value = state.custom ? state.names.join('\n') : '';
    noRepeatBox.checked = state.noRepeat;
    updateCount();
    listDialog.showModal();
    namesInput.focus();
  }

  function updateCount() {
    nameCount.textContent = `共 ${parseNames(namesInput.value).length} 位`;
  }

  $('listForm').addEventListener('submit', e => {
    e.preventDefault();
    const names = parseNames(namesInput.value);
    if (!names.length) {
      toast('請先貼上至少一位學生的名字');
      namesInput.focus();
      return;
    }
    const changed = JSON.stringify(names) !== JSON.stringify(state.names);
    state.noRepeat = noRepeatBox.checked;
    if (changed) {
      state.names = names;
      state.drawn = [];
      state.custom = true;
      buildStage();
    } else {
      refreshCells();
      rampRates(defaultRate, 600);
    }
    save();
    updateUI();
    listDialog.close();
    toast(`已載入 ${names.length} 位學生 🐭`);
  });

  $('btnCancel').addEventListener('click', () => listDialog.close());
  namesInput.addEventListener('input', updateCount);

  /* ---------- 按鈕與鍵盤 ---------- */
  btnDraw.addEventListener('click', draw);
  btnList.addEventListener('click', openList);
  $('btnAgain').addEventListener('click', () => { closeResult(); draw(); });
  $('btnClose').addEventListener('click', closeResult);
  backdrop.addEventListener('click', closeResult);

  btnSound.addEventListener('click', () => {
    state.sound = !state.sound;
    if (state.sound) { Sound.init(); Sound.squeak(); }
    save();
    updateUI();
  });

  btnFull.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  });

  // 重置要按兩次，避免上課時誤觸
  let resetArmed = 0;
  btnReset.addEventListener('click', () => {
    if (busy) return;
    if (!resetArmed) {
      btnReset.textContent = '確定重置？';
      btnReset.classList.add('danger');
      resetArmed = setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    state.drawn = [];
    save();
    refreshCells();
    rampRates(defaultRate, 900);
    updateUI();
    toast('所有老鼠都回到滾輪上了！');
  });
  function disarmReset() {
    clearTimeout(resetArmed);
    resetArmed = 0;
    btnReset.textContent = '↺ 重置';
    btnReset.classList.remove('danger');
  }

  document.addEventListener('keydown', e => {
    if (listDialog.open || e.target.closest('textarea, input')) return;
    if (e.code === 'Space' || e.key === 'Enter') {
      e.preventDefault();
      if (resultOpen) closeResult();
      draw();
    } else if (e.key === 'Escape' && resultOpen) {
      closeResult();
    }
  });

  new ResizeObserver(layout).observe(stage);

  /* ---------- 開始 ---------- */
  load();
  buildStage();
  updateUI();
  if (!state.custom) {
    setTimeout(openList, 400);
  }
})();
