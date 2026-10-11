# 三點成型：公開頁面設計

## 範圍

首頁、線上估價、會員登入／註冊／密碼重設、工作人員登入、公開案件查詢，以及 401／404 頁面。登入後的管理介面不在這次改版範圍。

- 視覺參考：3dstu.com 的海報排版、色塊與創作主題。未搬用參考站的圖片、商標或程式碼。
- 原創 SVG：列印機、線材捲、建模草圖、成品零件，集中於 `WorkshopArt.vue`，沒有外部圖片或字型下載依賴。
- `PublicShell.vue` 提供共用導覽、手機選單、跳至內容及頁尾；`AuthShell.vue` 提供公開表單的插圖版面。
- 文案採繁體中文，保留材料／檔案格式等專有名詞。不新增未經證實的銷量、評價或交期承諾。
- 材料按鈕可切換說明，常見問題使用原生 `details`；支援鍵盤操作與減少動態效果設定。

## FDM 客群與用途專頁

新增 12 個公開路由，內容集中於 `frontend-vue/src/content/fdmServices.mjs`，導覽、路由與用途提示共用此資料，不需複製整份頁面。

| 層級 | 路由 | 內容 |
| --- | --- | --- |
| 服務總覽 | `/services` | 三大客群、八種用途 |
| 校園入口 | `/for/education` | 實驗室、專題、文創紀念品 |
| 企業入口 | `/for/business` | 展覽、工業件、小批量 |
| 個人入口 | `/for/personal` | 一般代印、急件 |
| 用途專頁 | `/services/research-lab` | 實驗室與研究模型 |
| 用途專頁 | `/services/student-project` | 專題與畢業製作 |
| 用途專頁 | `/services/campus-gifts` | 文創與活動紀念品 |
| 用途專頁 | `/services/exhibition` | 展覽與展示模型 |
| 用途專頁 | `/services/industrial-parts` | 工業件與治具原型 |
| 用途專頁 | `/services/small-batch` | 小批量製作 |
| 用途專頁 | `/services/personal-print` | 一般模型代印 |
| 用途專頁 | `/services/rush-print` | 快速急件評估 |

每頁包含不同的製作重點、材料討論方向、FDM 限制、準備清單、常見問題及相關頁面。`ServiceArt.vue` 增加實驗、工業外殼、批量、紀念品、展覽、桌上小物及急件原創向量插圖。準備清單只在頁面內暫存，不送出客戶資料；剪貼簿被拒絕時提供可手動複製的文字框。

所有用途頁面的主要 CTA 都連到既有 `/quote?service=用途代碼&mode=estimate`，直接顯示模型上傳步驟，並將用途提示放進可修改的備註。沒有另外建立人工詢價表或新的價格公式。訪客可按「上一步」選擇無模型／建模協助。

估價仍使用 `/api/public/cases/estimate` 及既有 `auto-quote` 引擎，回傳的是參考件用量的切片前初估，不是上傳模型的實際切片定價。急件頁預選可取消的急件評估，使用既有 `rush` 參數（目前為 48 小時費率級距），不是交期保證。公開估價材料選單移除樹脂；不修改既有歷史案件或後端材料資料。

這些頁面沿用專案現有 hash 路由；未在本次新增伺服器端渲染或搜尋引擎索引保證。

## 驗證

```sh
npm run build
npm test
```

瀏覽器回歸檢查使用 Playwright。使用已有 Playwright 的工具環境，或在獨立測試目錄安裝，不必修改本專案套件清單：

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROMIUM_PATH=/absolute/path/to/chromium \
BASE_URL=http://127.0.0.1:8797 \
node scripts/check-public-ui.cjs
```

相同環境變數也可執行 `node scripts/check-service-pages.cjs`：檢查全部 12 頁的四種尺寸、匿名存取、客群切換、每個自動估價入口、剪貼簿拒絕情境及無效網址。此腳本會上傳瀏覽器端測試模型並實際呼叫不建立案件的估價 API，驗證既有引擎回傳價格與急件旗標；建立案件請求仍由測試攔截，不寫入真實訂單。

未指定 `PLAYWRIGHT_MODULE` 時載入標準 `playwright` 套件；未指定 `CHROMIUM_PATH` 時使用 Playwright 的瀏覽器。測試目標應為隔離的本機開發／測試服務。

檢查 1440、768、390、320px 版面、材料切換、常見問題、手機選單、跨頁錨點、估價驗證與案件連結、登入／註冊錯誤、Enter 送出、密碼重設與員工兩步驗證。案件和驗證請求由測試攔截，不會建立真實訂單、發送重設郵件或變更帳號。畫面截圖寫入系統暫存目錄，完成後輸出路徑。

若使用 API 的靜態檔案服務測試，請在建置完成後啟動服務。現有 `wildcard: false` 設定會在啟動時登記資產檔名，重新建置後需重啟該測試服務，才會提供新雜湊檔名的資產。

這些檢查不等於公開部署，也不驗證郵件供應商、付款服務或真實生產排程。
