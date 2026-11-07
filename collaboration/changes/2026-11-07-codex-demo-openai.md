# 修改紀錄：可操作展示資料與 OpenAI 接線核對

- 日期：2026-11-07（Asia/Taipei）；工作者 Codex；工作 ID DEMO-AI-20261107-01。
- 基準：main ae868a4，起始乾淨；本輪未覆寫其他人的未提交修改。提交隨本紀錄，實際 SHA 用 git log 查詢。
- 狀態：本機程式與測試交付；遠端部署及真實服務驗收未完成。

## 授權與保留

使用者要求真實模型、完整虛構展示訂單、讓排程有意義的情境，以及七項 AI 後端與 OpenAI 成本選型；確認載入目標為 farmflow.3dstu.com。沿用 D-001／既有 UI 保護、D-006 的真設定包／NT$2/g、D-010 的金流範圍。沒有重設官網、會員版型、導覽、設計 token 或機台 profile，沒有啟動硬體、付款、寄信或 OpenAI 付費請求。

## 改動

- `demo/`：原作者 6 個 STL、GPL 授權與 4 個 Inventor 原始檔、SHA manifest；獨立目錄資料建立與啟動、角色／帳號／案件／訂單／排程／專案／草稿／庫存／免費排隊／保養／售後情境與操作腳本。模型和草稿走會員實際 API，不只是加假清單。
- `api/demo-safety.mjs`、server：demo 標記與顯式啟動雙向核對，副作用白名單；保留本機即時 UI 更新，禁止硬體／通知／付款／worker／還原。展示文件清楚標為非真實交易。一般服務行為不受 marker 以外影響。
- `DemoNotice.vue`／App：僅展示環境顯示固定提示，正常站點不顯示；沒有改既有樣式 token。
- `openai-models.mjs`、site-agent、ai-engine、維修顧問、env／Compose：文字 Luna、視覺 Terra、Realtime mini、Image Flare 分流，可覆寫；圖片真正走 Images edits；舊客服沿用 OPENAI_API_KEY，補 JSON 指示與逾時。
- 維修顧問：完整觀測匯出與確認封存，digest 防止封存時漏掉新資料，保留歷史、排除封存資料並令舊預估失效。UI 僅補這兩個操作，未重設維修頁。
- 驗收與伺服器交接：`docs/openai-demo-readiness.md`、`demo/README.md`、`demo/SERVER_BOT_HANDOFF.md`；既有海報矩陣補新版本連結，不抹掉歷史界線。

## 驗證與證據

- 建置 `npm run build` 通過；原有 Vue deep-selector deprecation 警告仍在，未順便改版型。
- 全套 `npm test -- --maxWorkers=2`：58 檔／444 測試通過。新測試涵蓋真模型 hash／格式、來源關聯、會員隔離、接受報價建單、排程／困難緩衝／硬性排除、拒絕覆寫、demo 副作用封鎖、模型分流／Images multipart、觀測封存及舊結果失效。
- 初跑發現部署範本測試仍要求 AI_PROVIDER=disabled；配合新 OpenAI 預設更新契約後重跑。瀏覽器抓到管理員 2FA 卡關及過嚴 demo guard 擋本機 events/token；改為提供 Operator 帳號、保留真 2FA，僅開放本機事件票券／唯讀清單，沒有降低正式安全要求。
- 瀏覽器：既有安裝 Playwright＋Chromium，真表單登入、會員資料、STL 下載、草稿、1440×1000 桌面／390×844 手機、員工案件、實際按最佳化、保養推估／觀測下載。沒有 pageerror 或主流程 HTTP 錯誤。腳本 `scripts/check-demo-browser.mjs`，證據 `/tmp/3drfm-demo-evidence/`（暫存工作區，非已發布網址）。
- 官方模型／價格查核來源與日期見 AI 文件；未做模型品質／花費實測，不能宣稱最新型號對該帳號必定可用。
- 遠端只做公開 `/api/health` GET：farmflow 是 PostgreSQL。**沒有遠端寫入、部署、SSH、主機設定修改、真 OpenAI 或實機驗收。**

## 未完成及交接

- H-013：伺服器 BOT 依交接檔發布隔離 demo、確認測試域名 upstream／回復；使用者提供專用 AI key 與測試預算。不得把本機 DB 直接覆蓋遠端 PostgreSQL。
- 三維畫布手勢的完整 Agent 工具、真 MCP 客戶端／語音／圖片品質、真機觀測與參數校準仍有驗收或程式界線，矩陣明列，不說七項全部只差 key。
- 本包的工時／克數／付款與設備狀態是示範；免費站點 G-code、實機租約、通知、實際列印須另驗。不讓合成資料成為正式計費或機台控制依據。
