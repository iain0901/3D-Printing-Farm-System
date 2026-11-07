# 智在必型 v7：網站 AI 功能逐項驗收

> 2026-11-07 更新：下表保留 10/25 歷史驗收。現行 OpenAI 模型／Images edits 接線、跨機觀測匯出封存與展示包驗收改見 [最新核對](openai-demo-readiness.md)。先前「等待新機型設定」已由後續 Creality Hi／3DSTU_PETG 設定包契約接手；是否在站點真正掛載仍需部署查核，不以本機資料包判定。

2026-10-25，基準 main 504a774。需求來源為使用者「所以你看海報上說的AI功能要讓這個網站都有」，由協調者提供 Library version 6 原文清單。此文件記錄程式證據，不把海報、按鈕或測試 fixture 當成真實服務已驗收。

狀態：**部分**＝已有可運行流程但仍有明列限制；**本機已測試**＝合成資料／注入 provider 或 localhost 實際 HTTP；**待真實驗證**＝尚未呼叫正式模型／機台／指定客戶端。沒有任何項目被宣稱已部署。

| 海報項目／入口 | 資料流與實際機制 | 成功／失敗驗收入口 | 持久化與刷新證據 | 狀態／限制 |
| --- | --- | --- | --- | --- |
| 01 MCP 外部代理；會員「MCP 與模型 skills」、員工助理同名入口 | `api/site-agent.mjs`；HTTP JSON-RPC 初始化、工具列舉、get_workspace／propose_ui_action／get_action_status；會員／員工 token 命名空間與 workspace 隔離。前端認領後確認操作，未確認為 pending | `api/mcp-http-protocol.test.mjs` 真正 localhost HTTP 交換協定訊息，不是 REST 範例；現有 site-agent tests 驗證撤銷、跨會員拒絕、未知控制拒絕、重複認領 409 | agentTokens 僅 hash；agentCommands 保存 pending／claimed／completed／rejected；context 有效期 30 秒；不進一般 state／廣播 | **部分、本機已測試、待真實驗證**。支援 JSON response 的 HTTP MCP + 自訂 Bearer，沒有 SSE／OAuth discovery；未拿目標外部客戶端做互通。既有 create_name_badge 為前輪功能，不是本輪新增 STL 的授權 |
| 02 站內操作 Agent；右下角助理文字／圖片／語音 | `SiteAgent.vue`、`utils/siteAgent.js`；Responses 提案當前可見控制 ID；本人確認後捲動／聚焦／外框標示，再派發真正 Vue input/change/click。語音 Realtime 使用短效憑證，同一確認流程 | `check-site-agent.cjs` 實際 Vue 填充變更、刷新一致；`check-site-agent-lifecycle.cjs` 七項非同步生命週期；錯誤／換頁／換登入取消，範圍與 min/max 檢查 | 平台原有設定恢復及業務 API 保存；MCP 執行狀態入 agentCommands。click 完成僅代表派發，業務成功需看真正 API／頁面，不冒充支付或列印成功 | **部分、本機已測試、待真實驗證**。最多 150 可見控制；面選取／拖曳等三維手勢沒有專用工具。敏感欄位、付款、檔案挑選不代理。語音品質／真麥克風與供應商可用性未驗證 |
| 03 觸發式設定檢查；雲端切片「開始切片」、付費代印「確認設定」及登入後送出需求 | `SlicerLab.vue`／`quote/Workbench.vue` → 事件 → `SiteAgent.vue` → `/review`。用途、目前旋轉後外框、三角面數、geometryHash + 材料／層高／填充／壁數／支撐共同送出。後端外框／細高規則獨立列出，較小 OpenAI 模型解讀用途與落差，可提填充及壁數，非規則冒充 AI | `site-agent-provider-contract.test.mjs` 驗證實際後端模型請求與 no-store；browser 驗證套用、繼續、過期結果拒絕及保留新值。模型／用途／參數／登入／配色改變後不採用舊結果 | 私有 agentReviews 每位最多 20 筆，包含輸入 digest、模型證據、規則、模型名稱與結果；GET `/api/customer/agent/reviews`，員工同路徑前綴。按鈕事件觸發、相同輸入 session cache，不持續監控 | **部分、本機已測試、待真實驗證**。外框不是壁厚／流形／內部網格分析，沒有受力資料不能保證承重；沒有假裝做過 FEA。付費新機型真切片仍等待原約定的後端設定，未偷用免費設定 |
| 04 AI 效果預覽；切片完成後、付費代印工作台「生成目前模型的 AI 列印外觀預估」 | 真 WebGL 畫面（含當前配色）擷取 PNG → `/illustration` → OpenAI image_generation，不是 WebGL 本身冒充生成。材料與目前層高／填充／壁數／支撐附於請求；變更後清除或拒絕晚到結果 | provider-contract 驗證 image tool、參考圖與額度；`check-poster-ai.cjs` 驗證實際 Stage 擷取／設定與變更失效，生成端使用明示 fixture。原切片自動示意流程亦回歸 | 原模型、配色、設定隨既有草稿恢復；AI 圖目前為當次畫面／可下載檔，**不宣稱已做永久圖片資產庫** | **部分、本機已測試、待真實驗證**。需驗證圖片模型權限、忠實度與費用；標示預估非實拍，無法保證尺寸／強度／表面。不可宣稱看到內部填充 |
| 05 多維智慧排產；員工「排程→多維排產」 | `/api/schedule/optimize` strategy multi-factor。現有訂單／報價生成的 queue 依交期、難度、工時排序，以材料／顏色換料成本及負載選機。難度為員工 1–5 或支撐／細高／後處理規則；每級加 5% 排程預留，獨立顯示，**非學習失敗率**。LP 策略仍為整數規劃 | `poster-ai-acceptance.test.mjs` 分別控制交期、工時、難度、顏色，驗證非 FIFO、預留改變下一工位時間、同一 sourceOrderId/sourceQuoteRequestId queue 被更新；server 原有測試驗證排程事件、持久化及材料預留 | 現有 queue 保存 printerId／scheduledStart／optimizationStrategy，來源訂單連結不變；API dispatchEvent 後資料庫 write；刷新讀取相同既有 queue | **本機已測試、待營運驗證**。這是可解釋規則／最佳化，不稱訓練模型或保證最優實際產能；需用真切片工時、換料時間與人員作業校準 5% 預留。未啟動印表機 |
| 06 使用者建模 Skill；會員／員工「下載 FDM 建模 Skill 套件」 | GET `/skills/model-package` 輸出 ZIP，含 SKILL.md、README、Node 二進位 STL 數值／外框檢查腳本與 SHA-256 manifest。用途釐清→既有 CAD→保存原始檔→檢查→本人匯入→真切片／報價→訂單 | `poster-ai-acceptance.test.mjs` 驗證實際 ZIP 檔、腳本、安裝路徑及 manifest；browser 驗證登入下載。原單檔 SKILL.md 保留 | 使用者保存下載檔及自己的 CAD／STL／3MF；既有草稿／模型庫處理上傳。平台不假裝在伺服器執行任意 CAD | **部分、本機已測試、待目標工具驗證**。提供 Codex `.agents/skills`、Claude Code `.claude/skills` 人工安裝路徑，不保證所有版本、聊天工具或 ZIP 匯入皆可用；模型品質依目標 CAD 與切片器驗證 |
| 07a 日誌＋試印照片診斷；員工維護→設備診斷顧問 | `maintenance-advisor.mjs` `/diagnose`；需要 maintenance:write、選擇同工作區機台、日誌與照片同時提供、使用者同意發送。Responses 真多模態請求；每個假說須同時引用有效 logIds 與 photoIds。日誌遮蔽常見密鑰格式；使用者仍須先審查 | `maintenance-advisor.test.mjs` 權限／跨工作區／缺照片／未設定 key 不呼叫、日誌與圖片同時送出、虛構引用 502、保存後重讀。provider 是注入 fixture，不是已診斷真機 | 私有 maintenanceAdvisorRecords 保存已遮蔽日誌、照片 hash、來源 digest、模型名、假說與不確定性；照片原圖不長期保存，需使用者保留原始檔。一般 state 不揭露私有紀錄 | **部分、本機已測試、待真實驗證**。20 請求／工作區／日，逾時 60 秒；每次最多 3 張 1 MB。不得把網路 bridge test 或維修 CRUD 當 AI 診斷。常見遮蔽不是全資訊 DLP，實務須人工移除個資 |
| 07b 跨機保養推估；同頁觀測 JSON 與重新推估 | `/observations` 保存真實累計列印工時／異常事件／日期／保養標記；`/forecast` 僅取同機型跨機觀測，用完整保養間隔及相近事件負擔加權分位數，推估剩餘列印小時區間。非固定週期表，非訓練 AI 壽命模型 | maintenance-advisor tests 控制多機不足、相同機型限制、工時／新事件改變估計與 digest、反向計數拒絕、保存重讀；browser 驗證資料不足與刷新一致 | 同一私有 collection 保存觀測、forecast sourceDigest／樣本數／機台數／引用區間。確認後 `/reports/:id/task` 建立真正 maintenance 任務、連結 advisorReportId；重複不重建、舊觀測／舊建議 409 | **部分、本機已測試、待真實資料驗證**。至少兩台其他同型機、三個完整保養間隔；目前每工作區最多 200 觀測，計數器重設需另建設備紀錄。尚無機台自動採集接入；資料不足明示需求，不捏造準確率、故障時間或壽命 |

## 整合邊界，不是七個獨立展示

- 付費報價工作台的用途使用既有製作備註，審查在確認與送出需求之前執行；修改後回編輯。雲端草稿與案件仍走原 member-workspace → cases → order／queue 流程。
- SlicerLab 真切片結果沿原切片／報價流程；AI 只說明用途落差及外觀，不偽造切片的克數、工時或價格。報價仍依既有材料、切片工時與風險明細，由原 pricing/case 流程處理。
- 多維排程直接更新原 queue，保留 sourceOrderId／sourceQuoteRequestId 及現有材料預留／審計。
- 維護建議只有「人工確認後建立檢查任務」；沒有發送 G-code、軸移動、加熱、進退料或啟動列印。它不自行把設備標成已修好或改寫機台安全狀態。

## 仍需外部驗收與不能宣稱的事項

1. `.env` 使用既有 OPENAI_API_KEY；維修模型可選 MAINTENANCE_AI_MODEL，未設則沿 SITE_AGENT_MODEL。不可在聊天貼金鑰。真實文字／審查／圖片／短語音／照片診斷需安全測試專案與明確費用上限授權，本輪不呼叫。
2. 正式 CSP 與麥克風政策提案見續作紀錄；未改正式 Nginx。HTTPS、麥克風、目標裝置與真 MCP 客戶端待驗證。
3. 付費工作台「新機型切片／價格尚待設定」為原使用者界線，本輪不以假切片／舊機價格解鎖。需提供實際 profile 與既有 worker 契約驗收完整報價→付款／訂單→排程。
4. 同型跨機真實觀測、試印照片與故障標註、維護結果尚未取得。預估校準、誤報率及工程師複核待執行；不能從合成資料得出準確率或壽命保證。
5. 「24 小時」「5–10 分鐘」是營運需實測的宣傳，不是本機測試證據。此輪無正式部署、真硬體或付費驗證。
6. 姓名牌自行新增 STL 仍隔離於專案外 patch，不在此海報清單交付，既有已提交 SCAD 不刪除。
