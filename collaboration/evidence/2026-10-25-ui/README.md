# UI-20261025-01 驗證證據

本機開發站點；沒有正式帳號、個資、金鑰或實體機台影像。截圖為改後畫面，不是正式部署證據。

## 截圖

| 頁面 | 桌面 1440 px | 手機 390 px |
| --- | --- | --- |
| 首頁 | [桌面](1440-home.png) | [手機](390-home.png) |
| 材料指南 | [桌面](1440-materials.png) | [手機](390-materials.png) |
| 會員登入 | [桌面](1440-portallogin.png) | [手機](390-portallogin.png) |
| 雲端切片 | [桌面](1440-cloud-slicer.png) | [手機](390-cloud-slicer.png) |

首頁截圖的 TPU 是驗證用途選擇後的狀態；切片截圖的精細選項是 UI 測試狀態，不代表修改了系統預設或執行切片。

## 檢查

- [results.json](results.json)：26 個公開入口 × Chromium／WebKit × 1440／390／320 px，共 156 組。WebKit 為瀏覽器引擎測試，不等同實體 iPhone 的 Safari 驗收。
- [contrast.json](contrast.json)：26 個入口 × Chromium 的 1440／390 px，共 52 組；已確認 violations 為零，保留全部 incomplete 待人工複核，不是全站 WCAG 認證。
- 重跑：先在本機啟動前端，再以 `PLAYWRIGHT_MODULE` 指向本機 Playwright 執行 `node frontend-vue/tests/public-ui-review.cjs`；對比檢查另需 `AXE_MODULE` 指向 `@axe-core/playwright`，執行 `node frontend-vue/tests/public-contrast-review.cjs`。`BASE_URL` 預設 `http://127.0.0.1:5174`，只允許 localhost。
- Playwright／axe 為驗證工具，本次未加入專案依賴。
- 修改前截圖未擷取；原始版可由基準 `cd65d378581dd4231f4a8844a078e7f5009e2c47` 查閱。

詳見 [修改紀錄](../../changes/2026-10-25-opencode-public-ui.md)。
