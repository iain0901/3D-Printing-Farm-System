# 修改紀錄：海報七項 AI 接入既有流程

- 日期：2026-10-25（Asia/Taipei）
- 工作者：本對話 Codex；AI-20261025-04。
- 基準：main 504a774；本輪 fetch 核對與 origin/main 差距 0／0。
- 狀態：本機實作／驗證交接，正式服務與部署未完成；所有修改未提交、未推送。
- 授權：使用者後續「所以你看海報上說的AI功能要讓這個網站都有」，協調者提供智在必型 v7／Library version 6 精確清單。沿用同任務／工作區，不另開替代任務。

## 改動與保留

| 檔案 | 本輪改動 |
| --- | --- |
| api/site-agent.mjs | 模型外框／三角面數／幾何版本＋切片參數共同審查；明列確定性規則；壁數建議；私有 agentReviews／GET reviews；外觀生成附目前設定；Skill ZIP 入口 |
| api/model-skill-package.mjs | 可下載規範、Codex／Claude Code 人工安裝指引、二進位 STL 檢查腳本與 hash manifest；不是任意模型生成引擎 |
| api/maintenance-advisor.mjs | 日誌＋照片多模態診斷、引用／權限／機台工作區驗證、常見秘密遮蔽、每日額度、私有紀錄；同型跨機觀測、事件負擔加權區間與新資料更新；確認後建立真 maintenance 任務、不重複建立、不採過期推估 |
| api/schedule-difficulty.mjs、server.mjs | 既有 queue 多維策略，交期／工時／難度／顏色實際決策，明示風險預留；不可用機台不硬排；診斷路由；一般 state 統一依私有集合清單排除，避免新增集合被廣播／回傳 |
| SiteAgent.vue | 在原語音／建議非同步修正上支援壁數套用；不移除逐項確認 |
| SlicerLab.vue | 在原過期建議保護上加入模型證據、支撐／層高，外觀生成傳目前設定；保留協作者 template/style |
| SlicerStage.vue、StationLayout.vue | 只增加目前實際 WebGL 畫面的有界等待／PNG 擷取與 expose，沒有重做三維工具／畫布樣式；不把空白圖冒充模型 |
| quote/Workbench.vue | 接在既有確認／送出需求前做用途審查；依目前模型／配色／設定生成 AI 外觀預估，變更後清除；新機型真切片／價格未開放的原界線保留，不使用免費 profile 冒充 |
| AgentConnections.vue | 保留原 SCAD 功能與本輪身分隔離，只增加 FDM Skill ZIP 下載；未套回隔離姓名牌 STL |
| MaintenanceAdvisor.vue、maintenance/index.vue | 在既有維護任務下接入診斷／觀測／推估／歷史／人工任務按鈕；保留原任務管理、權限與版型 |
| scheduler/index.vue | 既有排程頁增加多維策略與難度預留欄位，未建立平行 demo queue |
| 新測試與既有 Agent 腳本 | 見下；不安裝新套件、不連真實 provider、不控制硬體 |

已讀 AGENTS、D-001～005、協作者 UI 紀錄。未改全域 token、導覽、圓角規格、部署檔、Nginx 或正式安全政策。新增 UI 只限精確要求的功能入口，不恢復舊公開頁。既有姓名牌 SCAD 沒刪除，不把它重新認定為使用者原文已批准。

## 逐項資料流與限制

完整八列（07 分成診斷／跨機推估）入口、資料流、機制、成功失敗測試、持久化、部分／本機已測試／待真實驗證見 [海報驗收矩陣](../../docs/poster-ai-acceptance.md)。

本輪不是把維修 CRUD 當作 AI：diagnose 發送真正多模態 Responses 格式，但實測採 injected transport；forecast 是誠實標示的跨機歷史加權方法，非固定週期表、非已訓練故障預測模型。排產同樣明示規則／最佳化。資料不足就回覆不足，沒有宣稱準確率或壽命保證。

## 實際驗證與除錯

- 最終 `npm test`：**49 檔／380 項全部通過**，log `/tmp/3drfm-poster-final-tests.log`（07:51:32 UTC 開始，51.91 秒）。這是隔離姓名牌新增項目後、本輪海報功能與安全修正的本機結果，非正式服務驗收。

- 正式前端建置成功，`/tmp/3drfm-poster-release-candidate-qc.log` 有 Rspack compiled successfully（4.74 秒）。既有 Sass／deep selector 警告保留，不是新功能錯誤。
- 全套回歸先抓到新增私有集合未從一般 state 排除，已修為依 AGENT_COLLECTIONS 統一排除；針對性 integration test 再通過，未部署過此中間版本。最新全套結果於本文末追加。
- `npx --no-install vitest run api/poster-ai-acceptance.test.mjs api/mcp-http-protocol.test.mjs api/site-agent-provider-contract.test.mjs api/maintenance-advisor.test.mjs api/site-agent-integration.test.mjs`：5 檔／22 項通過，log `/tmp/3drfm-poster-final-targeted.log`。涵蓋真 localhost JSON-RPC、認領／結果、後端 Responses 請求、四維控制、不可用候選、ZIP 腳本實際執行、資料不足／跨機型／事件更新／不採過期建議／人工任務不重建。
- `scripts/check-site-agent.cjs`：十項通過，包含實際 Vue 填充更新、過期建議拒絕、語音／圖片 fixture、320／390／1440 px、刷新後設定一致。證據 `/tmp/3drfm-agent-ui-tjkALi/`。
- `scripts/check-site-agent-lifecycle.cjs`：七項通過，結果為腳本標準輸出的 JSON checks；此腳本目前沒有截圖產出，不把它建立的空暫存資料夾當作影像證據。
- `scripts/check-poster-ai.cjs`：八項通過，付費模型／設定審查、修改填充與壁數、實際 Stage 擷取送給明示圖片 fixture、變更失效、ZIP 下載、維護資料不足、刷新一致、1440／390 px。最新證據 `/tmp/3drfm-poster-ai-Y5jDhj/`。
- 瀏覽器除錯發現擷取與模型配色載入有競態，已改有界等待 5 秒後才擷取；仍失敗則顯示錯誤，不送空白模型。管理員 2FA 會按原設計導向設定，測試使用明示 Operator UI fixture，不註冊永久憑證、不關閉規則。手機測試需等原側欄動畫結束；收起後無橫向溢出，已視覺複核 390 px 截圖。
- UI 證據在本機 `/tmp`，不是永久團隊共享網址；本輪改前以 504a774／協作者原截圖為準，沒有假造全套新改前截圖。

重現：先 build，順序跑 test，使用全新暫存 JSON DB 的本機靜態 API，OPENAI_API_KEY 空／provider disabled／無 SMTP／無硬體；Playwright 環境同前輪，BASE_URL 限 localhost。不得用正式資料庫執行建帳與任務 fixture。原有七個 API 程序保持不動，自建 8811 測試 API 完成後停止。

最終收尾：自建測試 API PID 229649 已停止；既有七個 API 未停止。`git diff --check`、重基隔離 patch 套用預檢均通過，現行 main／origin/main 仍為 504a774，未提交／推送。以 Node 逐段比對 SlicerLab、SlicerStage、StationLayout、AgentConnections 的既有 style，均與 HEAD 完全一致；新增功能未順手格式化協作者樣式。專案 api／frontend／scripts 搜尋未見 badge/stl、badge/status、renderNameBadge 或 badgeStl，姓名牌新增項確實不在執行／測試樹。

## 姓名牌 STL 仍隔離

- 本輪沒有重新加入姓名牌 STL API、按鈕、renderer 或它的測試；FDM Skill 的一般 STL 檢查屬這次明確授權的建模規範，與姓名牌匯出不是同一功能。
- `/workspace/3drfm-isolated-20261025/name-badge-stl.patch` 已依本輪共用檔修改重基，套用預檢通過但**未套回**；SHA-256 `356c1688b08e4fe3f5b816a084a1f2a698e9fe50c9cbc03ab8da442d05d45a56`。
- 原始隔離 patch 保存為 `name-badge-stl-before-poster.patch`，hash `9bb98d9dec7f9265897a82402b783296dc0afec7367310192130b8f7ed326980`。兩者皆在專案外，不納入待整合／推送。

## 未完成／需要使用者的最小下一步

1. 真實 OpenAI：安全設定測試專案 key，授權合成資料、有限次文字／審查／圖片／短語音／診斷及費用上限；不在對話貼 key。
2. MCP：指定實際客戶端／版本。localhost HTTP 協定通過不等於所有 OAuth／SSE 客戶端可互通；目前不冒稱通用支援。
3. 付費完整鏈：原使用者約定的新機型 profile／worker 後端仍待提供；保持付費頁真切片／價格未開放，不以舊設定解鎖。現有案件／訂單／queue 路徑已沿用，真實端到端待設定驗收。
4. 診斷／保養：提供去識別化、同型跨機實際觀測與維護結果／試印照片；工程師校準工時預留與推估區間。最多 200 觀測／工作區、照片原圖不長存、未接自動採集與大規模歷史歸檔，均在矩陣明列。
5. 正式 HTTPS、CSP／麥克風政策、部署、真硬體仍需獨立授權；本輪沒有任何正式寫入。「24 小時」「5–10 分鐘」未做營運實測。
6. Agent 特殊三維面選取／拖曳未新增專用工具；可見原生控制是受支援範圍，不把它寫成全畫布覆蓋。若要求覆蓋具體畫布手勢，需逐項模型 ID／幾何版本工具與場景驗收，不猜螢幕座標。
