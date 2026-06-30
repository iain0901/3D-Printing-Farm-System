# 3DSTU FarmFlow

3DSTU FarmFlow 是 3DSTU 為 3D 列印農場、工作室、學校與小型量產團隊設計的生產作業系統。它把訂單、模型檔案、打印機能力、材料、排單、待辦、維護、通知與稽核整合到同一個 SaaS 控制台。

## 文件語言

- [English README](README.md)
- [简体中文 README](README.zh-CN.md)
- [繁體中文授權](LICENSE.zh-TW.md)
- [Ubuntu 部署說明](deploy/ubuntu/README.zh-TW.md)

如果需要專業技術支援或安裝設定服務，請聯絡 `support@3dstu.com`。

## 平台重點

3DSTU FarmFlow 是給真實列印農場使用的生產控制層，不只是打印機清單。目前 release-candidate 版本已涵蓋：

| 範圍 | 平台處理內容 |
|---|---|
| 接單 | 手動訂單、報價需求、CSV/電商匯入、SKU 對應生產任務 |
| 檔案 | STL/3MF/G-code 模型庫、版本、預覽、範例模型、切片輸出 |
| 排單 | 打印機匹配、材料/顏色限制、交期風險、負載平衡 |
| 現場 | 打印機狀態、隊列流程、操作員待辦、維護回報、歷史/重印 |
| 材料 | 線材庫存、預留、用量掃描、補貨計畫、標籤匯出 |
| 營運 | 權限、2FA、稽核、Webhook、通知、備份、還原演練、上線證據 |

## 實際產品畫面

以下截圖是從本 repo 的可運行 demo UI 實際擷取。

### 生產駕駛艙

![FarmFlow 生產駕駛艙](docs/screenshots/dashboard-production-cockpit.png)

### 排單與產能規劃

![FarmFlow 排單與產能規劃](docs/screenshots/scheduler-capacity-planning.png)

### 模型檔案庫

![FarmFlow 模型檔案庫](docs/screenshots/files-model-library.png)

### 線材與材料庫存

![FarmFlow 線材與材料庫存](docs/screenshots/filament-inventory.png)

### 設定、備份與治理

![FarmFlow 設定、備份與治理](docs/screenshots/settings-backup-governance.png)

## 文件索引

| 需求 | 文件 |
|---|---|
| 本機安裝 | [本機執行](#本機執行) |
| Ubuntu 部署 | [docs/INSTALL.md](docs/INSTALL.md)、[deploy/ubuntu/README.zh-TW.md](deploy/ubuntu/README.zh-TW.md) |
| 正式營運 | [docs/OPERATIONS.md](docs/OPERATIONS.md) |
| 上線檢查 | [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) |
| 發版流程 | [docs/RELEASE.md](docs/RELEASE.md) |
| 產品方向 | [docs/ROADMAP.md](docs/ROADMAP.md) |



## 授權

3DSTU FarmFlow 是 3DSTU 開發給 3DSTU 農場客戶免費使用的 SaaS 平台。授權採用 [3DSTU Farm Customer Source-Available License](LICENSE.zh-TW.md)：客戶可以自行部署、修改並用於自己的 3D 列印農場營運，也可以透過自己的列印件、設計、教育、維護或生產服務獲利；但不得販售、轉售、散布、重新包裝、白牌、託管、出租、發布原始碼、Docker image、腳本、修改版或以本軟體為基礎的第三方商業服務。

## 本機執行

```bash
npm install
npm run dev
```

開啟終端機顯示的 Vite 本機網址，通常是 `http://127.0.0.1:5173`。

另一個終端機啟動後端 API：

```bash
npm run api
```

API 預設監聽 `http://127.0.0.1:8797`，資料儲存在 `api/data/layerpilot.db.json`。

## Docker 執行

```bash
cp .env.example .env
# 編輯 .env，設定正式 owner email/password
docker compose up --build
```

完成後開啟 `http://127.0.0.1:8797`。Docker Compose 會啟動 API/Web 服務與背景 worker，資料保存在 `layerpilot-data` Docker volume。

## Ubuntu 部署

Ubuntu 22.04/24.04 部署資源在 `deploy/ubuntu/`。完整流程請看 [繁體中文 Ubuntu 部署說明](deploy/ubuntu/README.zh-TW.md)。

快速部署：

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

上線前請在 Ubuntu 主機執行：

```bash
scripts/ubuntu-go-live-check.sh
```

## 主要功能

- Dashboard：今日任務、設備狀態、待辦事項、異常警報、生產進度、設備負載與交期風險。
- 打印機管理：狀態、溫度、材料、相容能力、任務與連線橋接。
- 排單工具：待排任務、設備時間軸、材料衝突、尺寸不符、交期風險與自動排單。
- 待辦系統：由任務狀態自動產生切片、排單、換料、後處理與異常待辦。
- 檔案與模型管理：STL/3MF/G-code 上傳、縮圖、版本、估時、估重與綁定任務。
- 雲端切片 MVP：內建切片適配器、外部切片設定、G-code 產出與紀錄。
- 電商與訂單：Shopify/Etsy/Manual/CSV intake、SKU 對應、自動生成生產任務。
- 維護與通知：維護模板、異常回報、Webhook、Slack/Discord/Email/自訂通知。
- 安全與營運：角色權限、2FA、API keys、稽核、備份、還原、support bundle。

## 品牌與相容性

產品名稱是 `3DSTU FarmFlow`。為了避免破壞既有部署，部分環境變數、Docker volume、檔名與內部 namespace 仍保留 `LAYERPILOT_*` 或 `layerpilot`。
