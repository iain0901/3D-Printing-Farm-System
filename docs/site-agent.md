# OpenAI 網站助理、MCP 與模型 skills

日期：2026-10-24（Asia/Taipei）。會員入口 `/#/portal/workspace?section=agent`；右下角「詢問列印助理」提供文字、圖片及語音操作提案。員工登入後也可從助理的「MCP 與 skills」管理自己的連線，沿用員工端驗證與 2FA 規則。

## 設定

將 `.env.example` 的以下設定填入部署環境 `.env`，不要將實際金鑰提交 Git：

```dotenv
OPENAI_API_KEY=
SITE_AGENT_MODEL=gpt-4.1-mini
SITE_AGENT_REVIEW_MODEL=gpt-4.1-nano
SITE_AGENT_REALTIME_MODEL=gpt-realtime
SITE_AGENT_DAILY_REQUESTS=50
```

Docker Compose 已明確傳遞這些變數給 API。填入後重建／重啟 API 容器；單純修改 `.env` 不會更新既有容器。原生 Node 執行可使用 `node --env-file=.env api/server.mjs`，或由 systemd 的 EnvironmentFile 注入；HTTPS 是正式語音與麥克風功能的必要條件。瀏覽器不持有長效 OpenAI 金鑰。

API 的 CSP 已允許 `https://api.openai.com` 與音訊 blob；Ubuntu Nginx 範本及新租戶佈署腳本改為 `microphone=(self)`。既有已部署站點也需更新其 Nginx 設定並重新載入；只更新程式與 `.env` 不會自動修改舊站點的 `microphone=()`。

模型名稱可依 OpenAI 專案實際可用模型調整。沒有金鑰時，AI 呼叫回覆 503 與繁體中文提示；MCP、skill 與參數化姓名牌不依賴 OpenAI 呼叫。

## 功能與資料流

- 文字／圖片：會員或員工以自己的登入呼叫 Responses API，由伺服器提供固定指令及結構化輸出。保留最近十段對話作為上下文；模型只能提出當前可操作欄位的 ID。
- 可見操作：前端捲動、聚焦與標示目標後，透過原生 input/change/click 事件操作真正 Vue 元件。每項操作先呈現確認卡，與使用者手動操作走同一組網站驗證，不繞過 API 權限。
- 語音：伺服器交換 Realtime 短效憑證；瀏覽器用 WebRTC 連接。`get_page_context` 取得畫面欄位、`propose_ui_action` 顯示操作確認卡。掛斷、關閉助理、換頁或切換登入會關閉連線與麥克風；單次通話最多十分鐘。
- 主動訊息：進入切片頁時由程式詢問用途，每個瀏覽器 session 一次，不呼叫模型。用途可手動填入切片欄位，或請助理提出填入操作。
- 切片前建議：僅在已填用途、已登入且按下切片時呼叫較小模型，輸入用途、材料、填充、壁數與模型外框尺寸。可選套用填充建議後返回編輯、依原參數繼續或返回修改。同樣的輸入在目前助理 session 快取最多二十份，減少重複請求。沒有足夠受力資料時應回覆資訊不足，不能當成強度驗證。
- 成品示意：切片完成後可手動生成，或事先勾選自動生成。實際三維模型畫面會先由 WebGL 渲染，再擷取成 PNG 送給 OpenAI 圖片生成工具。輸出標示 AI 示意並可下載；變更模型／參數後清除舊示意。這不是實體照片，也不是尺寸或表面品質保證。

目前填充／壁數是同盤共用參數；助理要說明會影響同盤模型，不能假裝已有每個物件的獨立覆寫。沒有用途、未登入或建議服務失效時，不阻斷原有切片流程。

## MCP

使用者建立具名憑證，僅在建立時顯示原文；資料庫保存 SHA-256 雜湊，30 天到期，可撤銷。會員和員工身分分開，員工使用 `staff:` 命名空間，兩種登入不能互換管理 API。

連線頁提供 HTTP endpoint 與 Authorization header 設定；適用支援遠端 HTTP MCP 及自訂 Bearer header 的客戶端。此版本沒有 OAuth discovery／授權流程，因此不能宣稱能直接接上所有要求 OAuth 的 ChatGPT 連接器。

實作 JSON-RPC `initialize`、`ping`、`tools/list`、`tools/call` 與通知回應；協定版本為 `2025-03-26`。共同媒體類型為 JSON，無 SSE 工作階段。

| 工具 | 功能 |
| --- | --- |
| `get_workspace` | 取得本人最近 30 秒內更新的頁面欄位；需要開啟網站助理 |
| `propose_ui_action` | 提出 fill/click 操作，回傳 pending，不冒充已執行 |
| `get_action_status` | 查詢本人操作的前端執行／拒絕狀態；實際業務是否成功仍須檢查頁面／API 結果 |
| `create_name_badge` | 產生含底板、凸字與可選吊孔的參數化 OpenSCAD 原始碼 |

外部操作有 60 秒確認期限，每位使用者最多二十項未到期提案；前端執行前先原子認領，第二個分頁無法再次認領。命令不會在伺服器自動重送；機台、訂單、付款等實際狀態仍以既有業務 API 驗證為準。

## 模型 skill 與姓名牌

會員／員工可下載 `SKILL.md`，交給外部 Agent 依程序確認尺寸、建立參數化模型、輸出 STL／3MF 並交接網站。這是可使用的工作指引，不代表伺服器自動執行任意 CAD 程式。

姓名牌工具與會員頁可下載 `.scad`，預設 80 × 28 mm、底板 2.4 mm、凸字 0.8 mm。寬高有範圍驗證，文字以字串轉義，不執行模型提供的任意 shell／CAD 指令。使用者須用 OpenSCAD 和可用的中文字型檢查文字範圍，再匯出 STL、上傳切片。此版沒有瀏覽器內直接編譯 SCAD→STL，也未將參數化模板宣稱為任意文字／圖片生成 3D 模型引擎。

## 權限、成本與驗證界線

- 自動掃描畫面與 MCP 輪詢不呼叫 OpenAI。開啟助理後才更新畫面上下文；目前每次最多 150 個可見欄位，略過密碼、憑證、付款及不可操作欄位。
- 支援原生文字／數字／選項／勾選與按鈕、站內路由連結；檔案選擇器需本人操作。Canvas 中的面上色、拖曳、沒有可讀標籤的自訂控制，以及超過欄位上限的部分不應宣稱全覆蓋；需要逐項加專用工具。
- 每個使用者每日預設最多 50 次 provider 請求，圖片最多 3 次；失敗嘗試也占用額度。這是請求額度，不是精確金額上限，還應在 OpenAI 專案設定支出預算。語音媒體流的分鐘費用不等於建立連線的一次請求。
- Responses 使用 `store:false`；權杖、上下文、操作與使用額度不加入一般 `/api/state` 或即時廣播。備份與工作區匯出／還原沿用受驗證的管理流程。
- API provider 有逾時與統一錯誤訊息，不向瀏覽器轉送 OpenAI 原始錯誤或長效金鑰。操作畫面／登入變更會取消舊操作；MCP 操作仍受現有站點租約與業務權限限制。

本次以隔離 API、provider fixture 和瀏覽器驗證程式流程。**尚未使用正式 OpenAI 金鑰驗證語音品質、模型可用性、圖片忠實度與真實帳單，也未部署至正式主機。**「程式可建置與測試」不等於「已完成正式上線驗收」；設定金鑰後應以實際服務、HTTPS、目標裝置與團隊常用 MCP 客戶端完成驗收，再開放使用者。

## 驗證入口

- `api/site-agent.test.mjs`：未設定服務、權杖雜湊／撤銷、會員隔離、重複認領、輸出目標白名單、額度及姓名牌輸入。
- `api/site-agent-integration.test.mjs`：正式伺服器的會員／員工隔離、私有資料不廣播及員工 MCP 權杖。
- `scripts/check-site-agent.cjs`：本機瀏覽器，包含 MCP 管理、skill 下載、實際 Vue 填充更新、用途建議、圖片擷取／生成流程、語音工具 fixture 與手機排版。測試來源明確為 fixture，不是現場列印或真實通話。
