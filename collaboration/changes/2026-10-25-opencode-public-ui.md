# 網站改善文件：僅前端 UI 調整

- 日期：2026-10-25（Asia/Taipei）
- 工作者／工具：OpenCode（GPT-6.1 Sol）
- 工作 ID：UI-20261025-01
- 基準 commit：`cd65d378581dd4231f4a8844a078e7f5009e2c47`
- 本次 commit：隨本紀錄的提交；精確 SHA 請用 `git log -- collaboration/changes/2026-10-25-opencode-public-ui.md` 查詢。
- 狀態：前端修改與本機驗證完成；正式部署、團隊視覺審閱及營運數據補齊待完成。

## 目的與授權範圍

使用者要求依本機「網站改善.docx」（含內嵌用途頁截圖）直接修改 GitHub 專案，明確限制只做前端 UI，不更動另一位作者的系統、後端與系統設計。本次先讀全部共編規則與紀錄，確認本機乾淨並 fetch；基準與 `origin/main` 相同。

## 文件要求對照

| 項目 | 本次結果與界線 |
| --- | --- |
| B1 箭頭 | 站內文字與圖示改 →，送出按鈕移除箭頭；保留另開視窗重設密碼與外部物流連結的 ↗。未改目的地、事件或權限。 |
| B2 主按鈕 | 公開頁主要 CTA 沿用既有深藍 `--rfm-primary`；不改全域 token、不重新設計管理後台或材料／狀態配色。 |
| B3 可讀性 | 公開頁段落／說明／圖說與切片參數字級提高，修正圖說與估價步驟低對比。26 個入口 × 2 寬度的 axe 對比檢查無已確認違規；incomplete 保留，未宣稱全站所有狀態皆符合 WCAG。 |
| B4 切片 | 切片與代印工作台的檔案操作合併為可展開「檔案」選單；保留原按鈕事件、禁用條件、上下載與草稿功能。移除重複品牌文字；空狀態改清楚的 STL 拖放提示／虛線框。 |
| B5 新手參數 | 參考機台資訊預設收合；層高以快速／標準／精細描述，保留原 0.16 mm 進階選項。填充／壁數僅收合，不新增配方、不改數值或預設、不把功能件當成強度保證。 |
| B6 材料 | 首頁頁籤／用途選擇、材料指南、服務詳細頁完整材料列表共用 `materialGuide.mjs` 的 PETG／PLA／ABS／ASA／TPU／尼龍；補一般耐熱、強度與相對價格方向。保留各用途原精選材料及切片引擎支援材料，不為湊六種新增引擎選項。 |
| B7 登入 | 「不用登入，先試試估價」改清楚的外框次要按鈕；原本已存在 `show-password`，保留並以瀏覽器驗證顯示／隱藏，未重寫登入。 |
| B8 編號／文案 | 移除用途分組重複編號，個人分類不再冒用段落編號；修正首頁估價／登入說明次序。26 個公開入口跑瀏覽器檢查，不宣稱登入後所有業務文案已逐字校對。 |
| C 用途卡片 | 保留整卡 router-link；規整桌面三欄、平板兩欄、手機單欄，非互動標籤移除按鈕式底色。 |
| C 插圖風格 | 首頁流程與流程頁沿用官網 StudioImage 產品示意素材；不是現場照片，不刪既有插圖資產或改生成紀錄。服務詳細頁不明所以的頂部圖說收進具名提醒區。 |
| C 導覽 | 主導覽為製作服務／應用領域／技術資源，加會員與估價共五項；關於品牌等頁面仍保留路由及頁尾入口。 |
| C 數字 | 首頁新增單件需求、六種材料討論方向；累計產量、交期與最大尺寸沒有核實資料，不編造也不把參考平台當真實設備。詳 H-004。 |
| C 手機／跨瀏覽器 | Chromium、WebKit × 1440／390／320 px，26 個入口合計 156 組；未用實體手機或真實業務帳號跑完整下單。 |
| 補充意見 | 固定首頁流程編號的尺寸與對齊；「從一件小物開始」標示為用途提示而非假按鈕；首頁新增依用途選材互動及第一次準備草圖／照片／尺寸的指引。選材 UI 不呼叫 AI、不改報價或生產設定。 |

## 修改檔案

以下路徑除共編資料外皆位於 `frontend-vue/`：

| 檔案／元件 | 改動原因與範圍 |
| --- | --- |
| `src/content/materialGuide.mjs`（新增）、`src/content/publicPages.mjs` | 單一公開選材資料來源，提供用途、注意事項、一般耐熱／強度／價格等級；不是 slicer profile 或價目表。 |
| `src/views/landing/Index.vue` | 首頁事實區、六材料／用途選擇、說明與流程編號、流程影像、站內箭頭。 |
| `src/views/services/Directory.vue`、`Detail.vue` | 分組編號、用途提示、具名收合提醒、完整材料列表、箭頭。原清單複製／詢價事件保留。 |
| `src/views/public/InfoPage.vue` | 公開資訊頁箭頭；流程頁使用同系產品示意影像。 |
| `src/components/public/PublicShell.vue` | 載入公開介面專用可讀性樣式；主選單縮為三分類；頁尾與路由不刪除。 |
| `src/styles/public-readability.scss`（新增） | 範圍限定 `.public-site.brand-surface`，不改 admin 全域主題；字級、按鈕一致性、卡片欄數、編號與對比。 |
| `src/components/SlicerLab.vue` | 模板／樣式：檔案選單、收合參考機台、嵌入時不重複品牌、文字與箭頭。script 完全未變。 |
| `src/components/SlicerStage.vue` | 模板／樣式：空狀態拖放提示、去重品牌、手機排版。script 完全未變。 |
| `src/components/SlicerSettings.vue` | 模板／樣式：選項用語與原有選項保留、填充收合、字級。script 完全未變。 |
| `src/views/portal/Login.vue` | 登入次要估價入口與移除送出箭頭；script 完全未變。 |
| `src/components/StationLayout.vue`、`src/components/public/AudienceLinks.vue`、`src/layouts/PortalLayout.vue`、`src/views/401.vue`、`404.vue` | 僅站內箭頭文字。 |
| `src/views/free-print/Index.vue`、`src/views/login/index.vue` | 僅站內箭頭／送出文字；不改免費列印或員工登入驗證。 |
| `src/views/portal/Dashboard.vue`、`FreePrint.vue`、`Register.vue`、`Reset.vue`、`Workspace.vue` | 僅站內箭頭／送出文字；不改會員、付款、機台或 AI 助理功能。 |
| `src/views/quote/Wizard.vue`、`Workbench.vue` | 箭頭／品牌文字；Workbench 既有檔案按鈕收進選單；script 完全未變。 |
| `tests/public-ui-review.cjs`、`tests/public-contrast-review.cjs`（新增） | 僅本機 UI 檢查，不提交表單、不控制設備。Playwright／axe 安裝在本機暫存，不改專案依賴或 lockfile。 |
| `collaboration/CURRENT_WORK.md`、`DESIGN_DECISIONS.md`、`HANDOFF.md`、本紀錄及 `collaboration/evidence/2026-10-25-ui/` | 登記範圍、授權界線、真實資料待補與團隊可取得的截圖／檢查證據。 |

## 保留與未改的系統

- 遵守 D-001～D-005 及 2026-10-24 兩份修改紀錄；新增 D-UI-20261025 記錄本次授權界線，不取代原系統決策。
- `api/`、前端 `src/api/`、`utils/`、`router/`、`store/`、設定檔、依賴／lockfile、Docker／部署檔均無差異。
- 逐一對比 13 個涉及業務的 Vue script 區塊，與基準完全一致：SlicerLab、SlicerSettings、SlicerStage、StationLayout、Workbench、Wizard、會員 Login／Workspace／FreePrint／Dashboard／Register／Reset、員工 login。
- 不動權限、會員隔離、機台／影像租約、排程、切片運算、報價、付款、Agent／MCP、Telegram 或外部服務設定；沒有使用本機 API 金鑰檔。
- 共用樣式影響公開頁與使用同一公開殼的會員入口／估價頁；SlicerSettings／Stage 的呈現也會影響其既有引用處。所有業務事件、v-model 欄位、禁用條件與參數仍沿原流程。

## 驗證

- `npm run qc`：正式前端建置成功，45 個測試檔／359 項測試通過。既有 Vue `::v-deep` 與 Node SQLite 警告仍在，本次不為 UI 任務順便改系統或升依賴。
- 最初把 build 與 test 同時跑，PWA 測試因 dist 尚未產生而失敗；後續改用順序執行的 `npm run qc`，最終通過，未修改測試來掩蓋失敗。
- `public-ui-review.cjs`：156 組頁面／引擎／視窗組合通過，無頁面 JS error、無整頁水平溢位、站內連結無 ↗；另外驗證六材料互動、顯示密碼、檔案選單、預設收合機台、切換層高不覆寫填充。
- `public-contrast-review.cjs`：52 組 axe color-contrast 檢查沒有已確認 violations；**每組仍有 incomplete**（如影像／裝飾、重疊或無法自動判定文字），詳原始 JSON。這不是完整 WCAG 或投影機環境的驗收。
- `git diff --check` 與限前端／共編資料範圍檢查；13 個 script 未變的核對通過。
- [證據索引](../evidence/2026-10-25-ui/README.md) 含 1440／390 px 的首頁、材料、登入及切片改後截圖。未擷取本批修改前的瀏覽器截圖；改前程式以基準 commit 查閱。
- 本機沒有連實體機器、正式 OpenAI、付款或正式會員資料；沒有網站部署。GitHub 程式提交不等同網站已上線。

## 待辦與交接

H-004：請提供真實產量、供料、交期及最大尺寸，團隊審閱 UI 後再依原部署流程上線。實體手機／投影機、登入後所有業務狀態、真實下單／硬體流程與 axe incomplete 仍需人工驗收；不在本次僅前端修改中假稱完成。
