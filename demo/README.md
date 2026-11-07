# 可操作展示資料包

目標站點：**farmflow.3dstu.com**（使用者 2026-11-07 確認）。不是 3drfm.com 正式站。本包不自動部署、不連遠端 PostgreSQL，也不覆蓋既有切片設定。

## 建立與啟動

需專案目前支援的 Node、既有後端／前端相依套件及建置結果。不要將正式 `.env` 整份載入展示程序。

```bash
npm run build
read -rsp '設定展示帳號密碼（至少 14 字元）: ' DEMO_PASSWORD
export DEMO_PASSWORD
# 父目錄需已存在；最後一層必須是全新目錄。下面是範例，請用部署專用儲存位置。
npm run demo:prepare -- /tmp/3drfm-demo-session
unset DEMO_PASSWORD
npm run demo:start -- /tmp/3drfm-demo-session
```

預設只監聽 `127.0.0.1:3080`，`DEMO_PORT` 可調。資料庫、上傳檔、帳號雜湊都在指定目錄；不跟 Git 網站更新目錄混放。報告 `report.json` 沒有密碼或登入 token。**再次使用相同目錄會拒絕，不刪資料、不合併、不覆寫。** 要重演請使用新目錄，驗收後由管理者選擇切換展示程序；原目錄可保留供回復。

帳號共用建立時提供的展示密碼（只限隔離測試，不用正式密碼）：

| 入口 | 帳號 | 示範用途 |
| --- | --- | --- |
| `/#/login` | `operator@demo.invalid` | 案件、庫存、排程、維修顧問，不需降低管理員 2FA 要求 |
| `/#/login` | `admin@demo.invalid` | 管理員，首次須按既有流程設定 2FA，沒有預填／繞過 2FA |
| `/#/portal/login` | `school@demo.invalid` | 新案、補件、正式報價、免費排隊 |
| 同上 | `studio@demo.invalid` | 接受報價、修改報價、待付款 |
| 同上 | `lab@demo.invalid` | 長工時批量、列印中、完成、可編輯草稿、偏低填充的用途檢查 |
| 同上 | `company@demo.invalid` | 小批量旋鈕、品檢、待取件 |
| 同上 | `personal@demo.invalid` | 急件、待付款、售後重印申請 |
| 同上 | `research@demo.invalid` | 困難件、待列印、完成紀錄 |

6 位虛構會員、18 案件、14 訂單、6 個專案、6 份草稿、原檔＋落地版本模型庫、5 台虛構 Hi、3 色 PETG、低庫存採購提醒、保養工單、跨機觀測、售後留言及免費排隊／完成情境。數量以生成後 `report.json` 為準。

## 8 分鐘展示順序

1. `lab` 登入：首頁顯示卡在哪一步 → 模型庫實際預覽／下載 → 草稿繼續編輯。模型來自 3DBenchy 與 Prusa 公開原檔，SHA-256 驗證通過後走真正會員上傳／草稿 API；來源、授權、編輯原檔見 [ATTRIBUTION.md](ATTRIBUTION.md)。
2. `school` 看補件與正式報價；`personal` 看急件及售後。每張案件都有用途、材質、顏色、數量、層高、填充、壁數、支撐及模型檔案；案件 → 訂單 → 生產任務有實際 ID 關聯。
3. 員工「排程」選 **多維排產** →「執行最佳化」。`demo-job-4-0` 急件優先；6 小時批量件佔用工位；難度 5 的皮帶座有預留；Black／White／Orange 影響換料選機；Hi 4 保養、Hi 5 離線被排除。400 mm 放大規劃件應被略過，回編輯拆件。`report.json.scheduling` 是同一個正式 optimizer 在資料副本上的對照，未預先替你按按鈕。
4. 員工「維修」選 Hi 1 → 推估保養：已有兩台其他同型機、六個完整間隔，可計算剩餘工時區間。此為**合成觀測上的經驗統計**，不是訓練出的故障預測或準確率證明。新增有效觀測後重新計算會改變依據；保養任務需人工確認。
5. 設定自己的 OpenAI 測試專案後：用途「料架底座需承載」、5% 填充 → 觸發檢查 → 自行決定是否修改；客服請求更改填充 → 確認 → 看見畫面欄位更新。圖片上傳與電話入口沿既有流程。
6. AI 成品圖：使用當前畫布截圖＋設定進行圖片編輯，不是換一張裝飾圖；標示示意、不能保證尺寸／強度。機台診斷須提供**自己的實際試印照片與對應日誌**，本包沒有拿網圖冒充故障照片或偽造 AI 結論。
7. MCP／Skill：會員或員工「MCP 與 Skill」建立自己的短期連線 token、複製設定；下載 Skill ZIP。不要把 token 放入簡報或公開錄影。

## 哪些是實際資料，哪些是情境

- 真實：原始模型 bytes／SHA、STL 量測、登入權限、雲端上傳保存／下載、草稿、關聯資料讀寫、既有排程演算法、跨機統計計算。
- 合成：人物、機台、交易、完成／品檢狀態、付款歷史、保養觀測、工時及重量。單價沿 NT$2/g，但沒有原設定包實際切片，因此**不能將合成克數稱為正式報價**。
- 不偽造 G-code、不將 STL 標為已切片；免費站點保持未開放，排隊情境沒有硬體租約或控制權。
- 不預填假 AI 回答。沒有 key 時明確顯示未設定，不冒充有模型推論。
- 不製造稅務發票；展示付款紀錄的文件明確標為非真實交易。

## 隔離與費用

獨立 `demo:start` 才可開啟帶 demoManifest 的資料；普通 API 拒絕誤開展示庫。預設不讀 OpenAI key，不啟動 worker、telemetry 或 bridge polling，Email／LINE／MQTT／Chatwoot 客戶端停用。白名單僅允許登入、模型／草稿／專案、AI、保養顧問及排程等本機操作；付款、硬體、還原與外部串接設定拒絕回傳 403，不用假成功取代。

要測試 OpenAI，另備**只含 AI 設定**的受限權限 env 檔，以 `DEMO_ALLOW_OPENAI=true` 明確開啟，再用 `node --env-file=/安全路徑/demo-ai.env demo/start.mjs /指定資料目錄`。先在 OpenAI 專案限制預算／可用模型，並保護測試站存取；請勿沿用正式服務憑證。模型與價格見 [OpenAI 配置／驗收](../docs/openai-demo-readiness.md)。

## 驗證命令

```bash
npx vitest run api/demo-dataset.test.mjs api/openai-models.test.mjs api/site-agent-provider-contract.test.mjs api/poster-ai-acceptance.test.mjs api/maintenance-advisor.test.mjs
# 使用現有 Playwright 安裝，不會自動下載套件或瀏覽器
PLAYWRIGHT_MODULE=/已安裝/playwright/index.mjs CHROMIUM_PATH=/usr/bin/chromium node scripts/check-demo-browser.mjs
```

測試會用臨時合成密碼；不輸出憑證、不呼叫付費服務、不連實體設備。
