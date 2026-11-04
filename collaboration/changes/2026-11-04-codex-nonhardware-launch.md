# 非硬體後端上線準備與失敗處理

- 日期：2026-11-04（Asia/Taipei）
- 工作者：Codex；工作 ID：BACKEND-20261104-05
- 基準 commit：ba9c10a38bae0b63da4fb95caaaffa637967895c
- 本次 commit：隨本紀錄提交，以 git log 查詢。
- 狀態：程式修補完成；最終回歸結果見下；正式外部服務與部署待驗收。

## 目的與授權範圍

使用者要求完成實體印表機連接以外的後端，並明確回覆先用現有流程完成上線準備：LINE Pay、人工發票／收據及物流單號查詢。不擴充未選定的商家協定、不配置憑證、不操作真實硬體、不發布正式站。

## 修改內容

| 檔案／元件 | 改動與原因 |
| --- | --- |
| api/member-notification-delivery.mjs、member-workspace.mjs | 一般會員通知持久排隊、背景同步、SMTP 明確拒收的有限退避重試、不明結果人工確認；先 claim 再發送，避免重複 worker tick 發送；首次啟用歷史基準不寄信，版本標記持久保存，之後重啟仍補抓新進度。舊 quote／free-print 管道保持獨立。 |
| api/server.mjs | 密碼重設缺 SMTP 明確不可用、先保存 hash 再寄、持久記錄未確認送達、無效日期拒絕、繁中郵件；LINE Pay 確認前後保存處理狀態供人工對帳；production 關閉示範 telemetry，防止無硬體假完成。 |
| api/launch-services.mjs、member-workspace.mjs | Owner／Admin 設定診斷、寄信異常數及 LINE Pay 待對帳列表；通知狀態與需確認重送的管理 API。workspace 隔離、不回傳金鑰，不把 configured 當 verified。 |
| docker-compose.yml、.env.example | 補公開 URL、SMTP、LINE Pay／sandbox、LINE Messaging、客服必要變數傳入 API；更新不實的「全部付款仍為 placeholder」註解。 |
| frontend-vue/src/views/portal/Reset.vue | 僅修改申請成功訊息，不再把收到申請描述成已寄出。未改版型、樣式、導航或共用 token。 |
| api/member-notification-delivery.test.mjs、nonhardware-launch.test.mjs | 成功、重入、超時／遲到成功、重啟、歷史基準、保存失敗、有限重試、偏好、跨 workspace、員工角色、環境傳入、重設及付款異常持久化測試。 |
| docs/nonhardware-launch.md、member-workspace.md、collaboration | 現行範圍、逐項實作／驗收證據、可轉貼伺服器 Bot 訊息、診斷端點、外部待驗收清單與 D-010／H-012。 |

## 保留的設計與相容性

遵守 D-001～D-009，新增使用者確認的 D-010。讀取共編規範、現有程式與近期管理／站點修改紀錄；不覆寫官網、會員／員工新介面、Google 登入、AI、原有切片及排隊控制。保留 Creality Hi／0.4 mm／3DSTU_PETG、NT$2／克與 checkout 外唯讀設定包；不修改機型、溫度或速度參數。開工與提交前 fetch 遠端核對；無他人未提交改動。

## 驗證

- `npm test -- --maxWorkers=2`：最終 56 檔／434 項通過，`/tmp/nonhardware-acceptance-tests.log`，66.34 秒。
- 通知／上線專項 2 檔／19 項通過，包括最終新增的重啟情境。全部使用隔離 JSON／stub；Postgres adapter 測試為 fixture，不是真 PostgreSQL 連線驗證。
- `npm run build` 通過，`/tmp/nonhardware-final-build.log`；未重跑視覺截圖，唯一前端改動為重設結果文字，無版型變更。
- `git diff --check` 通過。暫存 log 不是長期團隊附件；可依文件命令重跑。
- 未部署；未呼叫正式 SMTP／Google／LINE Pay／OpenAI，未控制硬體、未改 Nginx／CSP。僅 Git 遠端同步與本機測試。

## 待辦與交接

H-012／docs/nonhardware-launch.md 有完整驗收步驟與維護者訊息。必要外部設定及測試：Google OIDC、SMTP 實收、LINE Pay sandbox 對帳、OpenAI 各介面、真 Orca 設定包／切片、PostgreSQL／物件檔案備份還原。這些還未驗證，不能宣稱全站正式可用。未新增自動退款／商家對帳、電子發票、即時物流。人工流程須有實際營運人員負責。

仍是單一 API 寫入者；新投遞不是跨副本訊息系統，訊息可能需人工確認，不保證 exactly-once。還原前停 API／投遞，還原後檢查不明通知及交易。實體印表機與影像依 H-002／H-011 另接，未完成前免費站點不開放。
