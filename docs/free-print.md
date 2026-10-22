# 免費列印站點入口

公開入口：`/#/free-print`。目前唯一站點為「國立清華大學・水木書苑」，專頁為 `/#/free-print/nthu-shuimu`，可供直接連結或未來製作站點 QR code。網址保留站點選擇，重新整理後仍顯示同一站；未知站點轉入 404，不回退成已知站點。

首頁、製作服務導覽與頁尾均有免費列印入口。不需登入即可瀏覽與選站；不新增圖片，避免超過全站插圖重複上限。站點資料集中於 `frontend-vue/src/content/freePrintStations.mjs`。

本次完成站點選擇與說明頁，尚未開放免費送印、免費切片工作、站點佇列或機器控制。既有付費 Orca 報價不等同免費站點工作流程，不將選站轉成付費案件。另列出的付費代印連結有清楚標記。

待站點確認使用資格、免費額度、開放時段、可用材料／設備後，再設定伺服器端規則與完整送印流程。目前不捏造地址、開放時段、學生身分限制、設備在線狀態或可用名額。

驗證：`npm run build`、`npm test -- api/public-brand.test.mjs api/public-pages.test.mjs api/public-service-content.test.mjs`，以及 Playwright 的 `scripts/check-free-print.cjs` 和 `scripts/check-brand-site.cjs`。瀏覽器腳本使用既有 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH`、`BASE_URL` 設定；見 `docs/public-ui-redesign.md`。
