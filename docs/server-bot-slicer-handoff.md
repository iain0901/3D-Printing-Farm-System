# 給伺服器 Bot：Creality Hi 設定包接線與 NT$2／克

2026-11-02（Asia/Taipei）。這是網站程式端的交接契約，不是正式部署已完成證據。使用者已確認：免費站點固定 Creality Hi／0.4 mm／3DSTU_PETG，付費標準列印先用同一組設定，以實際總耗材每克 NT$2 計價；暫不開 PLA 自動報價。

## 可直接轉貼的訊息

> 請先讀專案 AGENTS.md、collaboration/README.md 及本文件。使用者已確認免費站點與付費標準列印共用 Creality Hi／0.4 mm／3DSTU_PETG，付費為真切片總耗材 × NT$2／克。請找回原始機器、製程與耗材設定及其繼承依賴；已有 G-code／試切報告不能取代原設定，找不到就停下回報，不從 G-code 猜參數。請整理為 OrcaSlicer 2.4.2 可讀的三份完整、已解析繼承的 JSON，連同版本與 SHA-256 manifest，發布到網站 checkout 之外的獨立設定目錄。API 與 worker 需唯讀掛載同一份發布根目錄並設定 ORCA_PROFILE_BUNDLE_MANIFEST。程式已移除公開切片的內建參考機型回退；缺包、雜湊／機型／材料／版本不符都必須拒絕，不能改回 X1C 或 PLA。請先確認收到並合併本輪程式，勿只改環境變數便宣稱接好。正式替換及重建／重啟前，先保存現有版本／設定、確認待處理工作與取得部署批准；不刪舊設定，不覆蓋共編 UI、AI 成果或任何憑證。驗收時用同一個合成模型實際切片，確認 G-code 的 Creality Hi／0.4／PETG、總克數與耗時，再核對網站價格＝總克數×2及每筆紀錄的版本／雜湊。不要啟動真實列印。請回報版本、非敏感掛載路徑、manifest 雜湊、驗收工作 ID／時間／總克數／金額及回復方式；不要回傳金鑰。

## 目前證據與工作界線

- 程式交付更新：使用者已要求推送新版，本任務的 AI 依賴、Creality Hi 接線與遠端四筆首頁更新已整合為本次 main 交付；請使用完整 main 版本並記錄實際 commit，不要再套先前本機增量 patch。實際推送狀態以 GitHub main／本次交付訊息核對，正式部署仍未執行。

- 另一個 Bot 回報正式站 3drfm.com 的預設為 X1C＋PLA，舊試切成果位於 `/app/hermes/shared-files/default/creality-hi-machine-trial-v1/`；網站端本輪沒有登入該 VPS 獨立重查，也沒有替換正式預設。
- 本專案原公開 worker 另外硬選 Artillery bundled reference profiles，會繞過部署設定；本輪已移除這個選擇分支。不能將此程式碼狀態當成 VPS 現行部署版本。
- 本輪只寫契約／驗證／接線／計價和本機測試，沒有原始 Creality Hi 生產設定，因此不提供假 PETG 溫度、速度、回抽等參數。
- 正式原始設定原在 checkout 下的 `/app/3drfm-farmflow/deploy/orcaslicer/profiles/`，不可繼續作為長期發布位置；先備份再遷移，不能直接清除。測試站相對應路徑由其維護者確認。

## 獨立目錄與版本化

建議主機目錄（部署範本預設，可依實際環境修改）：

```text
/var/lib/3drfm/slicer-profiles/
  releases/<release-version>/
    manifest.json
    machine.json
    process.json
    filament.json
  active -> releases/<release-version>
```

不將生產 JSON 放回 Git checkout、容器映像或網站 build 輸出。發布新版本到新資料夾，不原地覆寫版本內容；保留舊版以便回復。切換 active 前先處理舊佇列：已排隊工作已鎖版本，新版 worker 不會偷偷將舊工作遷移到新設定，不符會要求重切。切片進行中的工作使用私有設定副本，不回寫原包。

API 與 worker 的 Compose 範本已共用：

```dotenv
ORCA_PROFILES_HOST_DIR=/var/lib/3drfm/slicer-profiles
ORCA_PROFILE_BUNDLE_MANIFEST=/profiles/active/manifest.json
ORCA_SLICER_VERSION=2.4.2
```

兩個容器皆將 host 根目錄掛到 `/profiles:ro`。若實際不是用本專案 Compose，請在既有 systemd／容器設定中完成相同契約，不假設相對路徑。環境變數變更需依部署方式重新建立／啟動相應服務才會生效；本機關機不應影響 VPS 估價。

`ORCA_SLICER_SETTINGS_PATH`、`ORCA_SLICER_FILAMENT_PATH` 僅保留舊的員工個案明確指定功能，**公開站點／試切／自動報價不再以它們取代設定包**，也不再硬選內建 Artillery／X1C。舊 worker 未更新前不具備此防護。

## 設定包契約

從 `deploy/orcaslicer/profile-bundle.manifest.example.json` 複製範本後填實值。範本的 0 尺寸／0 雜湊故意無效，不是可用設定包。

- `schemaVersion: 1`，`policyId: creality-hi-04-3dstu-petg-v1`；version 僅英數、點、底線、連字號，最長 80 字元。
- `engineVersion` 必須等於 API／worker 指定的 Orca 版本，目前為 2.4.2。
- 固定 machine Creality Hi、nozzleDiameter 0.4、material PETG、materialLabel 3DSTU_PETG、baseLayerHeight 0.2。
- `buildVolume` 請從真實 machine JSON 的 printable_area／printable_height 取得；程式會比對，不能填參考平台數字冒充。
- files.machine／process／filament 各含版本資料夾內的相對 path、原始檔案位元組的 SHA-256；禁止逃出資料夾或使用外部 symlink。
- 每份 JSON 需有正確 type、name；機器需有正確 printer_model／nozzle_diameter／列印範圍，耗材 filament_type 必須 PETG，製程基礎 layer_height 0.2；相容機型需對應。三份需是完整有效的 resolved presets，不能只刪 inherits 而遺失父設定。原參數與起迄 G-code 必須保留。
- 實際工作只在私有副本覆寫使用者明確選擇的層高／填充／壁數／支撐與允許的進階參數；原包不修改。包雜湊及私有三份有效 JSON 雜湊均會記錄。

## 上線前驗收，依序回報

1. 取得本次 main 完整程式並記錄 commit，核對已有 profile-bundle、maintenance-advisor、printing-policy 及本文件。前輪 AI 依賴與四筆首頁更新已一併整合；不能拿舊增量 patch 當獨立發布包，不 force push，也不把舊 checkout 整包蓋回正式站。
2. 唯讀確認原始設定、依賴、Orca 實際版本、目前掛載與環境變數名稱；不可輸出憑證或整份 `.env`。
3. 以原始設定解析繼承、真切片驗證；使用新版本目錄＋實值 manifest。網站程式不製造原始機型／耗材參數。
4. 取得部署批准後，備份現行映像／設定／資料庫，確認活躍佇列處理方式及回復步驟，才切換唯讀掛載、發布 active、更新 API／worker。不要用刪除舊資料的方式切換。
5. 在 worker 容器執行 `node /app/scripts/check-slicer-profile.mjs`。該命令只驗完整性及 metadata，不執行切片，不能當成真切片已通過。
6. GET `/api/public/slicing-quotes/config` 應回 available:true、正確機型／噴嘴／材料／版本與 hash。缺包應回 available:false；新增工作應 503 且不保存模型、不顯示猜測價格。
   免費站點另有現場 profileName 比對：完成第一筆正確免費試切後，將該筆結果的完整 profileName 對照站點設定；不能只換前端標籤。確認 station printerId／bridge 確實指向 Creality Hi，但不得為本次估價驗收自行開放站點、更改溫度／安全設定或啟動列印。舊無版本切片不能新排隊或開始列印，需維護者確認後重切。
7. 用同一個無個資測試 STL，在原始試切與網站路徑各切一次，保持相同 overrides。比對機型、噴嘴、材料、耗時、模型／支撐／其他耗材及總克數。正式列印需額外批准，此處不啟動硬體。
8. 付費 48.5 g 整單應 NT$97，即使 quantity=2 也不能再乘一次；免費工作不顯示付費金額。此為標準列印費，不額外套舊最低消費、機時、5% 稅額、檔位或急件費。金額算到小數兩位；正式支付若要求整數 TWD，請另確認取整政策，不能默默改成最低消費。運送與人工服務仍走原有確認流程，不混進這個每克費率。
9. 驗證 PLA／未核准材料、多色自動報價拒絕；其他設計仍可交專員。改模型／數量／參數後舊報價失效；送出案件時驗證來源模型雜湊、數量及參數相符。
10. 在測試環境驗證缺檔、改 hash、舊版本及 G-code 身分不符會失敗；不要破壞正式 active 來測。回報完整非敏感證據，尚未通過的項目如實列出。

既有已完成歷史報價保留原始紀錄，不批次改價、不假稱歷史所有工作都用了 X1C。舊設定尚未完成的工作需由維護者確認後重切，不能假填新版本標籤。
