# 管理端智慧工場展示與後續接線

2026-11-07，Asia/Taipei。這份文件描述可操作的前端展示，不代表真實 AI 推論、攝影機或故障預測已驗證。

## 入口與演示順序

員工登入後，管理總覽的「智慧工場」入口或側欄「AI 與整合 → 智慧工場展示」。

1. `/operations/monitor`：五台合成設備，兩台列印、一台異常、一台保養、一台離線。播放／暫停事件、按狀態篩選、選 03 號看到 L301 送料異常；點「查看保養依據與排程」。影像是 AI 生成的靜態示意，不是真實監視器。
2. `/operations/maintenance?printer=DEMO-HI-03`：查看歷史維修、保養間隔、日誌與同型機比較，安排人工保養到日曆。重複時段、相同工程師衝突與列印中的當日會被阻擋。可以換週、標記完成；不呼叫正式排產或維修 API。
3. `/operations/quality`：選裂縫件，開始轉盤拍攝回放，四面完成後判讀，查看缺陷框，填寫原因後退回重印；複核紀錄可下載，再連回 03 號保養。另有良品與缺兩面影像情境；缺圖不得人工直接通過。參考模型是程式建立的三維幾何，照片是生成素材，兩者未做尺寸／相機校正，並非真模型配準。

所有資料 ID 帶 DEMO 或 QC 前綴，訂單編號僅此展示的情境參考，未建立／修改正式訂單。資料按員工 ID 分開存於 localStorage `3drfm-operations-demo-v1:<staff-id>`，只在同一天載入；次日重新建立相對日期的情境，非永久業務紀錄。可手動重設；日曆與複核刷新保留。登出後不提供匿名管理路由，角色與既有路由守衛不改。

此展示刻意不混用其他展示資料包的機台 ID 或即時 API 數字：管理總覽仍顯示既有後端資料，進入此區明確切到獨立情境。機台假事件不變成真歷史或保養訓練資料。

## 機制與資料界線

| 功能 | 本輪機制 | 真實接線仍需 |
| --- | --- | --- |
| 監控 | 手動開啟、每 5 秒一筆有上限的合成事件回放；離頁／背景即停止；離線不顯示溫度或相機 | 有時間戳的 telemetry、受保護相機媒體、斷線與過期判斷 |
| 保養建議 | 三個合成保養間隔的中位數、距上次保養天數；七日異常達 5 次則提前 7 天。門檻純展示，未校準；另列同型機供人比較 | 真實事件／維修零件／累計工時、適用機型分群、回測與誤報評估；既有跨機 advisor API 保留 |
| 日曆 | 前端安排與重疊檢查，瀏覽器保存 | 後端原子佔位、排產衝突驗證、工程師可用性及真任務狀態 |
| 品管 | 三種預設結果＋缺圖守門，非模型推論；四角度回放、示意缺陷框、人工意見、JSON 報告 | 模型版本／雜湊、相機校正、同角度渲染、照片儲存與證據、OpenAI 或視覺異常模型、人工放行及訂單關聯 |

本輪沒有新增外部推論呼叫、金鑰、硬體控制、永久服務或正式資料寫入。既有維修顧問仍能由有權限員工送出真日誌與照片到已配置的 OpenAI；展示不會偷偷使用它。

## 品管技術核對

補充更正（2026-11-07）：使用者提供 [Cloudflare Clef 官方文章](https://blog.cloudflare.com/clef-decision-models/) 後，已確認其指定的是 Clef 決策模型，文章提及的 J 開頭產品是 Typesafe 的 Jev。先前依描述猜測 JEPA 不適用於本次選型；Clef 不是 CLIP 相似度模型。

更貼近需求的領域是 **visual anomaly detection（視覺異常檢測）**、zero/few-shot anomaly classification（零／少樣本異常分類）以及參考影像條件的視覺判讀。WinCLIP 論文確實研究少量正常圖片的異常分類與分割，但其資料集成績不能當成客製 FDM 的準確率。每件不同且沒有正常實拍時，僅靠一般工業異常模型不一定可行。

沿用使用者的 OpenAI 選擇，可將每個角度的實拍、相同角度的模型渲染、材料與檢查規則送入視覺模型，要求結構化 `pass / hold / review`、照片引用、缺陷類別、需人工檢查事項。先做便宜的完整性／清晰度守門，僅於拍攝完成觸發推論；需要細節時才提高影像解析度或升級模型。**限定回答三個分類並不會自動變成專用低價模型**，成本仍取決於模型、影像尺寸、張數及 token。

上述 OpenAI 是前輪方案；本輪品管展示改以使用者指定的 Cloudflare Clef-flash 為接線目標，不改其他 OpenAI 聊天／語音服務。

### Clef 雙圖決策展示（本輪續作）

- 官方已確認視覺輸入：Clef／Clef-flash 均支援圖片。`questions` 支援 `noul`（是的機率）、`choice`（選項、機率分布及 confidence）、`score`（有序評分），不是自由生成檢查報告。
- 模擬每個角度同時提供模型預覽＋實拍，詢問外觀分類、分層、缺料及補拍。四個角度共八張圖，按官方每次最多四張圖片拆兩批；缺少照片的角度不偽造結果，直接待補拍。
- 介面可調決策信心門檻 0.70～0.99，變更後舊結果失效；有信心的瑕疵轉退回，低信心轉複核，缺圖不准直接通過。取消、換物件、離頁停止模擬，既有人工複核理由必填。
- `clef-inspection-demo.mjs` 的 probabilities／confidence／noul 全是固定 fixture；沒有讀取圖片像素或呼叫模型。缺陷框仍是獨立示意標註，Clef 官方分類輸出不提供 bounding box，不能把它當缺陷定位模型。
- 展示報告包含每對 referenceId／photoId、決策問題、機率、門檻、分批及 `provider: simulation`、`model: null`、`targetModel: @cf/cloudflare/clef-flash`、`usage: null`；不編造 token 使用量或實測延遲。
- 畫面的 imageRefs 只是接線規劃識別碼，**不是可直接送出的圖片參數**。正式 adapter 必須從真模型渲染與實拍檔讀取 bytes，按 imageOrder 填入 `images` 的 data URL 或 `{ content_type, base64 }`；官方不接受遠端 URL。需伺服器端 Cloudflare Account ID／Token，不能放前端。
- 官方 input schema 限制：最多四張，單張 4 MiB／16 MP、總 decoded 8 MiB、整個 body 13 MiB；正式接線必須驗證。輸出也需驗證分類值、機率及完整欄位，任何缺失／服務錯誤應進複核，不回退成展示成功。
- 2026-11-07 查核價格：Clef-flash 每百萬輸入 token US$0.038；Clef US$0.24，不收輸出 token。圖片會轉成輸入 token，另有 state／questions；這不是固定每件價格。未測 FDM 品管準確率、延遲或實際費用。
- 官方依據：[Clef](https://developers.cloudflare.com/workers-ai/models/clef/)、[Clef-flash](https://developers.cloudflare.com/workers-ai/models/clef-flash/)、[輸入 schema](https://developers.cloudflare.com/workers-ai/models/clef/schema-input.json)、[輸出 schema](https://developers.cloudflare.com/workers-ai/models/clef/schema-output.json)。

OpenAI 官方明列視覺的精確空間定位限制，因此缺陷框必須驗證，不能依未校準照片放行尺寸、公差、內部填充或承載強度。轉盤看不到的底面／遮蔽面要補拍，透明／反光料需獨立測試。正式上線前應以真實件建立各缺陷標註集，按零件而非照片分割測試集，衡量漏檢、誤退與人工複核率、延遲及單件費用。不能宣稱只填 key 即完成生產品管。

查核來源（本輪直接讀取官方頁／原始論文）：

- [OpenAI Images and vision](https://platform.openai.com/docs/guides/images-vision)：多圖輸入、detail 與視覺限制。
- [Meta I-JEPA 官方儲存庫](https://github.com/facebookresearch/ijepa)：架構定位與自監督表示學習。
- [WinCLIP 論文](https://arxiv.org/abs/2303.14814)：Zero-/Few-Shot Anomaly Classification and Segmentation。

## 驗收與發布

`npm run build`；`npm test -- --maxWorkers=2`；既有 Playwright 環境下執行 `PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/check-operations-demo.mjs`。瀏覽器腳本以暫存 demo DB、虛構操作員登入，檢查桌面／手機、保養重複、品管三情境、下載／刷新／重設，以及無非預期 API 寫入。

伺服器 BOT：更新 Git main 後重新建置前端，連同 `public/images/operations/` 三張 WebP 發布至 farmflow.3dstu.com 測試站；沿用原本 API、資料庫、.env 與外置 Orca profiles。此次不需 migration 或新密鑰，也不用重建切片容器。由原部署者執行並回報 commit 與三個路由的截圖；本工作區未實際部署。
