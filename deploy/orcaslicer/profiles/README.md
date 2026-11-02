# 生產設定不再存放於網站 checkout

本目錄只保留說明。請將已驗證的 Creality Hi／0.4 mm／3DSTU_PETG 完整設定包發布到主機獨立目錄，預設 `/var/lib/3drfm/slicer-profiles/releases/<version>/`，API 與 worker 唯讀掛載同一個根目錄到 `/profiles`。

使用 `ORCA_PROFILE_BUNDLE_MANIFEST=/profiles/active/manifest.json`。公開切片不再使用舊路徑或內建參考設定；缺包、雜湊／機型／材料／版本不符一律失敗，不退回 X1C、PLA 或通用估算。

完整 manifest 範本、原始設定／繼承依賴要求、發布／回復及真切片驗收見 [伺服器 Bot 交接](../../../docs/server-bot-slicer-handoff.md)。範本故意無效，不包含原始生產參數，不可直接發布。

舊員工個案仍可明確指定 settingsPath／filamentPath；此功能不能覆寫公開站點／自動報價已鎖定的設定包。G-code 維持人工核准後才可列印，本輪不啟動硬體。
