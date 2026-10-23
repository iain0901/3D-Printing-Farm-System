# 自助列印前端與後端串接契約

本次先完成會員操作與即時影像 UI；不要求現在接上實體機台。既有 Telegram 設定未更動。入口：`/#/portal/free-print`。機型與攝影機協定由後續後端決定，不假設「創想三維 H」已完成實機相容驗證。

## 已完成的介面

- 排隊、到場、準備、列印、取件交棒的流程指示與使用期限。
- 歸零、X/Y/Z ±1/±10 mm、預熱、停止加熱、進退料、三項安全確認、開始、暫停、繼續、停止與交棒。
- 操作中的等待提示、防止重複點擊、錯誤提示；停止列印需再次確認。各步驟提供可點開的說明。
- 噴嘴／平台溫度、機台連線、實際列印進度。狀態超過 15 秒未成功更新時停用控制，不顯示假連線。
- 即時影像的未輪到、尚未連接、連接中、觀看中、中斷、暫停及格式不支援狀態；重新連線、完整／填滿畫面及瀏覽器支援時的全螢幕。
- 切換使用者、登出、時段結束或離開頁面時移除影像並取消尚未完成的請求。切到背景分頁會暫停觀看，回來後自行按連接，不影響列印。

尚未串接時，介面會顯示「尚未連接」，不會以影片、裝飾圖片、隨機溫度或假進度冒充現場。正式網站仍須另行部署。

## 會員狀態與操作

沿用 [free-print-sessions.md](free-print-sessions.md) 的站點、排隊與命令 API。會員請求使用既有 Customer Bearer token，不使用員工 token。

`GET /api/customer/workspace/free-print/station` 每 5 秒更新，主要欄位：

```json
{
  "station": {
    "id": "nthu-shuimu",
    "name": "清華大學水木書苑",
    "availability": "有人使用中，依序通知。",
    "queueLength": 2,
    "camera": { "configured": false }
  },
  "reservations": [
    {
      "id": "<reservation-id>",
      "sequence": 12,
      "status": "preparing",
      "statusLabel": "準備列印",
      "canControl": true,
      "leaseExpiresAt": "<ISO-8601>",
      "estimatedMinutes": 25,
      "history": [],
      "email": []
    }
  ],
  "telemetry": {
    "status": "idle",
    "nozzle": 25,
    "bed": 25,
    "progress": 0,
    "homed": false,
    "position": { "x": 10, "y": 10, "z": 10 },
    "extrusionReady": false,
    "minimumExtrudeTemperature": 220
  }
}
```

數字只示範資料形狀，不是 3DSTU_PETG 或特定機型的正式參數。未取得實際狀態時回傳 `telemetry: null`；只有當前使用者取得 telemetry。`canControl` 由伺服器判定，不接受瀏覽器自行授權。

`POST /api/customer/workspace/free-print/reservations/:id/action` 接受 `{ action, requestId, ... }`。`requestId` 是 UUID，用來避免重送實體命令。UI 已接以下動作，後端只需維持同樣欄位與狀態回覆：

| 動作                        | 其他欄位／UI 行為                                |
| --------------------------- | ------------------------------------------------ |
| `checkin`                   | 到場報到，轉為 `preparing`                       |
| `home`                      | 先提醒移動範圍淨空                               |
| `jog`                       | `axis: x/y/z`，`distance: -10/-1/1/10`，單位 mm  |
| `preheat`、`cooldown`       | 使用站點後端的指定溫度，不讓會員自行任意加熱     |
| `load`、`unload`            | 每次 10 mm，未達可進退料條件時停用               |
| `checks`                    | `checks: { bedClear, filamentReady, areaClear }` |
| `start`                     | 三項確認並歸零後；後端仍須重新驗證               |
| `pause`、`resume`、`cancel` | 停止需確認；遠端停止不是緊急斷電                 |
| `release`                   | 清空、冷卻後交棒，必須由後端確認並撤銷權限       |

回覆最新站點狀態。錯誤以 HTTP 非 2xx 及 `{ "error": "繁體中文訊息" }` 回覆。硬體命令結果不確定時，不可以回傳假成功或自動重送，應維持／轉為 `attention` 供現場確認。

## 即時影像連接

### 1. 取得短效觀看連線

`POST /api/customer/workspace/free-print/reservations/:id/camera-session`，body `{}`。

已實作會員／工作區、目前時段與期限檢查。未登入 401；非本人 404；未輪到、結束、逾時或停用站點 403，並回覆 `Cache-Control: no-store`。尚未提供影像後端時：

```json
{ "reservationId": "<reservation-id>", "camera": { "state": "unconfigured" } }
```

後續在 `registerFreePrintStation` 提供 `createCameraSession` callback。參數為 `{ reservationId, stationId, workspaceId, customerId, expiresAt, signal }`；10 秒逾時會中止 signal，請轉交給連線請求。影像建立不占用印表機操作鎖，等待期間時段結束也會拒絕回傳連結。回覆下列物件（不是整個外層 JSON）：

```json
{
  "state": "ready",
  "kind": "mjpeg",
  "mediaUrl": "/api/customer/workspace/free-print/reservations/<reservation-id>/camera/stream?ticket=<short-lived-ticket>",
  "expiresAt": "<ISO-8601>"
}
```

伺服器只接受同源、該時段專屬 `/camera/` 路徑；有效期限不得晚於傳入的 `expiresAt`（最多 60 秒，報到／準備期不超過使用期限）。前端會在到期前重新申請。請讓主機時間同步。

### 2. 提供受保護的影像 gateway

**本次沒有實作實體攝影機代理或媒體路由。callback 不等於媒體路由；必須由後端一併提供，才算完成影像串接。**

| `kind`     | UI 如何播放                                             | 後端責任                                                                                                                                         |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `snapshot` | 帶會員 Bearer 取得 image blob，顯示成功後約每秒再取一張 | `/camera/frame` 回傳 `image/*`，每次重新驗證時段，不回傳登入 HTML                                                                                |
| `mjpeg`    | 原生 `<img>`，適合攝影機連續影像                        | `/camera/stream?ticket=...` 回傳正確 multipart 串流，短效 ticket 綁會員及時段                                                                    |
| `video`    | 靜音、行動版行內播放 `<video>`                          | 提供瀏覽器可播放的直播媒體，`mimeType` 為 `video/mp4` 或 `application/vnd.apple.mpegurl`；HLS 僅使用瀏覽器原生支援，不支援時明確提示，不假裝播放 |

原生 img/video 不附帶 JS 的 Bearer header，所以 `mjpeg`／`video` 必須用受保護短效 ticket、HttpOnly session 或等效方式驗證，不能只依 URL 中的時段 ID。HLS 的播放清單與每個片段也都必須受保護；自訂 header、RTSP、WebRTC 或專有 Creality 來源須由後端轉成上述契約，前端目前不是這些協定的直接客戶端。

### 3. 撤銷、安全與隱私

- 媒體 gateway 每個請求重新核對當前使用者與時段；串流已建立時也必須持續檢查或訂閱撤銷事件，時段結束即中止連線。短效 URL 與 UI 隱藏本身不能取代後端撤權。
- 不把印表機 IP、攝影機管理帳密、永久網址或橋接憑證傳給會員；不以可公開快取的路徑代理影像。設定 `Cache-Control: no-store` 並避免記錄 ticket。
- 未輪到的人不能取得其他使用者畫面。登出也應在媒體後端撤銷該登入 session 的 ticket。
- UI 不會宣稱已儲存錄影。若日後要錄影、下載或留存，需另行設計告知、同意與保存期限。
- 攝影機失效與印表機離線是不同事件，影像失效不會發出停止列印命令。現場操作安全不能只依影像或網站按鈕。

## 測試

- `npm test`：包含影像申請的權限、逾時、結束、來源／有效期驗證與憑證不外洩測試。
- `npm run build`：正式前端建置。
- `scripts/check-free-print-camera.cjs`：本機瀏覽器測試排隊鎖定、未連接、載入、模擬 snapshot／MJPEG 來源、暫停、重試、短效連線更新、手機版、命令等待、離線停用、停止確認、結束與登出。PNG 測試資料只用於驗證媒體載入，不是現場攝影機影像。
- `scripts/check-free-print-session.cjs`：原有切片 → 排隊 → 到場 → 準備 → 開始 → 取件交棒流程回歸測試。

沒有實體攝影機、Creality 韌體或正式通知投遞的實機驗證；這些是後續連接後端時的驗收項目。

本次驗證：正式建置通過；43 個測試檔、353 項測試通過。影像與完整自助列印流程的本機瀏覽器檢查通過，包含 320 / 390 px 手機版。測試機台命令與媒體來源皆明確使用隔離 fixture，沒有發送至現場設備。
