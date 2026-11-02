# 原任務續作與姓名牌 STL 隔離更正

- 工作者：本對話 Codex，AI-20261025-03。
- 基準：由乾淨 cd65d37 fast-forward 至協作者最新 main `504a774ce0380d0cf24d6b10639ab013e1eb9c25`。本輪再 fetch 核對 HEAD／origin/main 差距 0／0；未提交、推送或部署。
- 已讀 AGENTS.md、共編規範與相關紀錄；保留 OpenCode 的 UI／UX。未安裝套件、呼叫真實 OpenAI、控制硬體、配置永久憑證或修改正式安全政策。

## 原文與範圍更正

原始使用者逐字：「那它 agent 可以直接來操作這個網站，然後包括它的身份名牌的生成之類的。」

- 原任務 `01a129f6-0450-7327-aa75-61d17b2dd023`。
- turn `01a16cef-d23b-719d-80cd-6647d6c971ef`；message `01a16cef-d86c-7103-99d3-8671d918e97b`。
- turn.startedAt `1792829019`，台灣時間 2026-10-24 16:03:39；這是回合開始時間，不冒充精確訊息時間。

「身份名牌」的具體意思未確認，原文沒有要求實體姓名牌、SCAD 或 STL。前輪助理自行解讀為實體姓名牌，本輪再延伸 STL，屬推論過度。既有 D-005／H-003 中的姓名牌記述是助理解讀，不能反過來當成使用者授權證據。既有已提交 SCAD 功能按本次要求保留，不表示重新批准。

## 已隔離，不在待整合成果

本輪新增的 renderer／測試、STL API、按鈕、文件與瀏覽器 STL 測試步驟均已從專案執行／測試路徑移出，保存為工作區外的可還原 patch：

- 路徑：`/workspace/3drfm-isolated-20261025/name-badge-stl.patch`。
- SHA-256：`9bb98d9dec7f9265897a82402b783296dc0afec7367310192130b8f7ed326980`。
- 後續補充：上述為海報擴充前的歷史 hash，原檔已保留為 `name-badge-stl-before-poster.patch`。因新授權功能修改相同檔案，現行 `name-badge-stl.patch` 已對後續工作區重基，hash 為 `356c1688b08e4fe3f5b816a084a1f2a698e9fe50c9cbc03ab8da442d05d45a56`，重新套用預檢通過；未實際套回。見 [海報續作](2026-10-25-codex-poster-ai.md)。
- 說明：`/workspace/3drfm-isolated-20261025/README.md`。
- `git apply --check /workspace/3drfm-isolated-20261025/name-badge-stl.patch` 已通過；未實際套回。
- 此為本任務工作區檔案，非永久共享網址。整合者需另行保存，不得順手納入正式成果。

具體隔離差異：

1. `api/name-badge-renderer.mjs`、`api/name-badge-renderer.test.mjs`：本輪新增未追蹤檔案已移出，由 patch 保存。
2. `api/site-agent.mjs`：只撤回本輪 renderer import、GET /badge/status、POST /badge/stl，現在相對 HEAD 無差異。
3. `AgentConnections.vue`：只撤回本輪 STL 按鈕、說明與下載函式；模板／樣式恢復與 HEAD 一致。保留既有 SCAD 下載與本輪身分隔離修正。
4. `docs/site-agent.md`：撤回 STL 交付宣稱及新增測試項，僅保留語音／建議生命週期測試文件。
5. `scripts/check-site-agent-lifecycle.cjs`：移除新增 STL 下載／尺寸／畫面測試，僅驗證明確原需求的語音與建議。

未改 Dockerfile、未加 OpenSCAD／字型容器依賴，也不把此工作列入後續必做項目。

歷史說明：隔離前曾完成 46 檔／361 測試及 STL 下載檢查；這只是已發生的本機實驗，不是使用者要求已完成的證據，也不是本次交付驗收。以下隔離後驗證取代先前交付清單。

## 保留的待整合改動

- `SiteAgent.vue`：通話 generation／AbortController；連線中可掛斷；遲到的麥克風、offer、remote description、peer 事件及 audio.play 失敗不干擾新通話。用途建議獨立序號／忙碌狀態，避免 A 回應覆寫／解鎖 B。
- `AgentConnections.vue`：請求捕捉會員／員工身分，切換或離頁後拒絕舊回應；清除畫面舊憑證；顯示 Blob JSON 錯誤。沒有新增模型生成功能。
- `SlicerLab.vue`：只有 script 新增 14 行，套用建議前重查模型版本、用途、參數、登入與可切片狀態；改值後舊建議被拒絕。template／style 與 504a774 完全一致。
- `scripts/check-site-agent.cjs`：沿用協作者收合欄位 UI，補「填充改為 25 後拒絕舊建議 15」。
- 新 `scripts/check-site-agent-lifecycle.cjs`：七項取消／重連／音訊／重疊建議 fixture 測試。
- 本紀錄、CURRENT_WORK、HANDOFF 與生命週期測試文件更新。

## 隔離後實際驗證

1. `npm run qc`：建置成功，**45 檔／359 測試通過**；新增 renderer 測試已不在測試樹，並非以 skip 充數。log `/tmp/3drfm-post-isolation-qc.log`。
2. 本機隔離 JSON DB API（8811），OPENAI_API_KEY 空、provider disabled；無 SMTP、Chatwoot、硬體或付費服務。
3. 使用既有 Playwright 模組與 Chromium 跑 `scripts/check-site-agent-lifecycle.cjs`：七項通過，cancel-before-microphone、late-microphone-cleanup、late-offer、stale-peer-events、late-remote-description、stale-audio-play-rejection、overlapping-review-isolation。
4. 跑 `scripts/check-site-agent.cjs`：九項通過，包含真正 Vue 填充更新、舊建議拒絕、MCP fixture、skill、語音工具與模型擷取／示意圖 fixture、320／390／1440 px。截圖 `/tmp/3drfm-agent-ui-sL7oPB/`（本機暫存，非永久共享）。
5. `git diff --check`、隔離 patch 套用預檢通過。自建測試 API PID 224242 已停止；七個原有 API 程序未動。
6. 未執行真實 OpenAI、真實 MCP 客戶端、正式部署或實機列印驗收；不能由上述通過推論全站完成。

重現瀏覽器環境：`BASE_URL=http://127.0.0.1:8811`、`CHROMIUM_PATH=/usr/bin/chromium`、`PLAYWRIGHT_MODULE=/opt/codex/runtimes/codex-primary-runtime/dependencies/python/lib/python3.12/site-packages/playwright/driver/package`；先建置，再啟動全新暫存 JSON DB 的靜態 API，勿使用正式資料庫。

## 畫布覆蓋核對：不籠統宣稱缺少或完成

| 功能 | 目前實作與 Agent 界線 |
| --- | --- |
| 填充、壁數、材料、可見位置／旋轉欄位 | 一般 DOM 操作可在欄位可見時填寫；填充有實際 Vue 更新回歸。不代表所有欄位均測過。 |
| 自動擺盤、朝向、復原／重做等可見按鈕 | StationLayout 已有 command；一般 DOM 可點可見按鈕，不是沒有此功能。逐項 Agent 場景驗收仍待完成。 |
| 相機預設視圖、適合視窗、聚焦選取 | SlicerStage 已有可見按鈕與 cameraView／fitCamera，不能當作全缺。尚未逐項 Agent 回歸。 |
| 依模型 ID 選取／多選、精確變換 | 滑鼠／UI 已有；Agent 只有可見 DOM 欄位，尚無獨立模型 ID／幾何版本綁定的專用工具。 |
| 指定三角面上色、面朝下、筆刷拖曳 | 現有畫布／paint 事件供手動用，但一般 DOM Agent 不能直接表達精確面選擇／拖曳；本輪未新增或宣稱完成。需要在原要求下確認具體操作與驗收模型，不能讓 AI 猜座標。 |
| 本機檔案選擇、敏感操作 | 保留本人操作，不繞過瀏覽器檔案授權或付款／密鑰限制。 |

本輪依最新收斂指示先交付隔離及既有修正，不再擴張畫布工具或名牌功能。

## 正式 CSP 最小變更提案（尚未批准／未套用）

先前唯讀 HEAD `https://farmflow.3dstu.com/` 回覆 200，觀察到 `connect-src 'self'`，無 Permissions-Policy header；不能由此推論部署 SHA、金鑰或所有代理層設定。repo API 已含 OpenAI CSP 設定，正式站存在配置差異，應先查實際 header 來源。

- Browser 外連只有 `https://api.openai.com/v1/realtime/calls`（SDP）：建議 `connect-src 'self' https://api.openai.com`。
- 語音播放：`media-src 'self' blob:`；麥克風 Permissions-Policy 建議 `microphone=(self)`，保留既有 camera／geolocation 限制，不開放第三方嵌入。
- 其他保持現有最小設定，圖片 `img-src 'self' data: blob:` 已足夠；不需要任意外部圖床、wildcard、unsafe-eval 或放寬 frame。
- 同源會員 `/api/customer/agent/*`、員工 `/api/staff-agent/*`；MCP `/api/customer/agent/mcp`。伺服器端 Responses／client_secrets 不屬瀏覽器 CSP allowlist。

## 外部驗收阻塞與最小下一步

- OpenAI：使用者安全設定測試專案金鑰，明確授權合成資料、有限次文字／判斷／圖片／短語音及費用上限後，才驗證真實服務。不能在對話貼密鑰。
- MCP：提供目標客戶端／版本與測試 endpoint，驗證 HTTP Bearer 初始化、確認／完成、撤銷；不能宣稱支援所有要求 OAuth 的客戶端。
- 部署：指定主機／平台、既有方式，並批准部署及正式安全 header 修改；本輪未操作。
- 硬體：按既有後續串接約定，本輪不列印、不控制機台。
