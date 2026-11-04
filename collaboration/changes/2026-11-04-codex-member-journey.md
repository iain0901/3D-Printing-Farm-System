# 會員工作台流程重設

- 日期：2026-11-04 Asia/Taipei；Codex；MEMBER-20261104-02。
- 基準：79bc7da，開工 worktree 乾淨，fetch 未有其他遠端提交；本次提交以此文件 git log 查詢。
- 授權：使用者明確要求重新設計登入後排版、清楚引導、付費／免費選擇、所有主要操作留在會員頁、顯示卡點並減少冗詞。

## 內容

- 新 `portal/Home.vue` 與 `member-journey.mjs`：首頁兩條製作入口、模型工具捷徑、依會員案件／訂單／報價／草稿／站點紀錄顯示下一步；需使用者操作優先，分來源錯誤及重試，無資料提供開始方式。付款依實際 payment.status，已提交草稿依 caseId 排除，不把未知狀態當完成。
- `PortalLayout`：會員導覽直達免費切片、到站操作、建模工具、模型下載與草稿；品牌連結回會員首頁，手機可收合選單。會員路由無登入時帶目的地轉會員登入，後端既有驗證不變。
- 路由新增 `/portal/print`、`/portal/free-slicer`；`/portal/free-print` 也採會員 layout。重用原 Workbench、SlicerLab、FreePrint，以 memberMode 去除公開外框而保留實際操作。
- `Workspace` 與 `Dashboard` 的模型／草稿／再訂購／新製作連結改留會員路由；其他服務收到可展開導覽，精簡裝飾文案。Google／密碼登入的 return path 支援新會員路由。
- 官網首頁、切片參數／定價、後端 API、硬體控制、密鑰皆未變；沒有新增假的模型生成或自動完成狀態。建模入口沿用現有 MCP／Skill／CAD 功能，任意模型生成仍有原有外部工具限制。

## 驗證

- `npm run qc`：53 檔／410 項通過，建置成功；`/tmp/member-qc.log`。後續文案／手機樣式與狀態提示收尾另跑建置、相關 6 項測試及瀏覽器。
- `scripts/check-member-home.mjs`：獨立暫存會員／localhost API，匿名導回登入、會員空狀態、1440／390 px、付費／免費切片與排隊全程會員外框、補件／取件 CTA、部分來源失敗保留其他進度及零 JS error 通過。狀態案例為 fixture；無真實送單、付款、切片或機台命令。
- 截圖 `/tmp/member-home-rU4YGJ/`（暫存，非團隊永久附件）；人工檢視 desktop／mobile。調整尺寸後待動畫完成或採 reduced motion，避免誤把過渡動畫截圖當固定手機排版；手機側欄實測 390 px、內容 padding 24px 16px。
- 未留開工前截圖，原介面依基準 commit 可查；不是實體手機、正式站或實機驗收。可重現：先 npm run build，再以已安裝的 Playwright 設定 PLAYWRIGHT_MODULE 執行腳本。

## 交接

具體視覺待使用者審閱。採原部署流程發布新版前端；本輪未連正式主機或修改設定／資料。既有設定包、Google／OpenAI／站點連線等部署限制仍適用。會員頁卡點來自既有 API；實際排程／寄信可用性仍由原服務決定。

收尾驗證：最終 `npm run qc` 建置成功、53 檔／410 項全部通過（`/tmp/member-final-qc.log`）；最新瀏覽器驗收包含會員付費／免費切片手機無水平溢出（`/tmp/member-browser-handoff.log`、截圖 `/tmp/member-home-EVdjlJ/`）。推送前再次 fetch，遠端仍為 79bc7da，沒有其他人的修改需要合併。發布須連同共用 utils 更新，以支援 Google 返回新會員路由；正式部署仍未執行。
