# 管理工作台與有效時段機台控制

- 日期：2026-11-04（Asia/Taipei）；Codex；ADMIN-20261104-04。
- 基準：e4c2c37；開工 worktree 乾淨，fetch 前後遠端未前進。commit 隨本紀錄，以 git log 查詢。
- 狀態：程式與本機驗證完成，交付 main；未部署或實機驗收。

## 目的與授權範圍

使用者要求管理儀表板重設並納入新功能；會員輪到免費列印時才出現控制，選取排到的檔案、進退料、移軸、歸零及即時影像。這不是正式部署或實機操作授權。本輪遵守雲端 runtime 規範，只用 localhost／fixture，不改正式設定。

## 修改內容

| 檔案／元件 | 改動與原因 |
| --- | --- |
| views/dashboard/index.vue、utils/admin-workspace.mjs | 移除 Phase 待啟用按鈕；改成真實 store 指標、優先處理、免費站點摘要與接單／生產／AI 功能入口；連線不明不顯示假零值。保留既有排產、維修與 Agent 實作，不重做演示功能。 |
| dashboard/Station.vue、AgentTools.vue、router/index.js | 免費站點管理與員工 MCP／Skill 獨立頁，沿用現有元件。站點仍限管理員，功能捷徑遵守 scopes。 |
| layouts/index.vue、VabSide／Nav／Avatar／Logo | 管理側欄分組、頂欄通知、可鍵盤聚焦的帳號與功能選單、設定入口，品牌回管理總覽。手機初始／縮窄時收合，導航後關閉；修掉舊 Vue 標誌與部分簡體文案。 |
| FreePrintStationAdmin.vue | 現場異常優先、歷史可收合、設定與串接說明收合、檔名與工時，結束時段前二次確認。 |
| portal/FreePrint.vue | 有效本人時段才顯示影像／控制；準備時單選已排隊檔案並安全確認；顯示軸座標；過期／狀態更新失敗立即收權並清空確認。列印中只提供對應操作。 |
| api/free-print-station.mjs | 只在本人結果提供綁定檔案資訊，新增排隊時來源模型名稱快照。start 可帶 selectedFileId 且不得換檔；期限無效／attention 不開影像。硬體端仍取伺服器綁定檔案。 |
| AgentConnections.vue | 修正員工 MCP 設定錯誤使用會員端 URL，現在依身分輸出。 |
| 測試與交接文件 | 新 admin-workspace 測試、擴充站點 API 測試、新瀏覽器腳本；舊會員／影像／完整流程 fixture 同步檔案選取與導覽。 |

## 保留的設計與相容性

遵守 D-001～D-008；本輪新增 D-009，只重設管理範圍與會員時段頁。保留官網、會員首頁、品牌 token、每克 NT$2、3DSTU_PETG／Creality Hi 設定包、Google、Telegram、原排單與 Email 流程。不加依賴、不改資料庫歷史價格、不修改伺服器 profile 或憑證。舊會員服務頁保留站點元件，新增獨立入口。

新版前端依賴 API 的 printFile；更新必須前後端同版。舊前端可省略 selectedFileId，但後端仍只送本時段固定 G-code，並非開放任意檔案。新前端遇舊 API 缺檔案資訊時阻擋開始，明確提示。

## 驗證

- `npm run build` 成功，`/tmp/admin-station-build.log`。
- `npm test -- --maxWorkers=2`：54 檔／415 項通過，`/tmp/admin-station-final-tests.log`。包含自己的檔案資訊、換檔拒絕、準備／進退料／移軸限制、無效期限與影像授權。既有全回歸使用 mock／隔離資料，不是實機命令。
- `scripts/check-admin-station.mjs`：localhost 靜態站＋明確 API fixture；管理 1440／390 px、所有新路由、員工 MCP URL、Viewer 不顯示／不請求站點管理；會員排隊隱藏、報到、選檔、X 軸與進料、checks→start 綁定檔案、列印中隱藏準備控制、更新失敗／過期收權、取件結束，零 JS error。結果 `/tmp/admin-station-browser.log`。設定 PLAYWRIGHT_MODULE、CHROMIUM_PATH 指向已安裝工具即可重跑。
- `scripts/check-free-print-camera.cjs`：隔離暫存 API／會員，18 類 fixture 影像流程通過，包括 snapshot、MJPEG、比例、全螢幕、續期、320／390 px、延遲命令、離線停用、取消確認、交棒、延遲回覆及登出撤權；`/tmp/admin-camera-regression.log`、截圖 `/tmp/3drfm-camera-7FwHf7/`。
- `scripts/check-member-home.mjs` 保留原會員導覽回歸；首頁標題調整後同步精確 selector，結果 `/tmp/admin-member-regression.log`。
- 手動檢視管理桌面／手機與會員準備頁截圖。中途發現手機側欄遮內容，已修正並加入斷言；最終截圖目錄記於 browser log（暫存非永久團隊附件）。沒有本輪開工前截圖，舊版以基準 commit 核對。
- `check-free-print-session.cjs` 只同步 fixture 的 printFile 與單選，未重新跑包含全部切片操作的舊長流程；本次從站點到交棒已由新腳本覆蓋。無真實 SMTP、OpenAI、MCP 外部客戶端、攝影機或機台驗證。

## 待辦與交接

H-011 與 docs/free-print-frontend-integration.md：前後端同版部署、保留既有 profile／密鑰。機台校準未提供可執行命令，UI 說明由站點協助；須確認 Creality Hi 韌體、專屬校準指令與完成回報，不能用歸零假裝校準。攝影機仍需受保護媒體代理與後端撤權；畫面比例／全螢幕不等於實體雲台／曝光或錄影儲存。本輪未操作硬體、部署或新增外部憑證。視覺仍待使用者審閱。
