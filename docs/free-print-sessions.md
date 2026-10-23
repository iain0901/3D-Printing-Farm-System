# 自助免費列印：排隊、時段與引導操作

更新：2026-10-24（臺北）。

入口：`/#/free-print/nthu-shuimu/slicer` 完成真實切片，登入後按「加入免費列印排隊」；`/#/portal/free-print` 查看自己的時段並操作。舊版會員草稿申請保留作為人工服務管道，不會憑草稿自動送印。

## 流程

```text
真實站點切片 → 登入加入 FIFO → 輪到時通知（Email＋會員通知）
→ 到場報到 → 歸零、預熱、進退料 → 三項確認 → 使用者按開始
→ 將指定 G-code 上傳至指定機台並開始列印
→ 機台回報完成 → 通知取件 → 冷卻、取件、確認平台清空
→ 撤銷本次控制權 → 通知下一位
```

會員操作頁採逐步引導，細部軸移動收在展開區。開始列印、進退料與軸移動的條件由後端再次檢查，無法透過修改瀏覽器繞過。噴嘴未達站點設定的最低溫時，進退料按鈕不開放；機台未回報座標時，軸移動不開放。

## 啟用前設定

由 Owner／Admin 到「會員服務工作台」的「自助免費列印站」設定：

1. 先在既有硬體橋接設定建立實際機台連線，支援 **Moonraker／Klipper 或 OctoPrint**。PrusaLink、手動橋接及未實作的機型連線不提供假成功。
2. 核對實體機台的列印範圍與噴嘴；將經此機台實際驗證的切片結果完整 `profileName` 設為站點設定。管理頁可選擇已完成免費切片的名稱，但選到參考設定不代表已通過實機驗證。切片及送印時名稱必須相符，設定異動會阻擋舊檔開始。
3. 填入既有 3DSTU_PETG 耗材對應的預熱溫度、進退料最低溫與可取件平台溫度；程式不以任意 PETG 溫度冒充使用者參數。
4. 設定 API 的 `LAYERPILOT_SMTP_HOST`、`LAYERPILOT_SMTP_PORT`、`LAYERPILOT_SMTP_SECURE`、`LAYERPILOT_SMTP_USER`、`LAYERPILOT_SMTP_PASSWORD`、`LAYERPILOT_SMTP_FROM`。`LAYERPILOT_PUBLIC_URL` 用於 Email 的操作頁連結。
5. 核對到場／準備期限後勾選開放。未綁機台、設定不完整、未配置 SMTP 或站點未開放時，無法加入自助排隊。

目前專案中的 Artillery M1 Pro 設定仍是參考試切設定。這次程式實作與模擬硬體測試，不等於水木書苑的實體機台、SMTP 或正式網站已連通。

## 權限與狀態

- 所有會員操作以既有會員登入驗證，不共用員工 Token，也不向會員提供橋接網址、API 金鑰或任意 G-code 入口。
- 每位會員同時只能有一筆尚未結束的排隊／時段；完成切片的匿名憑證在伺服器以 SHA-256 核對，再綁定會員、站點、切片與 G-code。
- 同一時間只有一個 active reservation。使用自己的時段 ID 仍須符合目前狀態、期限、機台閒置、溫度、位置及指定工作，才可執行操作。
- 軸移動僅接受 X/Y/Z、±1/±10 mm；先歸零，使用實際回報的位置與列印範圍檢查。Moonraker 同時核對 homed_axes；OctoPrint 未提供座標時停用微調。
- 每次進退料固定 10 mm，低速執行；Moonraker 保存並還原 G-code 狀態。切片檔只由伺服器儲存空間讀取，以 `3drfm-free-<reservation-id>.gcode` 上傳並指定啟動，避免開始上一份已選檔案。
- 開始命令先持久化 `starting` 與操作 UUID。相同請求重送不會再次啟動。實體命令失去回覆時標記為 `attention`，不自動重送可能已執行的動作。
- 必須先觀察到此指定檔案實際列印，才採用完成訊號；離線、未知檔案與單純回到 idle 都不冒充完成。
- 完成與停止列印後都保留平台占用，等待冷卻及取件確認。列印中不因時段過期交棒。到場／準備逾時只有冷卻且閒置才釋放；否則交由站點人員處理。
- 管理員可在現場確認停止、冷卻與平台清空後，記錄原因並結束異常時段。一般生產排程排除免費站點機台；既有一般控制端不能繞過站點控制。管理員可停止異常列印。

## 持久化、worker 與通知

新增 `freePrintStations`、`freePrintReservations`、`freePrintCommands`、`freePrintMail`，沿用工作區備份／資料庫保存。API 的站點狀態機每 5 秒檢查，頁面讀取也會更新狀態；會員離開網頁不影響排隊與完成通知。

正式 worker 使用既有 `LAYERPILOT_API_INTERNAL_URL`、`LAYERPILOT_WORKER_TOKEN` 呼叫 `/api/internal/worker-cycle`，由 API 序列處理共享資料寫入，避免舊 worker 全文件快照覆蓋剛授出的時段。開放免費站點後，不允許未設定內部 API 的 standalone worker 直接寫共享資料。部署維持單一 API 寫入程序；此文件型儲存模式未提供多 API replica 的分散式硬體鎖。

SMTP 通知使用持久化 outbox，成功後不重複寄送；失敗採退避重試，最多 5 次，會員頁及管理頁可查看寄送狀態。程序中斷留下的寄送中紀錄可回復重試；SMTP 本身不保證程序崩潰瞬間的 exactly-once 投遞。會員通知始終可在網站查看，時段與控制權不由 Email 連結 Token 決定。

## API

| 路徑 | 用途 |
| --- | --- |
| `GET /api/customer/workspace/free-print/station` | 自己的排隊、時段與可操作時的機台狀態 |
| `POST /api/customer/workspace/free-print/reservations` | 用已完成站點切片加入排隊 |
| `POST /api/customer/workspace/free-print/reservations/:id/action` | 報到、檢查、歸零、軸移動、預熱、進退料、開始／暫停／繼續／停止、取件 |
| `GET/PUT /api/member-service/free-print-station` | Owner／Admin 查看與設定站點 |
| `POST /api/member-service/free-print-station/resolve` | 管理員記錄現場處理並結束時段 |

## 同步修正的切片／草稿問題

- 切片預覽有明確「返回編輯模型與參數」，同一份模型可重新設定與擺盤。
- 隱藏只改觀看狀態，不使已完成切片失效；幾何、方向、位置或製程變更會使舊結果失效。
- 「送出代印需求」透過本機保存帶入原始模型、變換及設定。
- 基本層高／填充／壁數在上傳前驗證；統一線寬會明確覆寫設定檔各部位線寬。
- IndexedDB 保存原始模型；同步中繼紀錄保存最新位置、參數及配色，避免重新整理時遺失最後一次修改。共用裝置可明確清除本機工作，不刪雲端資料。
- 代印工作台可下載／還原含模型的完整 ZIP；JSON 明確作為設定摘要。
- 尚未排好或超界的模型可保存雲端草稿，但送出案件／免費申請前仍驗證邊界與重疊。免費草稿選單只列單色 PETG。

## 驗證

`api/free-print-station.test.mjs` 覆蓋兩人 FIFO、會員／工作區隔離、冷擠出與超界拒絕、重複開始、真實檔案指定、完成與取件交棒、不同工作／離線、Email 重試及異常處理。`api/free-print-integration.test.mjs` 覆蓋正式 API 驗證與 worker 資料不覆寫；`api/worker.test.mjs` 覆蓋 API 委派與 standalone 阻擋。

`scripts/check-free-print-session.cjs` 使用本機隔離 API、真實會員草稿與瀏覽器，檢查編輯返回、結果保留、參數驗證、模型交接、重新整理、ZIP 還原、未完成草稿，以及模擬機台的手機引導操作。不向現場機器送命令，不將測試寄送器宣稱為真實 SMTP 投遞。

本次驗證結果：42 個測試檔、348 項測試與正式建置通過；508 個介面控制情境、95 種問號說明實際開啟通過。會員工作台、表面上色、多模型切片與完整「切片→加入排隊→報到→歸零→預熱→進退料→開始→取件交棒」瀏覽器檢查皆通過，包含 320 / 390 px。

另以真實 OrcaSlicer 2.4.2 對同一 20 × 20 × 10 mm 模型驗證統一線寬：0.42 mm 得 2.1173 g／11.4 分鐘，0.8 mm 得 2.6699 g／11.0333 分鐘；輸出設定與走線註解均確認實際線寬已改變。這是隔離環境切片驗證，沒有向現場機台送印。
