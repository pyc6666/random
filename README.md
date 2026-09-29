# 🐭 老鼠滾輪抽籤機

👉 **線上使用：<https://pyc6666.github.io/random/>**

課堂用的隨機抽學生小工具。每位學生都是一隻在滾輪上跑的小老鼠，按下「抽一位」後，聚光燈會在滾輪間亂跳、越跳越慢，最後被抽中的老鼠會被甩飛出去，再從天上掉下來公布名字。

純 HTML / CSS / JavaScript，不需要安裝任何東西。

## 使用方式

1. 按右上角「📋 名單」，貼上學生名單（可直接從 Excel / Google 試算表複製，一行一位；也可以用逗號、頓號分隔）
2. 按「🧀 抽一位！」或鍵盤 **空白鍵 / Enter** 抽籤
3. 結果畫面按 **空白鍵** 直接再抽下一位，按 **Esc** 或點背景回到滾輪

其他功能：

- **抽過的不再抽**：在名單視窗勾選（預設開啟），抽過的老鼠會離開滾輪；按「↺ 重置」（按兩次確認）讓所有人回來
- **已上台紀錄**：下方會依序列出抽到的學生
- **🔊 音效**：用 WebAudio 即時合成，可關閉
- **⛶ 全螢幕**：適合接投影機
- 名單與抽籤紀錄存在瀏覽器的 localStorage，重新整理不會消失（只存在這台電腦的這個瀏覽器）

## 部署到 GitHub Pages

本專案已部署在 <https://pyc6666.github.io/random/>，push 到 `main` 後約一分鐘會自動更新。

若要部署自己的一份：

```bash
git init
git add .
git commit -m "老鼠滾輪抽籤機"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repo 名稱>.git
git push -u origin main
```

然後到 GitHub repo 的 **Settings → Pages**，Source 選 **Deploy from a branch**，Branch 選 `main` / `/ (root)`，存檔後約一分鐘就能在
`https://<你的帳號>.github.io/<repo 名稱>/` 使用。

## 檔案

| 檔案 | 內容 |
| --- | --- |
| `index.html` | 頁面結構、名單視窗、結果畫面 |
| `style.css` | 版面、滾輪與老鼠樣式 |
| `script.js` | 動畫、抽籤邏輯、音效、彩帶 |
