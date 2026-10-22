# 自動報價：線上切片工作台（前端階段）

模型編輯已改用完整多模型三維平台：三維操作把手、多選／複製、等比與非等比縮放、鏡像、按面放平、模型操作復原／重做、物件可見性和七個視角。免費與獨立試切入口共用同一平台；付費報價仍等待新機型後端，不冒用參考機台結果。進階參數及每軸來源變換會一併保存到會員草稿。詳見 [雲端切片工作區](cloud-slicer-research.md)。

## 路由與目前可用範圍

`/#/quote` 與 `/#/quote/new` 的自動估價入口改用 `views/quote/Workbench.vue`。服務頁的 `service` 用途與急件提示保留。`mode=agent`、`model=no` 及「專員協助」仍走原有人工案件流程；切換前若有模型會警告本機設定將離開。

不修改新機型切片設定或費率。新工作台不呼叫舊的 slicing-quotes、estimate 或印表機 API，不產生示意價格或假進度。現在可使用會員工作台 API 保存完整雲端草稿，並由會員明確確認後送交專員建立真實案件；不是自動切片報價。會員登入／註冊使用既有真實 API。完整流程見 [會員工作台](member-workspace.md)。正式站仍需另行部署。

前端功能：

- 共用免費列印的 `StationLayout`：多 STL、3D 預覽、旋轉縮放、平躺、拖曳／鍵盤移位、置中、自動排版。沿用最多 5 檔、合計 10 MiB、每檔 20 萬三角面限制。
- 260 × 260 × 260 mm 是編輯參考平台，不代表新機型；免費站仍固定 `3DSTU_PETG`，不受付費選材影響。
- PETG（預設推薦）、PLA、ABS、ASA、TPU、PA 尼龍。每個平台使用單一材料，不宣稱所有材料支援多色或都有現貨。
- 單色與最多 8 個可編輯色槽。8 是編輯上限，不是機台能力。色槽含穩定 ID、色名、色碼。
- 每模型指定基底色與數量；可在同一模型新增最多 8 個高度換色區間。界線以變換後模型底部 Z=0 計算。範圍不可重疊、超高或使用已移除色槽；刪除色槽明確回到第一個保留色槽。
- WebGL 配色預覽會顯示各高度區域；這不是切片路徑、層數或多色 3MF 解析。高度換色鎖定方向，不允許再委託切片器自動定向；手動修改方向或縮放後需重新確認區間。
- 多色模式可直接用筆刷、相連平面填色、橡皮擦在選取模型上操作。以完整三角面為單位，不新增網格；低面數模型的邊界較粗。筆刷挑選落在半徑內的相連面中心（必含命中面），填色挑選與命中面法線夾角 30° 內的相連面；不跨越不相連外殼或非流形共邊。觸控／滑鼠上色與旋轉檢視分開，旋轉模式不畫圖。
- 表面塗色優先於高度區間色，再其次才是基底色。橡皮擦移除表面指定，恢復高度／基底色。每模型保留復原／重做（最多 30 次筆劃、總計 20 萬個變更面；單次大填色保留最後一次），切換模型不混用歷史。清除有確認並可復原；刪除色槽會重新綁定並清空歷史，避免復原出已刪除色槽。
- 幾何處理維持來源 STL 三角面順序；旋轉、縮放、平躺後上色跟隨表面。每次產生變換後 STL 時重新計算 SHA-256，用於上色幾何綁定。環境無法提供 Web Crypto 時仍能處理基本布局，但已上色草稿不允許匯出，以免缺少幾何驗證。
- 每個模型僅顯示一份，數量不會偽裝為已排好全部生產份數。實際多份、多盤與換色成本留給後端。
- 第三步登入或註冊帶入會員；失效登入、登入失敗不離開工作台，不丟棄本機模型。
- 可免登入下載 JSON 設定草稿；不含模型二進位、會員資料、Token、密碼。另可登入保存包含原始及變換後 STL 的雲端草稿，跨裝置還原。JSON 檔案尚無匯入入口；免登入下載者須保留原始 STL。

## 給新機型後端的契約

純函式 `createQuoteDraft()` 位於 `src/utils/quote-workspace.mjs`。含表面塗色的契約升級為 `schemaVersion: "3drfm.quote-workspace.v2"`；**此草稿不是現有舊 API 可直接接受的 payload**。

| 欄位                                    | 語意                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `purpose`, `status`                     | `paid-quote`、`awaiting_machine_profile`；不代表已排程                            |
| `machineProfileId`, `materialProfileId` | 目前 null，後端須依能力及設定檔解析，不得猜測機型                                 |
| `referenceBed`                          | 編輯參考尺寸，`isProductionBed: false`                                            |
| `geometry.bakedScaleAndRotation`        | 未來上傳的是 StationLayout 產生的變換後 STL；旋轉／縮放已套用，不能再套一次       |
| `geometry.localOrigin`                  | STL 以 XY 中心為零、Z 底部落地；`placement` 為平台上中心位置                      |
| `geometry.quantityLayout`               | `one-copy-preview-per-model`；quantity 須由後端展開，檢查多盤需求                 |
| `models[].fileIndex`                    | 對應 `layout.files` 的穩定順序；JSON 本身不包含檔案                               |
| `models[].sourceTransform`              | 原始模型的調整紀錄；僅供重建與追溯，不可再次套到 baked STL                        |
| `models[].baseSlotId`, `heightBands`    | 基底色及 `{from, to, slotId}` 高度區間，單位 mm；後端需對齊實際層高並回傳調整結果 |
| `colorSlots[]`                          | ID、色名、hex、material；`filamentProfileId: null`，不是已確認庫存或材料參數      |
| `settings`                              | 層高、填充、壁數、支撐、切片器定向／排版偏好、日期、急件、備註                    |
| `estimate`                              | null；僅以真正切片結果產生價格                                                    |

後端接入時須先提供機型能力／列印範圍／材料與色槽設定。伺服器需重新驗證幾何、數量、色槽引用、材料相容性、換色區間、方向、重疊及平台邊界，不可信任前端 `ready` 或驗證結果。不同模型高度範圍可能要求同一層多種顏色，不能當成全域單次換料；不支援時應明確拒絕或分盤，不得默默改成單色。

真實結果應包含模型／支撐／清料塔或沖刷用料、時間、多盤／多份結果、實際設定版本及價格；任一模型或設定變更需使舊結果失效。會員案件名稱仍由伺服器依日期、使用者、模型序號產生。

### 表面上色欄位

`models[].surfacePaint` 在單色或無塗色時為 null；其他情況包含：

- `encoding: "stl-triangle-slot-v1"`
- `geometrySha256`：對應 `fileIndex` 的完整變換後二進位 STL SHA-256；不是原始上傳檔 hash。
- `triangleCount`：該 STL 的三角面數。
- `faces: [[triangleIndex, slotId], ...]`：0 起算、按 STL 三角面順序，僅記錄有上色的面，排序後輸出。預覽拆成不同外殼時仍保留原始全域面編號。
- `priority: "surface-over-height-over-base"`：與前端顯示一致的顏色優先順序。

後端必須先驗證 hash、三角面數、索引範圍、唯一性、色槽及材料相容性，再轉為切片器支援的上色資料。若修復、重新網格化、分件或重新排序三角面，必須重新映射或明確拒絕，不能默默丟失塗色。此 JSON 不是 Orca 專案檔，不宣稱任何新機型已接受表面多色列印。

## 驗證

```bash
npm test -- api/quote-workspace.test.mjs api/station-model.test.mjs api/station-plate.test.mjs
npm run build
BASE_URL=http://127.0.0.1:8799 node scripts/check-quote-workbench.cjs
BASE_URL=http://127.0.0.1:8799 node scripts/check-station-slicer.cjs
BASE_URL=http://127.0.0.1:8800 node scripts/check-surface-paint.cjs
npm test -- api/surface-paint.test.mjs
```

使用既有 Playwright／Chromium 安裝時可指定 `PLAYWRIGHT_MODULE`、`CHROMIUM_PATH`。瀏覽器腳本只能對隔離本機服務執行；登入資料為攔截測試資料。驗證實際 WebGL 圖面有兩種配色、範圍驗證、模型／色槽刪除、數量綁定、草稿內容、會員驗證、人工流程與免費材料鎖定，並拒絕任何付費切片、案件或印表機請求。
