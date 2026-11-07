# 管理端導覽與智慧工場展示

- 日期：2026-11-07，Asia/Taipei；Codex；ADMIN-DEMO-20261107-04。
- 基準：main d929ebe；起始乾淨，fetch 與 origin/main 一致。提交隨本紀錄。
- 狀態：程式與本機驗證完成，交付 main；未部署。

## 需求與修改

使用者明確要求管理端分類／統一圖示與排版，並先以資料、生成示意圖實作監控、從歷史與日誌推估保養／日曆、多角度視覺品管的可操作 demo。

- `VabSide`、`VabTop`、`VabSubmenu`、router：六個可收合母分類，保留各 route scopes，新增智慧工場子頁；修正原 submenu 元件名稱為 Element Plus 的 el-sub-menu。免費站點／會員服務／MCP 改用不同語意圖示。
- `layouts/index.vue`／`styles/admin-workspace.css`：只在管理 wrapper 統一表格、工具列、選中顏色與圖示間距。品牌 token 沒改，會員／官網不受 selector 影響。
- dashboard／printers／maintenance：新增明確展示入口、設備／維修頁標題；保留所有正式功能。
- `views/operations/`：同一工作台的監控、保養日曆與品管；機台篩選／回放／日誌、歷史依據／時段衝突、轉盤拍攝／3D 參考／缺陷框／人工複核／下載／重設。
- `utils/operations-demo.mjs`：隔離合成資料、可測的推估／排程與品管守門；不引用、寫入或冒充正式 API 狀態。
- `public/images/operations`：圖片模型生成三組 2×2 素材，WebP 約 536 KiB 合計；已檢視內容，標為示意。幾何未配準，不作真品管證據。
- `docs/operations-demo.md`：演示流程、前端／後端界線、研究來源、測試及伺服器交接。

## 保留與決策

遵守 D-001～D-012，新增使用者本輪授權的 D-013。管理版型此次獲明確重設授權；保留首頁共編成果、會員、聊天框、真切片 profile、定價、Google／Telegram／正式 API。沒有依賴變更或資料庫 migration。新增的展示結果不進真歷史或模型訓練資料。

## 驗證

- `npm run build` 成功；既有 deep-selector deprecation 警告保留。
- `npm test -- --maxWorkers=2`：61 檔／456 項通過。後續補有效日期檢查，再跑 operations-demo／admin-workspace 相關測試。
- `scripts/check-operations-demo.mjs`：真暫存 API／demo 虛構帳號登入、1440×1000 桌面與 390×844 手機、母子選單、回放／篩選、保養重疊、刷新、品管三種情境、複核必填、下載、重設；監測未發送業務寫入，無 pageerror 或 HTTP 失敗。以條件等待路由與 Vue 轉場；初跑測試 selector 錯計了巢狀 submenu，及刷新／轉場未等完成，已修正驗收腳本。
- 手動檢視桌面監控、保養、品管及手機截圖。暫存證據 `/tmp/3drfm-operations-evidence/`，日誌 `/tmp/operations-{build,tests,focused,browser}.log`。無開工前截圖，舊版以基準 commit 核對。
- 未使用真攝影機、轉盤或印表機；未呼叫真 OpenAI 品管推論。只有本輪素材由圖片工具生成。

## 交接

見 H-015。前端展示已完成不表示真品管或預測後端完成，也不表示 farmflow 網站已更新。部署者需依原流程發布前端與三張圖片，保留外部切片設定。保養模型校準、真多角度資料／幾何配準、人工驗收與營運成本另測。
