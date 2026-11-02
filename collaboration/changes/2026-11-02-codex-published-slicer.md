# 修改紀錄：發布設定包接線與 Creality Hi 每克 NT$2

- 日期：2026-11-02（Asia/Taipei）。
- 工作者：本對話 Codex；SLICE-20261102-01。
- 基準：本機 main 504a774，加本任務前輪保留的未提交 AI 成果。fetch 核對 origin/main 已至 ade8131，四筆僅首頁／共編更新；本輪不覆蓋首頁、不強制合併或推送。
- 狀態：本機修改與測試完成，待整合、原始生產設定包及正式驗收。未提交／推送／部署。

## 目的與授權

使用者確認免費站點 Creality Hi／0.4 mm／3DSTU_PETG，付費先同配置每克 NT$2；隨後要求「好請改城市，然後也給我給伺服器BOT的訊息」，依上下文理解「改程式」。未將這句解讀成直接部署或聯絡另一個 Bot 的授權。

另一個 Bot 的 VPS 查核是外部提供的證據，本輪未登入其主機獨立核對。程式碼另有可重現問題：公開切片硬選 Artillery bundled reference profile，會繞過部署的機器／耗材路徑。本輪移除此分支；沒有假稱正式站現行部署一定等於此 checkout。

## 修改內容

| 檔案 | 改動 |
| --- | --- |
| frontend-vue/src/utils/printing-policy.mjs（新） | 單一業務政策：Creality Hi、0.4、3DSTU_PETG、基礎 0.20 mm、TWD 2／g |
| api/profile-bundle.mjs（新） | 嚴格 manifest、三份完整／無繼承 JSON、SHA-256、路徑與 symlink 邊界、機型／噴嘴／耗材／列印範圍／版本檢查；缺包 503、版本不符 409；標準整單總克數計價，不重乘數量、不套舊加費 |
| api/orca-worker.mjs | 公開工作只載已鎖設定包，不理舊 X1C／PLA 預設路徑；工作 overrides 寫私有副本，不回寫原包；檢查 G-code 機型／噴嘴／材料與實際回報 Orca 版本；上傳基礎／有效設定雜湊。舊員工個案明確指定功能保留，未指定則失敗 |
| api/cases-module.mjs | 公開 config 狀態；缺包時在儲存上傳前拒絕；新公開工作鎖版本，結果驗證 bundle／引擎／有效設定 hash，保存設定與來源；標準 PETG 真切片按 NT$2 計價，免費／studio 不收費。可取消本人付費工作；舊有模型參考件估算端點不再當實際代印價回退 |
| api/member-workspace.mjs | 草稿送出可帶私密報價 token；核對來源模型 bytes、數量、材料、層高、填充、壁數、支撐與進階設定，將實測報價／版本附到真案件，不將 token 曝露給客戶 |
| api/free-print-station.mjs／test | 舊無版本切片不能新排隊或開始列印；保留既有現場 profileName 與權限／安全驗證，不做任何硬體動作 |
| Workbench.vue | 既有付費工作台真正建立／輪詢切片工作，結果顯示克數×2與版本；修改後清除、不採晚到回應；送出案件帶同一切片結果。多色／其他材料／急件仍可人工需求，不假裝已配置自動製程 |
| SlicerLab.vue、Wizard.vue、api/public.js | 固定已確認自動材料／機台標示、讀取後端設定包狀態、缺包報錯、顯示真實版本；不改全域樣式或三維畫布設計 |
| Dockerfile、deploy/orcaslicer/Dockerfile | 補 runtime 所需共用 utils，worker 帶獨立完整性檢查命令；僅改範本，未建置容器 |
| docker-compose.yml、.env.example | API／worker 共用 checkout 外 host 目錄，唯讀掛 `/profiles`，載入指定 manifest；沒有寫實際 `.env` 或憑證 |
| manifest 範本、profiles README、check-slicer-profile.mjs（新） | 可供伺服器 Bot 填實值的契約；範本故意無效，不內塞未知的生產參數。CLI 只檢完整性、顯示安全階段碼，不冒充真切片 |
| profile-bundle.test／test-helper（新）、既有 Orca／公開切片／會員測試 | 合成資料驗證沒有 fallback、路徑／雜湊／版本／機型錯誤、原包不變、有效 overrides、報價及案件綁定；不拿 fixture 當生產設定 |
| check-published-slicing.cjs（新） | 本機 API＋瀏覽器真建立工作，模擬 worker 回傳，驗證 NT$97／版本／送案件／參數修改失效及兩個寬度 |
| check-site-agent.cjs | 原廣泛 slicing-quotes fixture 需放行新增 config 路由，避免誤將假完成工作回給設定狀態查詢；不是為繞過真設定驗證 |

## 保留與界線

遵守共編規範與 D-001～D-006。保留前輪語音／建議、私有資料隔離與 AI 成果、既有其他材料／多色設計／人工流程；沒有恢復舊首頁或改全域 token。已完成歷史報價不批次改價，不假稱所有歷史工作用過 X1C。新自動報價暫只允許標準單色 PETG；其他服務不自動套 NT$2 或舊加費。

姓名牌自行新增 STL 仍隔離於專案外，`git apply --check /workspace/3drfm-isolated-20261025/name-badge-stl.patch` 仍通過，未套回。

## 實際驗證

- 最終 `npm run qc`：Rspack build 成功；50 檔／391 項通過，`/tmp/3drfm-hi-complete-qc.log`（2026-11-02 17:28:23 台灣時間開始，測試 64.07 秒）。此前四檔重點回歸 35 項通過，`/tmp/3drfm-hi-release-targeted.log`；最終全套包含新增免費舊設定排隊拒絕測試。
- `check-published-slicing.cjs`：七項通過，最新證據 `/tmp/3drfm-hi-browser-evidence-5hOAE7/`。真實 localhost API 建立及保存工作／案件，**worker 結果是明示合成 fixture，不是執行真 Orca**。48.5 g ×2＝NT$97、無數量二次乘、版本／參數一致、修改清舊價；1440／390 px 無水平溢位。
- 前輪 Agent 十項瀏覽器回歸通過，`/tmp/3drfm-agent-ui-ihKFWU/`；七項語音生命週期通過。沒有真實 OpenAI／麥克風／硬體／付款操作。
- 實際執行完整性 CLI：無 manifest 時 exit 1；合成設定包時 exit 0 並標示 `profile-integrity-only-not-a-real-slice`。本機沒有這次使用者原始生產參數，不能將 fixture 通過當原包試切已通過。
- `git diff --check`、本輪 patch 正／反向套用預檢通過。只檢查，不實際套回或撤銷工作區。
- 最終頁面文字／狀態截圖見上述證據；改前以 504a774 加同任務前輪改動為準，沒有假造本輪完整改前截圖。本機 `/tmp` 不是永久共享網址。
- 未執行 Docker 建置／部署、SSH、發布真 profiles、變更正式安全政策、安裝新套件或聯絡其他 Bot。自建本機測試 API 完成後停止，沒有動其他人的程序。
- 自建最終測試 API PID 293053 已停止；首頁檔案未修改，SlicerLab／Workbench／Wizard 既有 style 與本輪前快照完全相同。最終差異與兩份隔離 patch 預檢通過，沒有提交或推送。

## 差異交付與版本

本輪增量另存 `/workspace/3drfm-slicer-handoff-20261102/creality-hi-petg.patch`，SHA-256 `ae269dd52594cfe001d6b96aa46be33cb4855a4cdc6f710a968a8d240cb1e8ff`，以 `/tmp/3drfm-slice-baseline.ZCTf54/` 保存本輪修改前來源做正向預檢，對現工作區做反向預檢，均通過。

它依賴本任務前輪未提交的 AI 改動（例如 Workbench 用途審查），**不是可直接套到目前 origin/main 的獨立發布包**。先由整合者保留遠端四筆首頁 UI、合併前輪依賴與本輪，再交付明確 commit 給伺服器 Bot；不能只 git pull 就宣稱有這輪程式，不能 force push 或硬套衝突。patch 不含生產設定或密鑰，也不含共編文件的完整歷史修改。

## 待辦與交接

H-007：伺服器 Bot 找回完整原始 machine／process／filament 與繼承依賴，真試切後填 manifest、獨立版本化發布，API／worker 唯讀共用、先備份及確認舊佇列／回復方案，取得部署批准才切換。缺檔就停下，不從 G-code 或其他 PETG 預設猜參數。真實切片時間／耗材與現場色料仍待核對，正式支付若要求整數 TWD 需另確認取整政策。

完整可轉貼訊息與驗收清單：[server-bot-slicer-handoff.md](../../docs/server-bot-slicer-handoff.md)。本輪已完成程式接線，不代表正式站已更改預設或原始設定包已完成驗證。
