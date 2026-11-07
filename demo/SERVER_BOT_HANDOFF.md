# 給伺服器 BOT：只部署 farmflow 測試展示

使用者已指定 `farmflow.3dstu.com`。本輪工作區僅以公開 GET 確認 `/api/health` 回傳 `postgres-jsonb`，沒有 SSH／主機管理通道，**尚未遠端部署或寫入資料**。

請先讀 AGENTS.md、demo/README.md、collaboration/HANDOFF.md，再執行：

1. 確認正操作 farmflow 測試站而非 3drfm.com。記錄目前 commit、服務／容器、反向代理 upstream、資料庫備份位置及 rollback 方式；不輸出任何憑證。
2. 在獨立 checkout／release 取得本次 main 版本，保留所有未提交 UI 修改。保留現有 PostgreSQL、storage、`.env`、Orca 容器及外部設定包。**不要用 demo state 覆蓋 PostgreSQL，不執行 reset、volume down -v、seed restore 或整目錄同步刪除。**
3. 用主機既有 Node／套件環境執行 `npm run build`。以非 root 服務帳號在 `/var/lib/3drfm-demo/` 下挑選全新資料目錄；透過密鑰管理提供至少 14 字元 DEMO_PASSWORD，執行 `npm run demo:prepare -- <全新絕對路徑>`。不把密碼貼回聊天、寫入 shell history 或報告。
4. 啟動獨立 `npm run demo:start -- <同一路徑>`，僅綁 localhost，另選未佔用的 DEMO_PORT。不要啟動 worker；不要沿用正式通知、金流與機台憑證。服務需持久化同一資料目錄，不是每次重啟重新 seed。
5. 在 localhost 先驗收 `/api/demo/status` active=true；操作員登入、18 案件、下載模型、草稿、排程急件／保養排除、會員隔離。硬體／付款 API 必須 403，舊的通用登入 demo@layerpilot.test 不得可用。
6. 現有站點若不是專用 demo：先向使用者明示「將 farmflow 的網頁/API upstream 切至隔離展示程序；原服務與 DB 保留，可切回」。確認沒有影響其他共用網域後才切換該測試站 upstream，保留 HTTPS、原安全標頭及站點存取限制。不得順手改正式 Nginx、正式 CSP 或其他網域。
7. OpenAI key 由使用者在伺服器安全設定；模型預設已寫好。如要啟用付費 AI，在專用 env 加 DEMO_ALLOW_OPENAI=true，設定專案預算並依 docs/openai-demo-readiness.md 驗收；不能把「key 存在」當成模型可用。
8. 回報實際 commit、URL、資料筆數、操作截圖、通過／失敗、回復步驟；不貼密碼或 token。原 Orca 設定包雜湊／掛載位置應與部署前一致。這份 demo 不負責產生新 G-code，真切片仍需原獨立測試服務驗證。

回復：只將 farmflow upstream 切回已記錄的原服務；停用獨立 demo 程序。保留 demo 目錄作紀錄，不刪除原資料庫／檔案／設定包。
