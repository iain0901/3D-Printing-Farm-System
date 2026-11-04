# 會員雙層導覽

- 日期：2026-11-04（Asia/Taipei）
- 工作者／工具：Codex；工作 ID：NAV-20261104-03
- 基準 commit：bb35a21727bfcd1bd22c186c69d979426f441d6a
- 本次 commit：隨本紀錄的提交，以 git log 查詢。
- 狀態：本機實作與驗收完成，交付 main；未部署。

## 目的與授權範圍

使用者要求頂欄鈴鐺通知、頭像下拉與清楚簡潔的側欄，並詢問現成框架。沿用專案已裝的 Element Plus／icons-vue，沒有增加依賴；只改會員外框，不改官網或後端。

## 修改內容

| 檔案／元件 | 改動與原因 |
| --- | --- |
| frontend-vue/src/layouts/PortalLayout.vue | 側欄依製作、模型、紀錄分組，圖示替代流水編號；通知改頂欄入口；頭像選單集中帳號、地址、付款單據、優惠、協助、登出。沿用原會員驗證與登出，防止重複登出；補各服務標題、Escape 關閉及焦點返回。 |
| scripts/check-member-home.mjs | 增加通知與所有帳號目的地、Enter／Escape、點外側、窄螢幕邊界及登出回歸；截圖等待傳送到 body 的下拉動畫完成。 |
| collaboration 文件 | 登錄 D-008、工作狀態與 H-010 交接。 |

## 保留的設計與相容性

保留 D-001～D-007 及 bb35a21 會員製作流程、價格與材料限制、手機功能選單及既有品牌 token。不改公開頁、API、資料、切片設定、Google 或機台權限。開工無他人未提交檔案，最新 fetch 遠端仍在基準；未覆寫協作者成果。

## 設計決策與影響範圍

D-008 記錄使用者確認的頂欄／側欄分工；具體間距、配色細節仍待視覺審閱。通知連至既有通知中心，沒有新增推播、計數輪詢或假的未讀徽章。影響所有採 PortalLayout 的會員頁。

## 驗證

- `npm run build` 成功，紀錄 `/tmp/member-nav-build.log`。
- `PLAYWRIGHT_MODULE=/tmp/3drfm-google-browser/node_modules/playwright node scripts/check-member-home.mjs` 通過，紀錄 `/tmp/member-nav-browser.log`。需本機已安裝 Playwright 與 Chromium；腳本使用隔離暫存資料、localhost API 與測試會員。
- 通知、五個帳號目的地、鍵盤 Enter 開啟／Escape 關閉、點外側關閉、登出清除登入狀態通過；保留匿名導登入、會員首頁、補件／取件及部分 API 失敗回歸，無頁面 JS error。
- 選單 1440／320 px 無越界；首頁 1440／390 px、會員內付費／免費切片與排隊入口檢查通過。首次鍵盤檢查找到 Escape 問題，修正後重跑通過。
- 人工檢視桌面與手機選單截圖：`/tmp/member-home-ovDZZs/header-menu-1440.png`、`header-menu-320.png`；同目錄包含首頁與切片截圖。均為暫存非永久團隊附件。前版截圖見上一輪紀錄，版本以基準 commit 核對。
- 沒有呼叫正式外部服務、列印、付款或部署；瀏覽器模擬手機，不是實體裝置驗收。沒有把上一輪測試總數當本輪結果。

## 待辦與交接

H-010：使用者視覺審閱與維護者正式部署。本輪僅發布程式；不要更動伺服器 profiles、.env 或資料。真實 Google／OpenAI／機台串接沿用既有交接限制。
