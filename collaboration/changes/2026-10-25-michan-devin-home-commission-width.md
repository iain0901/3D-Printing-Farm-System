# 修改紀錄：首頁「03 開始製作」01～04 步驟區加寬

- 日期：2026-10-25
- 工作者／AI 工具：MichanLiang（UI 設計師）／Devin
- 工作 ID：UI-20261025-04
- 基準 commit：`8390f36`
- 本次 commit／PR：隨本紀錄的提交（直接進 `main`，無 PR）
- 狀態：已完成（本機驗證；未部署）

## 目的與授權範圍

設計師回報：「03 開始製作」右側 01～04 步驟太窄，說明文字被擠成每行一兩個字，要求步驟區往左拓寬。只改這個區塊的版面；不改文案、配色、字級、圖片、後端、API、路由、共用 token、`PublicShell.vue` 或 `public-readability.scss`。

## 修改內容

| 檔案／元件 | 改了什麼 | 為什麼 |
| --- | --- | --- |
| `frontend-vue/src/views/landing/Index.vue`（scoped `.commission-section`） | `grid-template-columns: 1fr 1.2fr` → `minmax(0, 0.75fr) minmax(0, 1.6fr)`；`column-gap: 10%` → `5%` | 左側標題欄縮窄（「就差這一步。」仍單行），右側步驟欄變寬 |
| 同檔全域 style 區塊，`@media (min-width: 761px) and (max-width: 1100px)` | 步驟圖不再 float，改放在說明文字下方、靠右（88×64） | 平板／窄桌面寬度下，100px 浮動圖會把文字擠到只剩 6～8 字寬；改到下方後文字可用整欄寬 |

選擇器需含 `#public-content` 才能蓋過 `public-readability.scss`（UI-20261025-01）對 `.process-image` 的 float 設定；該共用檔未修改，1100px 以上仍沿用其 100×80 浮動圖。

## 實測寬度（說明文字 `p` 寬度，修改前 → 後）

| 視窗 | 步驟卡 | 說明文字 |
| --- | --- | --- |
| 1440×900 | 304 → 401px | 228 → 325px |
| 1024×768 | 238 → 313px | 162 → 237px |
| 860×800 | 197 → 260px | 121 → 184px |
| 390×844 | 不變（單欄） | 不變 |

## 保留的設計與相容性

- 遵守 D-001～D-005、D-UI-20261025、D-UI-20261025-02；未改文案、圖片、字級、配色、圓角。
- 手機（≤760px）維持原本單欄排版，不受影響。
- 區塊高度：1440 不變；1024 由 722 → 652px、860 由 810 → 682px（文字行數變少）。

## 設計決策與影響範圍

無新增長期決策。影響僅 `/` 首頁「03 開始製作」區塊。

## 驗證

- `npm run qc`（build + vitest）：通過，45 個測試檔、359 個測試。
- Playwright（headless Chrome 137，Noto CJK 字型）前後截圖：見 [evidence/2026-10-25-home-commission-width](../evidence/2026-10-25-home-commission-width/README.md)。「修改前」截圖是以注入舊 CSS 重現。
- 未用實體手機或 Safari 測試；未部署。

## 待辦與交接

無新增。H-005（部分區塊超過一屏）仍待設計師決定。
