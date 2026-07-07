# VPS Codex 接手摘要

## 專案是什麼

3DSTU FarmFlow 是 3DSTU 的 3D 列印農場生產營運系統 MVP，面向工作室、實驗室與小型列印農場。主要功能包含任務/訂單管理、模型檔案管理、印表機能力匹配、排程、自動待辦、耗材庫存、硬體橋接、報價流程、營運分析與例外處理。

目前版本在 `package.json` 為 `0.1.21`。README 指向正式網站 `https://farm-saas.3dstu.com`、GitHub 專案、安裝文件、營運手冊、產品 roadmap 與 release runbook。

## 目前路徑

- 使用者給定 cwd：`/app/projects/iain-import-20260624/simplyprint-io/outputs/3DSTU-FarmFlow-Codex-Handoff-v0.1.21/project`
- shell 實際解析路徑：`/app/projects/3dstu-farmflow`

## 如何啟動/測試

本機開發：

```bash
npm install
npm run dev
```

前端 Vite 預設開在終端顯示的本機網址，通常是 `http://127.0.0.1:5173`。

另開終端啟動本機 API：

```bash
npm run api
```

API 預設監聽 `http://127.0.0.1:8797`，本機 JSON 資料檔預設在 `api/data/layerpilot.db.json`。

常用測試/品質檢查：

```bash
npm run test
npm run build
npm run qc
```

其中 `npm run qc` 會執行 `npm run build && npm run test`。README 也提到 GitHub Actions 對 `main` push 與 pull request 跑同一組 QC gate。

Docker/類正式環境：

```bash
cp .env.example .env
# 編輯 .env，至少設定正式 owner email/password 與必要 token
docker compose up --build
```

Compose 預設開 `http://127.0.0.1:8797`，包含 API/web service 與 `layerpilot-worker` 背景 worker。

Ubuntu VPS 快速部署：

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

## 目前 git dirty files

`git status --short --untracked-files=all` 顯示：

```text
 M README.md
 M api/hardware-bridge.mjs
 M api/server.mjs
 M api/server.test.mjs
 M package-lock.json
 M package.json
 M src/App.tsx
?? docs/ROADMAP.md
?? VPS_CODEX_HANDOFF.md
```

接手前已存在的主要 dirty files 為：

- `README.md`
- `api/hardware-bridge.mjs`
- `api/server.mjs`
- `api/server.test.mjs`
- `package-lock.json`
- `package.json`
- `src/App.tsx`
- `docs/ROADMAP.md`

本次只新增此交接檔：`VPS_CODEX_HANDOFF.md`。

目前變更摘要：

- `package.json` 版本從 `0.1.0` 改為 `0.1.21`。
- README 新增 CI badge、專案連結、release/QC 說明，並把硬體橋接描述擴充到 PrusaLink。
- `api/hardware-bridge.mjs` 新增/擴充 PrusaLink 狀態讀取、指令控制與 bridge diagnostics。
- `api/server.mjs` 與 `src/App.tsx` 有大量功能變更，包含報價/客戶 portal、go-live readiness、support snapshot、bridge diagnostic UI、failure/waste analytics 等。
- `api/server.test.mjs` 大幅增加對上述 API/流程的測試覆蓋。
- `docs/ROADMAP.md` 是未追蹤的新產品 roadmap，記錄 v0.1.5 到 v0.1.21 已出貨項目與後續方向。

## 建議下一步

1. 先不要混入大型新功能；目前 diff 已很大，應先把既有變更驗證乾淨。
2. VPS 已執行 `npm install` 與 `npm run qc`，TypeScript/Vite build 與 Vitest 目前通過；後續改動仍需重跑。
3. 若在 VPS 上部署，先建立/檢查 `.env`，再跑 `scripts/ubuntu-deploy.sh doctor` 或部署腳本的 preflight。
4. 針對 PrusaLink bridge、quote revision/customer portal、go-live checklist、support snapshot 各做一次手動 smoke test。
5. 確認 `docs/ROADMAP.md` 是否要納入 commit，並補齊 README 指到但目前未必存在的 `docs/INSTALL.md`、`docs/OPERATIONS.md`、`docs/RELEASE.md`，避免公開連結失效。
6. 乾淨驗證後再切 release commit/tag，保留 `npm run qc`、VPS smoke check、備份/還原 drill 的證據。

## 已知環境需求

- Node.js/npm，可執行 Vite、TypeScript、Vitest 與 Fastify API；此 VPS 已升級為 Node.js v24.18.0 / npm 11.16.0，因測試需要 `node:sqlite`。
- Docker 與 Docker Compose，用於 production-like 或 VPS 部署。
- Ubuntu 22.04/24.04 可使用 `deploy/ubuntu/` 與 `scripts/ubuntu-*.sh` 部署/維運腳本。
- 生產部署需要強密碼與正式環境變數，至少包含 `LAYERPILOT_ADMIN_EMAIL`、`LAYERPILOT_ADMIN_PASSWORD`、`LAYERPILOT_WORKSPACE_NAME`；正式 Docker worker 需要 `LAYERPILOT_WORKER_TOKEN`。
- 可選服務包含 S3-compatible object storage、Stripe、MQTT、外部 slicer、OctoPrint、Moonraker/Klipper、PrusaLink。
- README 建議正式部署搭配 Nginx、HTTPS、UFW、防火牆、備份 timer、ops-check timer 與 Docker log rotation。

## 備註

本次接手已下載/解壓專案到 VPS，建立 `/app/projects/3dstu-farmflow` symlink，將 Node.js 升級到 v24.18.0，執行 `npm install`，並跑過 `npm run qc`：build 通過、Vitest 9 個 test files / 79 tests 全部通過。
