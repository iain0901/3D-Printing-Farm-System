# 目前分工與修改範圍

更新日期：2026-11-02（Asia/Taipei）。這是協調板，不是互斥鎖；未登記也不代表沒有人在其他電腦修改，開始前仍須核對 Git 與目標檔案。

## 目前作業

PUBLISH-20261102-01｜本對話 Codex｜整合完成、本機驗證通過、交付 main｜使用者明確要求「請推送新版」，本輪將同任務先前保留的 AI-20261025-03／04 與 SLICE-20261102-01 一併提交交付，保留遠端四筆首頁更新。整合後建置成功、50 檔／392 項測試通過；沒有正式部署、真實 AI／機台操作或隔離姓名牌 STL。下方「未提交／未推送」是各批歷史狀態，實際交付 SHA 以 GitHub main 及 [推送紀錄](changes/2026-11-02-codex-main-publish.md) 核對。

SLICE-20261102-01｜本對話 Codex｜待整合／待原始設定包與正式驗收｜基準 504a774，origin/main 已有四個首頁 UI 提交至 ade8131；保留所有前輪未提交成果及首頁，不強制合併／推送。已改設定包契約、worker 無回退、Creality Hi 0.4 mm／3DSTU_PETG、實際總耗材每克 NT$2、工作台真切片報價／案件驗證及伺服器交接。建置、50 檔／391 測試、付費流程七項 fixture 瀏覽器檢查通過；沒有生產設定、真 Orca／硬體或部署驗收。見 [紀錄](changes/2026-11-02-codex-published-slicer.md) 及 [Bot 訊息](../docs/server-bot-slicer-handoff.md)。

AI-20261025-04｜本對話 Codex（海報精確清單續作）｜待整合｜同一未提交工作區、基準 504a774：依智在必型 v7／Library v6 清單，擴充模型＋切片審查／壁數、付費工作台 AI 預覽、四維排程、FDM Skill ZIP、多模態維修診斷與同型跨機保養推估；不把規則／最佳化冒充模型推論。與 AI-20261025-03 為同一作者同一工作區的後續，保留前輪語音修正及協作者 UI，不另建替代任務。姓名牌新增 STL 保持專案外隔離；未推送、未部署。逐項證據見 [海報驗收矩陣](../docs/poster-ai-acceptance.md)，驗證收尾見 [本輪紀錄](changes/2026-10-25-codex-poster-ai.md)。

範圍更正（2026-10-25）：原始使用者只提「身份名牌的生成」，沒有明確提出實體姓名牌、SCAD 或 STL 匯出。本輪姓名牌相關擴充已依協調者要求停止；現有檔案保留未提交，不得把前輪助理摘要當作需求批准，也不要推送或整合此部分。其他明確的 Agent 操作工作可繼續。

AI-20261025-03｜本對話 Codex（原任務續作）｜待整合｜基準 504a774：保留 OpenCode UI；只交付語音／建議非同步隔離、身分隔離及過期建議保護。本輪新增姓名牌 STL 已隔離至專案外可還原 patch，不在整合清單，既有 SCAD 未動。隔離後 QC 45 檔／359 項及兩組瀏覽器腳本通過；未提交、推送或部署。詳見 [續作紀錄](changes/2026-10-25-codex-agent-continuation.md)。
UI-20261025-05｜MichanLiang／Devin｜待整合（未部署）｜基準 1e1cb3e：只改首頁 `frontend-vue/src/views/landing/Index.vue`「01 製作的可能」（`#services`）版面：標題靠左、兩案例等寬同結構、手機單欄；設計師同意本區可高於一屏。不改文案、圖片、後端、API、共用 token。詳見 [修改紀錄](changes/2026-10-25-michan-devin-home-services-layout.md)。

UI-20261025-04｜MichanLiang／Devin｜待整合（未部署）｜基準 8390f36：只改首頁 `frontend-vue/src/views/landing/Index.vue`「03 開始製作」區塊版面，01～04 步驟欄加寬；761～1100px 步驟圖改放文字下方。不改文案、後端、API、共用 token、`public-readability.scss`。詳見 [修改紀錄](changes/2026-10-25-michan-devin-home-commission-width.md)。

UI-20261025-03｜MichanLiang／Devin｜待整合（未部署）｜基準 90848b6：只改首頁 `frontend-vue/src/views/landing/Index.vue`，修正開啟即下滑、頂欄蓋住首屏（scroll-padding、實測頂欄高度、矮螢幕首屏字級）。不改後端、API、路由、共用 token、`PublicShell.vue`。詳見 [修改紀錄](changes/2026-10-25-michan-devin-home-snap-top.md)。

UI-20261025-02｜芯寧／Cursor｜待整合｜基準 504a774：只改首頁 `frontend-vue/src/views/landing/Index.vue` 呈現。刪多餘小字與產量說明、單屏區塊＋scroll-snap、3D 物件改放材料／FAQ／收尾。不改後端、API、script 業務邏輯、共用 token、路由。詳見 [修改紀錄](changes/2026-10-25-xinning-home-panels.md)。

UI-20261025-01｜OpenCode｜待整合（視覺審閱與正式部署）｜基準 cd65d378：依「網站改善.docx」完成前端呈現調整與本機驗證，詳見 [修改紀錄](changes/2026-10-25-opencode-public-ui.md)。不改後端、API、權限、切片運算或預設設定；正式產量、交期／尺寸資料與實機展示待 H-004。保留 AI-20261024-02 的 Agent／系統成果；未代替原作者宣告部署完成。

AI-20261024-02｜本對話 Codex｜待整合（正式服務驗收）｜基準 b52d109：已實作會員／員工 MCP、模型 skill、OpenAI 網站 Agent、事件觸發建議、語音及圖片串接，並完成隔離測試。使用者後續自行填入 `.env` 金鑰，正式 OpenAI 與部署驗收待完成；詳見 H-003。沒有宣告所有自訂控制已覆蓋。UI/UX 協作者範圍仍待認領。

## 完成紀錄

| 工作 ID | 工作者 | 範圍 | 基準 commit | 狀態 | 修改紀錄 |
| --- | --- | --- | --- | --- | --- |
| COLLAB-20261024-01 | 本對話 Codex | 新增共編規則、紀錄資料夾與 README 入口；不改網站 UI 或功能 | `e9803ae` | 已完成 | [建立共編紀錄](changes/2026-10-24-codex-collaboration-records.md) |

## 待認領，不是已開工

- UI/UX：由使用者與協作者決定頁面、元件及樣式範圍後，新增自己的工作列。
- 印表機／攝影機後端：已有串接契約，實際連線工作尚未在此分派。

## 登記方式

狀態使用「進行中／待協調／待整合／阻塞」；完成或取消時將摘要移至完成紀錄，保留詳細修改日誌。不替別人宣告完成，也不以過期登記作為覆寫他人程式碼的理由。

每列至少填：唯一工作 ID、工作者、具體檔案或元件／區塊、基準 commit、狀態、預期影響及是否碰共用樣式。若兩人碰到同一檔案，要寫明區塊如何分工；同一檔案即使 Git 沒衝突，也可能存在設計或行為衝突。
