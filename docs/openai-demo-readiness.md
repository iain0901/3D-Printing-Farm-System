# OpenAI 與七項功能：2026-11-07 核對

程式預設集中於 `api/openai-models.mjs`，`.env.example`／Compose 同步。使用者自行設定 **OPENAI_API_KEY**；不使用前端 `VUE_APP_` 金鑰。既有 AI_MODEL／AI_API_KEY 的明確覆寫仍保留，客服舊整合也可直接沿用 OPENAI_API_KEY。

## 官方模型選擇

查核來源為 OpenAI 官方文件，日期 2026-11-07；價格是標準 API 牌價、美元／百萬 token，不含稅，不是實測單次花費。沒有對所有模型做品質／延遲 benchmark，不宣稱全球最低價。

| 工作 | 預設／env | 牌價與理由 |
| --- | --- | --- |
| 文字客服／用途切片檢查 | `gpt-6-luna`；SITE_AGENT_MODEL、SITE_AGENT_REVIEW_MODEL | 文字輸入 $0.10、快取 $0.01、輸出 $0.50；有限範圍分類／工具提案使用 reasoning none |
| 圖片客服／日誌照片診斷 | `gpt-6.1-terra`；SITE_AGENT_VISION_MODEL、MAINTENANCE_AI_MODEL | 輸入 $1、快取 $0.05、輸出 $5；獨立視覺路由，避免所有文字對話都走較高成本模型 |
| 即時通話 | `gpt-realtime-2.1-mini`；SITE_AGENT_REALTIME_MODEL | 音訊輸入 $10、輸出 $20；文字輸入 $0.60、輸出 $2.40。音訊 token 不等於分鐘 |
| 成品示意圖 | `gpt-image-2.6-flare`；SITE_AGENT_IMAGE_MODEL | 文字輸入 $5；圖片輸入 $8、輸出 $30。明確走 Images edits、low quality／low complexity、1024²，一次一張；不硬寫每張固定成本 |

來源：[Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)、[Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)、[Realtime mini](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini)、[Image Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare)、[圖片生成指南](https://developers.openai.com/api/docs/guides/image-generation)。

帳號權限／地區／模型可用性仍需用實際 OpenAI 專案驗證。所有模型可覆寫；失敗明示，不悄悄改模型或假成功。圖片生成改為真正 `POST /v1/images/edits` multipart，輸入當前模型截圖＋設定、hash 化 safety_identifier；不是僅改 Responses 的文字模型名。

## 功能矩陣（程式及本機驗證不等於服務上線）

| 功能 | 現有接線與測試 | 尚須確認／限制 |
| --- | --- | --- |
| 01 外部 MCP | `site-agent.mjs` 的 `/mcp` JSON-RPC 初始化、tools/list、tools/call；會員／員工分離、短期 token、撤銷、前端確認與結果回報；`site-agent.test.mjs` | 不是任意網站全權控制；實際目標 MCP 客戶端與 HTTPS 部署未驗證 |
| 02 站內 Agent＋圖文語音 | Responses 結構化操作提案；只能使用本頁可辨識控制；Realtime 短效憑證、可見操作確認／失敗；`site-agent-provider-contract.test.mjs` 與既有 browser checks | 特殊 3D 畫布拖曳、逐面塗色尚非通用 Agent 工具；不能宣稱所有按鈕／畫布操作都覆蓋。語音需實際瀏覽器麥克風／WebRTC 測試 |
| 03 觸發用途檢查 | 事件觸發而非持續 token 監控；用途、尺寸、面數／幾何 hash、填充、壁數等進 Responses；歷史保存；變更後舊建議失效 | 尺寸與規則是證據，不是薄壁／封閉性／受力求解；AI 建議不保證承重。這是能力邊界，不應以一個通過標籤包裝完整工程驗證 |
| 04 AI 成品示意 | Images edits 使用當前截圖和設定，前端仍回傳 data image；每日圖片額度及錯誤處理有 fixture 測試 | 真 API 圖像相似度、尺寸幻覺、品質、延遲及實際花費待驗證；不是實拍 |
| 05 多維智慧排程 | 原 queue／訂單使用交期、工時、難度、顏色；`poster-ai-acceptance.test.mjs` 控制案例＋新 demo linked-case 測試 | 可解釋規則／最佳化，非訓練模型；真切片工時及換料緩衝需現場校準 |
| 06 使用者建模 Skill | ZIP 含指引、Node STL 驗證與 hash manifest；`poster-ai-acceptance.test.mjs` 實際解包、執行驗證 | 提供 Codex／Claude Code 路徑；不保證所有聊天工具直接匯入，也不在伺服器任意執行 CAD |
| 07a 日誌＋照片診斷 | OpenAI Responses 多模態、同時引用有效 log/photo ID、私有歷史、60 秒逾時、20 次／工作區／日；`maintenance-advisor.test.mjs` | 需實際成對日誌與照片，不可拿修繕 CRUD 當 AI；不自動控制硬體；真實診斷有效性待工程師複核 |
| 07b 跨機保養推估 | 同型機的經驗服務間隔、事件相似度加權分位數；資料不足明示；合成示例可重現計算。本輪補完整歷史匯出、digest 核對封存、保存歷史與重新匯入，舊建議失效驗證 | 非故障壽命學習模型；運算視窗 200 觀測，人工整理須保留保養基準與完整間隔；自動機台採集仍是硬體串接範圍，無實際資料準確率驗證 |

詳細既有驗收見 [海報矩陣](poster-ai-acceptance.md)。本輪不是「只差貼 key 就全站完成」的證明。仍有完整畫布工具，以及實際第三方／硬體驗收界線。既有非 AI 上線審查問題仍沿原交接追蹤，沒有因 demo 成功就當作已修復。

## 真實 OpenAI 最小驗收

在受保護的測試站、專用低預算專案，用本包合成會員和授權模型：

1. 文字提案 → 確認修改填充 → 刷新草稿一致；未確認不得改。
2. 圖片問題 → 確認採 vision model；用途檢查有缺資訊出口，取消可繼續原流程。
3. 短通話 → 麥克風授權／拒絕／斷線，工具確認與回報；不洩露長效 key。
4. 截圖成品圖 → 形狀對照、改參數舊圖失效、配額及供應商 429／逾時明示。
5. 實際日誌＋照片 → 引用有效且工程師複核，不觸發列印機命令。
6. 真 MCP 客戶端 → 初始化、讀取本會員畫面、提案、確認、回報及 token 撤銷。

未取得金鑰／費用上限前只用注入 transport 測試，不送正式會員資料，不宣稱真服務驗證通過。
