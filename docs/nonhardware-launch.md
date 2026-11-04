# 非硬體後端上線準備

2026-11-04。使用者確認「先用現有流程完成上線準備」：LINE Pay、人工上傳已開立發票／收據、物流單號查詢。街口、PayUni、自動電子發票與即時物流 API 不屬本期。這份文件不是部署或真實服務驗收完成證明。

## 已有流程與本機證據

| 流程 | 實作／驗收檔案 | 正式環境仍需確認 |
| --- | --- | --- |
| 註冊、密碼登入、重設、Google 綁定、工作階段撤銷 | server、google-auth、member-workspace；google-auth.test、server.test、nonhardware-launch.test | HTTPS、Google redirect URI／consent、實際寄信與垃圾郵件 |
| 模型庫、草稿、專案、報價、訂單、付款單據、售後 | member-workspace、cases-module；同名測試 | 檔案持久 volume／S3、資料備份與還原；帳號刪除及退款由營運依流程處理 |
| 真切片／每克 NT$2、設定包不覆寫 | profile-bundle、orca-worker、public-slicing-quotes；同名測試 | 唯讀 Creality Hi／0.4 mm／3DSTU_PETG 原始包及真切片，不得用 fixture 成果代替 |
| LINE Pay | payment-providers、server；member-workspace.test、nonhardware-launch.test | 商家 sandbox 的成功、取消、中斷及重複確認；確認失敗不能當成未扣款，須商家後台對帳 |
| 通知與免費站點排隊／時段 | member-notification-delivery、free-print-station；同名測試、free-print-integration.test | SMTP；站點命令、影像與機台狀態是使用者另接的硬體範圍，未接時不得開放站點 |
| MCP、Agent、用途檢查、AI 外觀、Skill | site-agent、model-skill-package；site-agent*.test、mcp-http-protocol.test、poster-ai-acceptance.test | OpenAI 文字／圖片／語音與瀏覽器權限、支援的 MCP 客戶端；詳見 site-agent.md |
| 多維排產、日誌＋照片診斷、跨機保養推估 | server、maintenance-advisor；free-print-integration.test、maintenance-advisor.test | 排產用規則／最佳化、保養推估為啟發式，不能當已訓練模型或實際準確率；見 poster-ai-acceptance.md |
| 管理權限、持久化、備份、worker | server、persistence、worker；同名測試、deploy.test | 本輪 PostgreSQL 測試為 adapter fixture，不是真 DB 容災／效能測試 |

測試來源是程式契約與合成資料；完整清單不是「任意模型、任意負載、所有第三方都驗過」的保證。現行資料架構是**單一 API 寫入者**，不可增加第二個 API 副本共同寫入；worker 透過 API 更新。新增背景通知沿用此限制，不是分散式訊息佇列。

## 本輪修補

- Compose 明確傳入公開網址、SMTP、LINE Pay／sandbox、LINE Messaging 與客服必要變數，避免 `.env` 有值但 API 容器讀不到。未建立或更換任何憑證。
- 一般會員通知先保存，每 15 秒由 API 背景同步案件／訂單狀態並投遞；即使會員沒開頁面仍可產生通知。每輪最多 100 次發送，單次 25 秒上限。程序關閉時停止取新工作。
- SMTP 明確 4xx／DNS 失敗才退避重試，最多 5 次；永久拒絕為 `failed`；斷線、超時或重啟時未完成的發送為 `uncertain`，不盲目重寄。`sent` 表示服務接受呼叫，不保證進入收件匣。Message-ID 也不是 exactly-once 保證。
- 缺少管道設定的通知保留 `pending`；會員關閉偏好時 `skipped`。啟動時對未有通知的歷史案件建立不寄信的基準，防止批次寄送歷史訂單；已有明確排隊的通知仍繼續處理。舊 `quote:` 與 `free-print:` 通知保留原本獨立投遞流程，不會由新 dispatcher 重寄。
- 密碼重設未設 SMTP 時一律 503（不區分信箱有無帳號）；已設但寄信結果不明時，對外保持一致回應避免枚舉會員，內部持久記錄問題與記錄安全錯誤。先保存 token hash 再寄信，不保存明文 token。介面只說收到申請，不宣稱已寄達。密碼重設失敗請會員重新申請，不在重試佇列保存明文連結。
- LINE Pay 確認前保存 `processing`，未獲相符成功回覆保存 `needs_review`，仍為 pending，不偽造 paid。新診斷列出需要對帳的訂單；**沒有新增自動商家對帳／自動退款**。既有案件付款登記／售後流程保留。
- 正式 `NODE_ENV=production` 永遠不執行自動增加列印百分比的示範 telemetry，避免未連硬體就假完成。硬體 bridge 狀態回報未被替換。

## 管理員診斷 API

以下僅 Owner／Admin，沿用員工登入、正式管理員 2FA 與 workspace 隔離；不要使用會員或唯讀 API key。回應不含密鑰。

- `GET /api/member-service/launch-readiness`：設定存在與否、待處理密碼重設寄信數、最多 200 筆 LINE Pay 待查訂單。`liveServicesVerified:false`／`deploymentVerified:false` 是刻意的：這個 API 不呼叫外部服務驗證。切片設定路徑存在也不等於包內容／實際切片有效，另查 `/api/public/slicing-quotes/config`。
- `GET /api/member-service/notification-deliveries`：各狀態管道數量與最多 200 筆待處理通知。原免費站點通知請使用既有站點管理頁。
- `POST /api/member-service/notification-deliveries/{id}/retry`，內容 `{"channel":"email","acknowledgeDuplicateRisk":true}`：管理員先向供應商確認，再明確接受可能重寄風險；只重排 failed／uncertain，記錄操作者及時間。不支援越 workspace 或重送已成功通知。

這些是給維護者的診斷 API，不是新增一套儀表板版型。不要把完整回應或會員資料放在公開 issue。還原資料前停止 API／投遞，避免還原舊 pending 紀錄導致重送；還原後檢視問題清單。

## 給伺服器 Bot 的交接訊息

> 請先讀 AGENTS.md、collaboration/HANDOFF.md、docs/nonhardware-launch.md 與 docs/server-bot-slicer-handoff.md。本期只啟用既有 LINE Pay＋人工發票／收據上傳＋物流單號查詢。請先核對 main commit、現有部署方式及 Compose overrides，只讀檢查所需環境變數是否進入 API 容器，不輸出值、整份 .env 或展開後的 compose config。保留現有 .env、資料 volume、Telegram、機台設定與 checkout 外的唯讀 slicer profiles；不得改回 X1C／PLA。先回報缺項與驗收計畫，取得發布批准後才備份並更新前後端同版，不在本次驗收啟動實體印表機。只使用合成模型與獲准的測試帳號。逐項回報「程式版本、設定檢查、真實服務驗證、部署」四種狀態，不把 health 200 當成付款／AI／切片可用。

## 發布前逐項驗收

1. 保存目前 commit、映像版本、資料庫／檔案備份及 profile manifest hash，確認可恢復；核對只有一個 API 寫入者。不要更新或刪除 profile 根目錄。部署前確認中斷時現有訂單／切片工作的處理方式。
2. 檢查 `.env.example` 的 SMTP、HTTPS `LAYERPILOT_PUBLIC_URL`、Google、OpenAI、LINE Pay、worker、安全登入設定。只回報變數名及存在／缺少；根據現有 overrides 判斷，不能假設本機 compose 就是正式部署方式。
3. 登入管理員讀取 readiness 與新增診斷 API；讀取切片 config。預期未設定服務明確不可用，沒有假資料／通用估算。對正式保護、憑證或 Nginx 的更動需另行批准。
4. 使用測試會員走註冊→登入→登出→重設→舊密碼失效；Google 登入／綁定／取消各一次。SMTP 以獲准測試信箱實收，不能只看 API 200。
5. 上傳合成 STL→保存／重開草稿→真正切片→確認版本、材料、G-code、克數×2→下單；另一會員不得讀取模型、訂單、單據。此步只切片，不列印。
6. LINE Pay **sandbox** 成功、使用者取消、確認中斷、重複回跳各一次；商家端與本地訂單／案件／金額一致才算通過。交易結果不明時由商家後台對帳，再按既有案件付款流程處理；不要要求會員再付一次。正式扣款／退款需另行授權。
7. 管理員更新案件進度／物流單號、上傳測試收據；會員通知、文件下載及官方物流查詢連結可用。檢查故意失敗的通知是否進入正確狀態、管理員可查並在確認後重排；非管理員應 401／403。
8. OpenAI 使用合成模型／不含個資的測試對話，逐一測文字、圖片、語音、20% 填充可見操作、用途檢查與預覽；檢查使用額度、逾時、取消、重新登入與資料持久性。MCP 以文件列出的支援方式驗證 initialize／tools/list／tools/call 與撤銷 token，不宣稱支援所有 AI 客戶端。
9. PostgreSQL 真實重啟、檔案持久化、備份還原、背景 worker 及通知恢復需在獲准測試環境驗收。硬體連接前免費站點維持關閉；不能為了驗收 UI 偽造 online 或列印完成。

未完成真實服務或資料庫驗收時，可以交付程式，不能宣告「正式站所有後端已可用」。
