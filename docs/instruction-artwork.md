# 小型裝飾與說明插圖

本組為圖片模型 `image_gen.imagegen` 生成的 16 張原創透明底插圖；不是程式畫出的 SVG、CSS 圖形或 canvas 圖案，也不是整頁海報。採海軍藍、鈷藍、暖橘與暖白、印刷線稿質感，和既有網站品牌配色銜接。沒有將生成的店面情境圖稱作水木書苑實際建築，也不把圖中的材料／機台示意當作現貨、正式硬體或多色切片能力保證。

## 檔案與來源

- 網站檔案：`frontend-vue/public/images/instructions/*.webp`。
- 原始生成 PNG 保留在本次環境的 `/workspace/generated_images`，不覆寫或刪除。採用檔案的原始名稱、SHA-256、網頁版本 SHA-256、尺寸、位元組數與 alpha 狀態記錄在 `src/content/instructionArtworkAssets.json`。
- 僅做 lossless WebP 編碼；保留原始像素、透明度與構圖，沒有用程式重畫／補畫圖片。使用 ImageMagick 的 `webp:lossless=true`、`webp:exact=true`；可用 `magick compare -metric AE original.png served.webp null:` 檢查差異。
- HTML 保留圖片原生尺寸供瀏覽器預留空間，以 CSS `object-fit: contain` 顯示為約 96～220 px 的小元素，不裁掉說明物件。延遲載入、沒有圖形動畫或攔截操作事件。
- 文字說明留在可選取、可縮放的繁體中文 HTML，不烘焙在圖片內。和鄰近文字重複的裝飾圖使用空 alt，不讓螢幕閱讀器重複朗讀。

## 32 個配置位置

| 插圖 | 配置位置 |
| --- | --- |
| upload／模型上傳 | 首頁製作步驟、報價工作台空白平台 |
| account／會員資料 | 首頁製作步驟、製作流程頁 |
| review／條件確認 | 首頁製作步驟、製作流程頁 |
| pickup／製作交付 | 首頁製作步驟、製作流程頁 |
| filament／線材試片 | 材料指南、水木書苑 PETG 提醒 |
| layers／逐層成型 | 材料指南、製作流程頁 |
| measure／尺寸檢查 | 檔案準備、工業零件服務 |
| library／模型整理 | 檔案準備、會員模型庫空白狀態 |
| save／專案版本 | 檔案準備、會員草稿空白狀態 |
| orientation／模型方向 | FDM 設計指南、一般代印服務 |
| support／暫時支撐 | FDM 設計指南、急件服務 |
| assembly／外殼配合 | FDM 設計指南、企業客群頁 |
| school／教學研究 | 學校客群頁、研究模型服務 |
| color／配色溝通 | 個人客群頁、報價工作台配色說明 |
| station／在地站點 | 免費列印選站頁、水木書苑頁 |
| layout／平台布局 | 獨立雲端切片、免費站切片的空白平台 |

`instructionArtwork.mjs` 是配置清單；每張剛好兩個配置位置。路由別名與同頁篩選不是新增配置位置；員工切片不再重複顯示 layout。工作台的中央插圖只在沒有模型時出現，匯入真實模型後退場，避免遮擋 3D 操作。原有 13 張展示物件圖的配置與使用上限不變。

## 元件與驗證

- `InstructionArt.vue`：圖片呈現與尺寸／替代文字規則。
- `InstructionNotes.vue`：服務與指南內的小型圖文提醒；無額外卡片陰影、大圖背景或自動輪播。
- `api/instruction-artwork.test.mjs`：16 個獨立 WebP、來源／檔案 hash、透明度紀錄、每圖兩個位置、無關頁無預設補圖、能力與站點說明。
- `scripts/check-instruction-artwork.cjs`：正式 build＋隔離 API，核對實際 DOM 的 16 張／32 次配置、圖片解碼、原生尺寸、透明角落、小圖尺寸、320／390／768／1440 px 無水平溢出，以及匯入真實 STL 後空白平台插圖消失。
- 本輪 `npm test`：38 個測試檔案、320 項測試通過；建置成功。既有會員、品牌與切片的瀏覽器回歸亦維持執行。

推送 main 不等同正式網站已發布。
