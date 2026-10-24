# OpenAI 網站 Agent、MCP 與切片事件串接

- 日期：2026-10-24（Asia/Taipei）
- 工作者：本對話 Codex；工作 ID：AI-20261024-02。
- 基準 commit：b52d109；本次 commit：隨本紀錄的提交。
- 狀態：程式整合與隔離驗證完成，正式 OpenAI 驗收與部署待完成。

## 目的與範圍

依使用者要求新增會員 MCP、模型 skill、姓名牌、右下角文字／圖片／語音助理、可見網站操作、程式事件觸發的用途建議與成品示意圖。使用者指定 OpenAI，金鑰之後自行填入 `.env`。

## 修改內容

- `api/site-agent.mjs`：登入隔離、MCP JSON-RPC、具名短效可撤銷憑證、操作提案與認領、Responses／Realtime／圖片生成、額度與結構化判斷。
- `api/name-badge.mjs`：具尺寸限制與文字轉義的可編輯姓名牌 CAD 原始檔。
- `api/server.mjs`：註冊會員／員工入口、集合備份與工作區隔離，從一般狀態廣播排除助理私有資料。
- `SiteAgent.vue`、`siteAgent.js`、`App.vue`：全站助理、頁面控制探索與可見操作、語音工具、圖片輸入、用途建議卡。
- `AgentConnections.vue`、`Workspace.vue`：會員 MCP 分頁、憑證管理、skill／姓名牌下載；員工可經助理開啟相同介面。
- `SlicerLab.vue`、`ToolpathViewer.vue`：用途欄位、切片前事件、選用自動生成示意、真實三維畫面擷取與過期圖片清除。
- `.env.example`、`docker-compose.yml`：OpenAI 與各用途模型設定，金鑰只傳至 API。
- API CSP、Ubuntu Nginx 範本與 `scripts/provision-tenant.sh`：允許 OpenAI WebRTC 必要連線與本站麥克風權限；既有 Nginx 設定需同步更新後 reload。
- 測試與 `docs/site-agent.md`：驗證與實際支援範圍、串接方式及未驗收事項。

## 保留的設計與相容性

遵守 D-001～D-004；不重設官網／會員共用圓角、色彩或導覽。助理為新增獨立浮動元件，既有模型、上色、手動切片、站點控制及 Telegram 設定保留。填充仍是同盤共用設定，助理不得假裝已存在逐模型覆寫。

## 驗證

正式建置通過；完整測試 45 檔、359 項通過；後續新增的權限／MCP 調整另以助理單元與整合測試 6 項驗證。瀏覽器確認 MCP 建立／隱藏／撤銷、skill 下載、實際 Vue 填充修改、語音工具及麥克風收尾 fixture、用途建議套用／繼續、真實模型畫面擷取及圖片服務 fixture，包含 320／390／1440 px。既有完整自助列印流程回歸通過。只有 fixture 的項目不得寫成實際 OpenAI 或實機驗證通過；截圖位於本機 `/tmp/3drfm-agent-ui-*`，非長期團隊分享位置。

## 交接

金鑰由使用者自行在部署 `.env` 設定，程式不提交密鑰。正式模型可用性、語音與圖片品質、HTTPS、實際 MCP 客戶端與上線部署待驗收。姓名牌目前輸出 SCAD，仍需 OpenSCAD 匯出 STL；特殊 canvas 操作與無標籤自訂控制需專用工具。詳細界線見 `docs/site-agent.md`，不可宣稱已支援所有客戶端／全部網站控制或完成正式上線。
