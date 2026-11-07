# Clef 雙圖品管決策模擬

- 2026-11-07（Asia/Taipei）；Codex；QC-COMPARE-20261107-05。
- 基準 main 02b4773；開工乾淨，遠端同步。提交隨本紀錄。
- 依使用者「用 Cloudflare Clef 比對，請模擬實做出來效果」，並收到官方文章核對後完成。未部署、未接 Cloudflare 憑證或真實推論。

## 研究更正

Cloudflare 2026-10-01 官方文章確認 Clef／Clef-flash 是支援圖片的決策模型，文章提及 Jev。先前助理依名稱猜測 CLIP／JEPA 不正確；本次最終實作以官方輸入／輸出 schema 的 choice／noul 為依據，不採相似度當品管判斷。

來源與價格、圖片大小、每次四圖限制、後續接線要求見 docs/operations-demo.md。沒有以一般性能榜單冒充 FDM 品管成績。

## 修改

- 新 clef-inspection-demo.mjs：每角度的模型／照片識別碼、外觀 choice 與分層／缺料／補拍 noul 問題；最多兩對圖片一批。固定 fixture 機率，非真推論。缺圖守門與低信心複核；照片重複角度不算四面齊全。
- operations-demo.mjs 委派品管結果至 Clef 展示模組；不改監控／排程。
- operations/index.vue／operations.css：雙圖決策進度、取消、每角度選取、機率明細、信心門檻、接線規劃展開及報告 evidence。改門檻清除舊結果；換物件／離頁清理 timer。
- 保留人工理由必填與缺圖不可通過；低信心結果可由人員填理由複核。報告保存門檻、問題與輸入對應、模擬來源，不填假 token／延遲。既有儲存紀錄相容。
- 不改其他 OpenAI 功能、機台 profiles、資料庫、密鑰、官網／會員 UI 或共用 token。D-014 僅記錄本輪品管選型與模擬範圍。

## 驗證

- npm run build 成功，既有 deep-selector 警告保留；/tmp/clef-build.log。
- operations-demo.test.mjs：5 項通過，含機率加總、四圖分批、choice／noul、低信心、缺圖／重複角度、無效門檻，以及原保養／回放測試；/tmp/clef-tests.log。本輪沒有重跑完整後端 suite。
- scripts/check-operations-demo.mjs：9 組真本機登入／UI 流程通過，新增 Clef 明細、取消、調高門檻→複核→調低後舊結果失效、下載報告來源與批次驗證。原保養／監控、手機選單仍通過；零頁面錯誤、HTTP 失敗或非預期業務 API 寫入。
- 1440×1000／390×844；檢視桌面品管截圖，手機無水平溢位；截圖在 /tmp/3drfm-operations-evidence，會覆蓋前輪暫存證據。本輪前圖可由 02b4773 重現，未保存額外前圖。

## 交接

前端發布方式不變。Clef 模擬不提供可用的真 API adapter，imageRefs 不是 images bytes；後端須處理真渲染／實拍、Base64、限額、憑證、回傳驗證、錯誤及校準。缺陷框為獨立人工示意標註，不是 Clef 回傳的定位結果。見 H-015。
