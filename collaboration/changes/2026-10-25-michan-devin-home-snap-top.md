# 修改紀錄：首頁開啟時不再自動下滑、頂欄不再蓋住首屏

- 日期：2026-10-25
- 工作者／AI 工具：MichanLiang（UI 設計師）／Devin
- 工作 ID：UI-20261025-03
- 基準 commit：`90848b6`
- 本次 commit／PR：隨本紀錄的提交（直接進 `main`，無 PR）
- 狀態：已完成（本機驗證；未部署）

## 目的與授權範圍

設計師回報：首頁分區下滑（D-UI-20261025-02）一打開就會些微往下捲，最上面的內容被蓋掉，頁面無法停在最上方。只修這個問題；不改後端、API、路由、store、共用 token、`PublicShell.vue` 或其他頁面。

## 原因

- `html { scroll-snap-type: y mandatory }` 下，只有各 `.home-panel` 是吸附點；頂部工具列＋導覽列不是，所以 `scrollY=0` 不是合法位置，瀏覽器一開啟就吸附到第一區塊頂端（桌面 141px、手機 125px）。
- 工具列與導覽列都是 sticky，吸附後就蓋住第一區塊上緣（分類小字、3 的上半部）。
- `--home-chrome` 寫死 108px，但實際頂欄高度為 141px（桌面）／125px（≤760px），所以每屏高度算錯，下一區塊會從底部露出約 33px；導覽列 sticky `top: 32px` 也比工具列實際高度 39px 少 7px，會壓到工具列。

## 修改內容

| 檔案／元件 | 改了什麼 | 為什麼 |
| --- | --- | --- |
| `frontend-vue/src/views/landing/Index.vue`（全域 style 區塊） | `html:has(.brand-home)` 加 `scroll-padding-top: var(--home-chrome)`，預設 `--home-chrome: 141px`、`--home-utility: 39px`；導覽列 sticky `top` 改用 `--home-utility`；移除 `.brand-home { --home-chrome: 108px }` | 吸附點落在頂欄下方，第一區塊對應 `scrollY=0`；變數放在 html 才能給 scroll-padding 用 |
| 同檔 `mounted`／`beforeUnmount` | 以 `ResizeObserver` 量測 `.public-utility`、`.public-header` 實際高度寫入上述兩個變數；載入後 2.5 秒內、使用者尚未操作（wheel／touch／key／pointer）且網址沒有 hash 時，若被瀏覽器推離頂部就拉回 `scrollY=0`；離開首頁時移除變數與監聽 | 不同寬度／字型載入後頂欄高度不同；手機首屏內容高於可視區時 Chrome 會在載入後再微調 4～8px |
| 同檔 scoped style 末端 | `@media (min-width: 761px) and (max-height: 760px)`：`.hero-category` 下距 28→16px、`h1` 改 `clamp(56px, 13svh, 100px)`、下距 26→18px | 1280×720 等矮螢幕首屏原本多出 9px，會造成同樣的被推離頂部；只在矮螢幕生效，一般桌面與手機字級不變 |

## 保留的設計與相容性

- 遵守 D-001～D-005、D-UI-20261025；維持 D-UI-20261025-02 的單屏區塊＋強制 snap，只修正開啟位置與頂欄高度計算。
- 未改共用 `brand-tokens.scss`、`PublicShell.vue`、路由 `scrollBehavior`、文案、配色、圓角、材料資料或估價流程。
- `#services` 等 hash 連結仍由路由處理；使用者一操作即不再干預捲動。

## 設計決策與影響範圍

無新增決策。D-UI-20261025-02 仍為「待確認」，已補註本次修正。影響僅 `/` 首頁。

## 驗證

- `npm run qc`（build + vitest）：通過，45 個測試檔、359 個測試。
- 前端 ESLint：專案既有設定缺 `@vue/prettier`，無法執行（未修，非本次範圍）；本檔在基準版本即未完全符合 prettier，未整份重排以免擴大 diff。
- Playwright（本機 Chrome）量測開啟後 `scrollY`：1440×900、1280×720、1024×768、390×844、375×667 皆為 0（修改前 141／125）；PageDown 依序切到下一區塊，Home 回到 0。前後截圖見 [evidence/2026-10-25-home-snap-top](../evidence/2026-10-25-home-snap-top/README.md)。
- 未用實體手機或 Safari 測試；未接硬體或外部服務。
- 未部署。

## 待辦與交接

- 「01 製作的可能」區塊（`#services`）在桌面約 1100px 高，超過一屏；手機上多數區塊也高於一屏。強制 snap 下這些區塊內部仍可捲動，但不符合「一屏一段」，需設計師決定是否再壓縮（已記入 HANDOFF H-005）。
