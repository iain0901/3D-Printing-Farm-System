# Google 會員登入與伺服器交接

Google 登入僅建立／使用會員身分，不授予員工權限。不取代原 Email／密碼登入。
程式與隔離測試不代表真實 Google OAuth 憑證、同意畫面或正式站已驗收。

## 部署前設定（交給伺服器 Bot）

1. 在團隊持有的 Google Cloud 專案設定 Google Auth Platform 同意畫面，建立 **Web application** 類型的 OAuth client。使用品牌正式網域、隱私權政策及聯絡資料；測試狀態先加入測試使用者，正式開放依 Google 當時要求完成發布／審核。
2. Authorized redirect URI 必須精確登錄正式回呼，例如 `https://3drfm.com/api/customer-auth/google/callback`。不同測試站建議使用獨立 client；不可把 `#` 路由填進 Google 的 redirect URI。
3. 在既有伺服器密鑰管理或部署 `.env` 設定以下值，**不要貼在對話、共編紀錄或提交 Git**：

   ```dotenv
   GOOGLE_CLIENT_ID=<Google Web client ID>
   GOOGLE_CLIENT_SECRET=<Google Web client secret>
   GOOGLE_REDIRECT_URI=https://3drfm.com/api/customer-auth/google/callback
   GOOGLE_PORTAL_LOGIN_PATH=/#/portal/login
   LAYERPILOT_PUBLIC_URL=https://3drfm.com
   ```

   網域僅為正式站示例，必須與實際站台完全一致（含 www 與否、port）。本功能要求前端與 API 同源，不能把 localhost 憑證用於正式站。空白／不安全回呼設定會停用入口，原密碼登入仍可用。
4. 目前 Vue 使用 hash router，維持 `/#/portal/login`。只有真的切換 history router 時才改成 `/portal/login`，並先確認伺服器已支援 SPA fallback；密碼重設連結也會隨此設定採相同路由模式。
5. `docker-compose.yml` 已傳入四個 Google 設定，映像會以 lockfile 安裝 `jose`。經維護者批准後，沿用現有部署流程重建／更新 **API 與前端同一版本**，不要清除資料卷、外部切片設定、Telegram 或 `.env`。本次沒有執行部署。

   **本版有新增 runtime dependency `jose`，不能直接沿用缺少它的舊 API 映像，只熱掛載 api/dist。** 若採 `ops/deploy-fast.py` 快取部署，候選 runtime／dependency artifact 也必須依新版 package-lock 更新，並在候選 runtime 先測試 `import('jose')`；不能把舊有「無變更依賴」部署條件套用本版。Google `.env` 也必須進入 API 容器環境，而不只是主機檔案存在。不得只更新 Orca worker 的 node_modules 就視為 API 依賴已更新。
6. API 需能以 HTTPS 出站至 `oauth2.googleapis.com/token`（POST）及 `www.googleapis.com/oauth2/v3/certs`（GET）。瀏覽器採頂層跳轉 Google，不載入 GIS script；本功能不需放寬既有 `script-src`／`connect-src` 或新增第三方追蹤碼。
7. 反向代理不得把回呼的完整 query（授權 code／state）寫入可公開的日誌／分析系統。可保留路徑、狀態碼與延遲等稽核資訊；若需調整正式 Nginx 記錄格式，另經維護者確認，本次未修改。

可以直接轉貼：

> 請使用新版 main 的 Google 會員登入功能。先確認正式使用的網域，在團隊 Google Cloud 建立 Web OAuth client 與同意畫面，登錄 `https://正式網域/api/customer-auth/google/callback`。將 GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_REDIRECT_URI 放在伺服器既有密鑰管理／.env，LAYERPILOT_PUBLIC_URL 要同源，保留 GOOGLE_PORTAL_LOGIN_PATH=/#/portal/login。本版新增 jose，須依新版 lockfile 更新 API runtime 依賴並驗證 import，不能只掛載 API／前端或更新 Orca 依賴；四個 Google 環境值也要實際進 API 容器。不要傳回密鑰，也不要清除切片 profiles、Telegram 或資料卷。先回報不含敏感值的設定檢查與部署計畫，再按既有授權流程部署。部署後以指定測試帳號驗證下列清單；未驗證前不要宣稱 Google 登入已上線。

## 會員體驗

- 登入／註冊頁：Google 首次登入建立會員，其後依 Google 不變的 `sub` 對應原會員；Google 名稱／Email 變動不會偷偷改寫既有會員聯絡信箱。
- 同 Email 已有資料：不自動合併。先原方式登入，再到「會員工作台 → 帳號設定 → Google 登入」連結同 Email 的 Google 帳戶；忘記密碼可先收驗證信重設。只有詢價資料、尚無密碼者，沿用原報價認領或聯絡專員流程。
- 已登入連結：開始與完成必須同一個有效會員工作階段，不能在中途登出／換帳號後綁定。既有密碼不會被刪除。
- 切片／估價中的登入：另開視窗 Google 登入，新視窗保存會員 session 後，原視窗透過同源 storage event 取得並向 API 驗證會員資料；不離開編輯器。瀏覽器需允許開啟視窗與 localStorage；被阻擋可重試或用原 Email 表單。
- Google-only 會員可透過既有 Email 重設流程設定密碼後使用密碼登入、變更密碼及刪除申請；寄信服務必須另外設定並驗證。沒有新增「無驗證直接設定密碼」或解除 Google 以致鎖帳的功能。

## 安全與資料範圍

- Authorization Code＋PKCE S256、隨機 state、nonce；`jose` 驗證 Google JWKS 的 RS256 簽章、issuer、audience、azp、時效、nonce 及 verified email。
- flow／單次完成票證只保存在 API 程序記憶體，HttpOnly、SameSite=Lax、正式 HTTPS 使用 Secure、host-only cookie。授權最長 10 分鐘，完成票證 60 秒；使用前即移除，取消／逾時／重啟必須重新登入，舊會員 session 不受影響。過期記錄於後續驗證請求清除，程序關閉時全清。
- **目前支援單一 API 程序**。多 replica／Node cluster 必須先為 Google start、callback、complete 配置同一程序的 sticky routing；未配置不得直接擴副本。後續若要無黏著擴展，須改成共用原子 TTL store，不能只共享會員資料庫就視為支援。
- Google client secret、access token、ID token 不送進前端／URL／資料庫；前端跳轉不含會員 access token。只有消耗一次性 HttpOnly cookie 後，才回傳既有會員 token、淨化會員資料與受限 returnTo。
- 會員內部保存 Google subject 與連結時間；一般會員／員工 state 只回傳 hasGoogle／hasPassword，不公開 subject。依既有客戶資料保護、備份與刪除程序管理，不能拿 `sub` 當展示 ID。
- 登入稽核使用既有 `customer.google_login`／`customer.google_linked` 事件，僅記內部 customer/workspace ID，不記 provider token／授權 code。
- 金鑰輪替／重啟會中斷進行中的登入；已建立的會員 session 仍遵循既有撤銷、閒置及期限政策。重設密碼會撤銷其他 session，包括 Google 建立的 session。

## 可重現本機驗收（全為 synthetic）

```sh
npx vitest run api/google-auth.test.mjs
npm run qc
# 需預先有 Playwright 與 Chromium；不會登入真實 Google
PLAYWRIGHT_MODULE=/path/to/playwright CHROMIUM_PATH=/usr/bin/chromium node scripts/check-google-auth.mjs
```

瀏覽器腳本自行建立暫存 DB／localhost 隨機 port，Google 導航由 fixture 攔截；後端仍真實執行回呼、會員保存、session、連結及權限檢查。ID token 密碼學驗證另以產生的 fixture RSA key 與 `jose` 測試，不以假 provider 回應冒充真 Google 驗證。

正式驗收至少包括：

1. 無設定時 Google 按鈕隱藏，Email 登入不變；設定後登入與註冊頁顯示入口。
2. 指定真實測試 Google 帳號：首次建立會員、登出後再登入同一會員、重整後案件與個資一致。
3. 同 Email 原會員先擋下，再用原密碼登入主動連結；連結後兩種方式均登入同一會員，不能拿會員 token 存取員工 API。
4. 取消授權、返回前頁、過期／重播回呼、服務重啟、第三方 cookies／彈窗限制下顯示可恢復失敗；不得建立錯誤會員或假成功。
5. 真正上傳模型、改方向／擺盤，從切片登入後回原頁，確認模型、參數、用途仍在，會員已帶入；手機同樣驗收。
6. Google-only 收到真實密碼設定信、連結打開正確頁面，設定後兩種登入都有效，舊 session 已撤銷。
7. 確認正式 HTTPS cookie、代理日誌不記 code、Google client 同意畫面發布狀態與多副本限制。這些都不是本機測試能替代的驗證。
