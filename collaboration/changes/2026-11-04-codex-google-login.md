# 修改紀錄：Google 會員登入

- 日期：2026-11-04（Asia/Taipei）。工作者：本對話 Codex；AUTH-20261104-01。
- 基準：main 7433c50；開工時乾淨並 fetch 核對，收尾遠端前進至 Hermes 370669a，保留整合而不覆蓋。交付目標依既有要求 main，不 force push。
- 本次 commit：隨本紀錄的提交。狀態：本機程式與隔離驗證完成；真實 Google 與正式部署待接手。

## 目的與範圍

使用者要求「加入google登入」。範圍為會員登入／註冊、切片內登入及會員帳號設定；不修改員工驗證規則、不連真硬體、不自建 Google 專案或憑證。

## 修改內容

| 檔案 | 內容 |
| --- | --- |
| `api/google-auth.mjs` | Google OAuth Code＋PKCE、state／nonce、jose JWKS 驗證、短效 HttpOnly cookie／單次票證、會員建立／登入／主動連結、同 Email 衝突及原 session 核對 |
| `api/server.mjs` | 註冊會員 OAuth、私有 subject 淨化、登入／連結稽核、阻擋對 Google-only 註冊／認領覆寫密碼、允許收 Email 設密碼、修正既有重設信導向舊前端的連結 |
| `GoogleSignIn.vue`、`Login.vue`、`Register.vue`、`QuoteAccount.vue`、`Workspace.vue` | 保留原表單與版型、Google 入口、狀態錯誤、主動連結；切片另開視窗並驗證同源 storage session，原編輯器不離開；Google-only 設密碼說明 |
| `.env.example`、`docker-compose.yml`、`package*.json` | 空白 Google 環境範本、API 容器傳入與鎖定的 jose 依賴，沒有真密鑰 |
| `api/google-auth.test.mjs`、`scripts/check-google-auth.mjs` | synthetic RSA／provider 與真 API 測試、獨立 localhost DB／瀏覽器驗收，不接外部 Google |
| `docs/google-login.md`、`README.md`、共編文件 | 設定、Bot 可轉貼訊息、runtime 依賴注意、正式驗收與單程序限制 |

## 保留與影響

遵守 D-001～D-006；閱讀共編規則及近期 UI、main 交付紀錄。保留協作者首頁、AuthShell、既有表單與共用品牌 token。只插入 Google 元件／帳號設定說明，不重設圓角、配色或導航。
`QuoteAccount` 是切片／免費站點共用登入區，因此使用另開視窗與 storage event，而不讓 Google 跳轉破壞原頁模型。Google 只供會員，不為員工繞過 2FA。

## 已驗證（尚未整合遠端時）

- `npm run qc` 成功：51 檔／406 項，log `/tmp/3drfm-google-final-qc.log`；收尾小幅加強 flow 容量與跨 workspace 連結限制後仍需整合重驗。
- `npx vitest run api/google-auth.test.mjs`：14 項通過，涵蓋 RSA 簽章、錯 issuer／audience／azp／nonce、過期、provider 失敗、帳號持久化、subject 隱藏、權限隔離、連結／換帳號／撤銷、取消／foreign cookie／回呼與票證重播、並發一次性、密碼註冊／quote claim 接管防護、Email 設密碼及撤銷 session。
- `PLAYWRIGHT_MODULE=/tmp/3drfm-google-browser/node_modules/playwright node scripts/check-google-auth.mjs`：六組驗收通過，1440／390／320px 登入註冊無水平溢出、回呼後帶會員 session 返回設定、取消、同 Email 衝突／原密碼登入／連結、上傳真 fixture STL 後另開登入且原頁模型保留、未設定入口隱藏及無瀏覽器 JS exception。
- 截圖 `/tmp/rfm-google-browser-fKBDIH/`；人工檢視 `login-390.png`。暫存證據非團隊永久保存；本輪沒有改前截圖，可由基準 commit 核對既有版型。非實體手機測試。
- 建置最新 UI 成功，`git diff --check` 通過。未呼叫真 Google／SMTP、未操作印表機；密碼信由本機 mock 收集。

## 待辦與交接

H-009：維護者設定 Google Web client、正式同意畫面與回呼網址，批准部署後再以真測試會員驗收。新增 jose 需要新版 API runtime 依賴，不能盲用先前快取 API 映像。單程序 flow state，重啟會讓未完成登入失效；多程序必須 sticky routing 或另實作共用 TTL store。
不把測試或推送當正式上線；未變更切片 profiles、Telegram 或正式安全政策。整合遠端後的測試與推送結果於收尾補入。

## 整合收尾

- Google 程式提交 `c1baa82`，合併 `fa9639a` 保留 Hermes `370669a`。只有 CURRENT_WORK 同位置新增條目發生衝突，兩條完整保留；server 自動合併後檢查，沒有覆蓋登入 overlay／noindex。
- 合併後 `npm run qc`：建置成功（6.07 秒），**52 檔／408 項全部通過**（65.38 秒）。log `/tmp/3drfm-google-merged-qc.log`。包含新增跨 workspace／flow 容量防呆的最新程式。
- 合併後瀏覽器六組驗收再次全部通過，log `/tmp/3drfm-google-merged-browser.log`，截圖 `/tmp/rfm-google-browser-Yrh4fD/`。登入／註冊三尺寸及真 fixture STL 留在原工作頁均驗證；仍非真 Google 或實體手機。
- `docker compose --env-file .env.example config --quiet` 與 `git diff --check` 成功；沒有載入正式 .env 或啟動 Docker。首頁、Hermes 部署腳本及 overlay 測試與 origin/main byte-identical。
- 收尾 fetch 確認遠端仍是 370669a；依使用者既有 main 交付／推送要求使用普通 push，不 force。精確交付 SHA 由本紀錄 `git log` 與遠端 main 查詢；推送不是部署。新 Google 憑證／同意畫面、API 新依賴部署及真實驗收仍為 H-009。
