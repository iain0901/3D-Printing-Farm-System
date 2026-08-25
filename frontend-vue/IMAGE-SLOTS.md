# 3DRFM 圖片預留位清單（IMAGE SLOTS）

上線前請將實際照片放進對應位置。建議統一：JPG / WebP、長邊 ≥1600px、白底或場景照、壓縮後 <300KB。

| # | 位置 | 檔案 / 修改點 | 建議尺寸 | 說明 |
|---|------|--------------|----------|------|
| 1 | 首頁・最近作品 ×4 | `src/assets/showcase/showcase-1~4.svg` 換成同名 `.jpg`，並改 `landing/Index.vue` 的 showcaseItems 路徑 | 1200×900 (4:3) | Benchy／齒輪／花瓶／公仔 |
| 2 | 作品頁 `/gallery` ×6 | 同上資料夾；`Gallery.vue` 的 works 陣列可加更多項目 | 1200×900 | 可重複使用首頁照片 |
| 3 | 客戶回饋頭貼 ×3 | `landing/Index.vue` feedbackSlots 的 `avatar` | 200×200 圓形裁切 | 換成客戶 Logo 或大頭照 |
| 4 | Open Graph 分享圖 | 新增 `public/og-image.jpg`，並在 `public/index.html` 加 `<meta property="og:image" content="https://你的網域/og-image.jpg">` | 1200×630 | 社群分享預覽 |

> 放好照片後刪除本檔案即可。
