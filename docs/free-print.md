# 免費列印站點入口

公開入口：`/#/free-print`。目前唯一站點為「國立清華大學・水木書苑」，專頁為 `/#/free-print/nthu-shuimu`，可供直接連結或未來製作站點 QR code。網址保留站點選擇，重新整理後仍顯示同一站；未知站點轉入 404，不回退成已知站點。

首頁、製作服務導覽與頁尾均有免費列印入口。不需登入即可瀏覽與選站；不新增圖片，避免超過全站插圖重複上限。站點資料集中於 `frontend-vue/src/content/freePrintStations.mjs`。

站點頁的「開啟線上切片」進入 `/#/free-print/nthu-shuimu/slicer`，不需登入。可加入最多 5 個 STL（合計 10 MB、每個最多 20 萬三角面）、逐個等比例縮放與三軸旋轉，並設定層高、填充率、外壁、自動支撐與自動擺放。免費列印固定顯示 **3DSTU_PETG**；依使用者確認，此名稱是既有 PETG 切片設定的前端名稱，不另造耗材參數。API 仍使用 `material: PETG` 並拒絕其他材料，worker 也做相同防護。層高可選 0.12／0.16／0.20／0.28 mm。模型以 mm 解讀。

模型在 Web Worker 內處理，變形後的同一份二進位 STL 同時用於 3D 預覽及實際上傳；不是只改變畫面。工作台提供 260 × 260 mm 參考平台俯視圖、模型包圍框、拖曳／方向鍵移位、中心 X／Y 數值、90° 快速旋轉、置中、移除、自動平躺與自動排版。自動平躺把目前最短軸轉為高度方向，不宣稱是支撐最少的最佳方向；自動排版按包圍框排入單一平台，保留 5 mm 邊界與至少 2 mm 間距。支撐與底邊需以最終切片檢查。

預設保留手動方向與布局：API 以真實 STL 座標再次驗證位置、範圍及包圍框間距，再由 worker 組成核心 3MF 的獨立物件與 build transform，搭配 `--arrange 0 --orient 0`，避免載入多個 STL 時被 CLI 自動置中。UI 操作「自動排版」只更新工作台座標，送出後仍保留這份布局。另可勾選切片時由 Orca 自動排版／自動定向；定向會一併開啟排版，避免旋轉後重疊，並告知最終位置可能不同。按下「開始切片」才會上傳檔案。

免費切片共用既有 Orca 工作佇列，但使用 `purpose: free-print` 與伺服器驗證的 `stationId`，每個 STL 限一份模型，不計算價格、不建立案件或列印佇列，也不能拿免費切片憑證轉成付費報價。API 站點白名單位於 `api/cases-module.mjs`，測試確保與公開站點目錄一致。免費材料對應僅影響免費站點，不更動付費報價的材料選項。

完成後顯示真實切片的預估分鐘、模型／支撐／其他用料，並由實際 G-code 產出逐層擠出路徑俯視圖。支援 M82／M83、G90／G91、G92；站點切片停用圓弧擬合。預覽上限為 3,000 層、每層 1,500 段、總計 100,000 段，超過時明確標示省略；多盤結果不冒充單盤預覽。這不是可直接送印的 G-code 下載。

工作憑證以雜湊存於伺服器，瀏覽器只保留目前分頁 sessionStorage 的工作 ID／憑證／檔名，不存模型內容；重新整理可恢復查詢。狀態、逐層預覽與取消工作都使用 `x-slicing-token`，不放在網址。回應禁止快取。等待、處理中、失敗與取消皆有獨立顯示；等待超過兩分鐘會提示服務可能未啟動，不捏造進度。取消後不接受晚到的 worker 結果（已在執行的運算仍可能在背景結束）。

目前使用 OrcaSlicer 2.4.2 內建 Artillery M1 Pro／0.4 mm 噴嘴參考設定，**不是已確認的水木書苑機台**。尚未開放現場免費送印、站點列印佇列或機器控制。另列出的付費代印連結有清楚標記。

## 執行與驗證

正式環境必須同步更新 API、前端及 `orca-worker`（既有 `docker-compose.yml` 已定義），並讓 API 和 worker 使用相同的 `LAYERPILOT_WORKER_TOKEN`。不要使用 Compose 的範例預設憑證。worker 需能執行 OrcaSlicer 2.4.2，且 `ORCA_SLICER_RESOURCES_ROOT` 指向其內建 `resources/profiles`；只有前端部署成功不代表切片服務已啟動。

API 契約沿用 `/api/public/slicing-quotes` 的建立與狀態查詢；新增 `GET /:id/layers` 與 `DELETE /:id`，只開放給持有該免費工作憑證的請求。未登入者無權使用內部 worker 或印表機端點。

實測紀錄（2026-10-22）：在隔離資料庫與無對外網路的 Orca CLI 容器中，從瀏覽器上傳 10 × 20 × 30 mm 測試方塊，縮放 50%、X 軸旋轉 90° 後，送入的尺寸為 5 × 15 × 10 mm；PETG、0.20 mm 層高、15% 填充、兩圈外壁、保留方向。OrcaSlicer 2.4.2 實際產生 50 層、5.983 分鐘、0.641 g，介面顯示約 6 分鐘／0.64 g。這是開發環境測試，非實體列印或正式站部署證明。

執行 `npm test -- api/public-slicing-quotes.test.mjs api/orca-worker.test.mjs api/layer-preview.test.mjs api/station-model.test.mjs` 及 `npm run build`。`scripts/check-station-slicer.cjs` 預設以攔截 API 的方式驗證瀏覽器狀態、錯誤、取消與重新整理；`REAL_SLICE=1` 則不攔截 API，必須有真實 worker，驗證模型到實際切片結果。兩者都只允許指向本機隔離測試伺服器；不可對正式客戶資料庫執行。瀏覽器腳本沿用下列 Playwright 環境變數。

布局測試另執行 `api/station-plate.test.mjs`。瀏覽器真實切片測試現在使用兩個模型，驗證手動中心 `(40, 50)` 與 `(90, 100)` 對應的擠出路徑沒有被重新置中；加上 `AUTO_LAYOUT=1` 可驗證 Orca 自動定向／排版。其他檢查包含固定耗材、包圍框重疊／超界阻擋、滑鼠與鍵盤位置修改、自動平躺、移除與取消／重試。

免費列印材料已固定為 3DSTU_PETG。待站點確認使用資格、免費額度、開放時段與設備後，再設定伺服器端規則與完整送印流程。目前不捏造地址、開放時段、學生身分限制、設備在線狀態或可用名額。

驗證：`npm run build`、`npm test -- api/public-brand.test.mjs api/public-pages.test.mjs api/public-service-content.test.mjs`，以及 Playwright 的 `scripts/check-free-print.cjs` 和 `scripts/check-brand-site.cjs`。瀏覽器腳本使用既有 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH`、`BASE_URL` 設定；見 `docs/public-ui-redesign.md`。
