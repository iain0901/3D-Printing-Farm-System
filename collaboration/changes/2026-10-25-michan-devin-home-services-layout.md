# 修改紀錄：首頁「01 製作的可能」重新排版

- 日期：2026-10-25
- 工作者／AI 工具：MichanLiang（UI 設計師）／Devin
- 工作 ID：UI-20261025-05
- 基準 commit：`1e1cb3e`
- 本次 commit／PR：隨本紀錄的提交（直接進 `main`，無 PR）
- 狀態：已完成（本機驗證；未部署）

## 目的與授權範圍

設計師回報「01 製作的可能」（`#services`）排版很詭異，要求變好看一點，並明確說**這一區不用壓在一屏內**。只改這一區的版面 CSS；不改文案、圖片、連結、配色、字體、後端、API、路由、共用 token、`PublicShell.vue` 或 `public-readability.scss`。

## 原因

- 標題用 `1fr 2fr` 兩欄：小標在左、大標從 1/3 處開始，左側大片空白，看起來像錯位。
- 兩個案例欄寬不同（`1.2fr 1fr`），而且學校是「圖上字下」、企業是「字上圖下」、圖高 220／200px 不同，形成不對齊的鋸齒。
- 為了塞進一屏，個人區塊用 `margin-top: auto` 貼底；手機版兩個案例硬擠成兩欄、文字截成 2 行、字級 12px，個人區塊標題被塞進 72px 寬欄，一行只剩一兩個字。

## 修改內容

| 檔案／元件 | 改了什麼 | 為什麼 |
| --- | --- | --- |
| `frontend-vue/src/views/landing/Index.vue`（scoped `.editorial-heading`） | 改為小標獨立一行、大標靠左，「所有 FDM 製作服務 →」靠右對齊大標底部 | 移除左側空白，與上方「校園免費列印」入口的左字右連結一致 |
| 同檔 `.application-layout`、`.application-story`、`.story-business` | 兩欄等寬（`1fr 1fr`、gap 48px）；兩張案例卡都是「圖在上、文在下」，企業卡用 `order: -1` 調整視覺順序（DOM 未動），圖高統一 220px | 兩張卡對齊成同一結構 |
| 同檔 `.applications-section`、`.personal-story` | 區塊下方留白 48px；個人區塊 `margin-top: auto` → `56px` | 不再為一屏貼底，改用固定間距 |
| 同檔 `@media (max-width: 760px)` | 案例改單欄、圖高 180px、取消 2 行截斷；標題 26px；個人區塊改「標題＋112px 圖」兩欄，說明文字在下方整列 | 手機不再擠壓、文字可完整閱讀 |

## 保留的設計與相容性

- 遵守 D-001～D-005、D-UI-20261025；保留 D-UI-20261025-02 的 snap 行為，本區只是允許高於一屏（設計師明確同意）。
- 文案、圖片、配色（含企業卡淺藍底）、字體、連結目的地都沒改。1100px 以下圖高 160px 的既有規則保留。

## 設計決策與影響範圍

無新增長期決策。H-005 已補註：設計師確認「01 製作的可能」不必壓在一屏內。影響僅 `/` 首頁 `#services`。

## 驗證

- `npm run qc`（build + vitest）：通過，45 個測試檔、359 個測試。
- Playwright（headless Chrome 137、Noto CJK）前後截圖：見 [evidence/2026-10-25-home-services-layout](../evidence/2026-10-25-home-services-layout/README.md)。區塊高度：1440 由 1179 → 1290px、1024 由 1094 → 1186px、390 由 1278 → 1643px（手機改單欄完整顯示）。
- 未用實體手機或 Safari 測試；未部署。

## 待辦與交接

無新增。
