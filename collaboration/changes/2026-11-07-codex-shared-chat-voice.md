# 修改紀錄：共用文字／語音操作助理

- 日期：2026-11-07；Codex；AGENT-20261107-02；基準 05eb97d；提交隨本紀錄。
- 授權：使用者要求保留聊天框，修復文字／語音功能不一致、導覽反覆確認及新竹據點無回答；沿用 D-001、D-006 及既有 UI，新增 D-012 取代站內每步必確認的舊互動。
- 前端：SiteAgent、agent-voice、agent-destinations、siteAgent 工具。語音辨識後呼叫相同 sendMessage／chat／executeAction，保留跨模態歷史；依請求自動導覽及修改限定可還原欄位。上傳頁等待實際按鈕載入並聚焦，沒有假檔案上傳。自行換頁／身分切換／關閉取消過期工作；助理自己導覽保留會話。麥克風真正靜音、錄音停頓送出／手動送出、掛斷與最長十分鐘。
- 後端：site-agent 新增本人驗證的 transcribe／speak，沿原配額、body 上限、no-store、60 秒逾時。加入同源站點目錄與受限導覽資訊，prompt 理解新竹及肯定回覆。Compose／env 提供兩個語音適配模型設定，維持 OpenAI API。舊 realtime endpoint 保留相容，未引入其他第三方或套件。
- 保留：現有品牌樣式、聊天視窗、帳號隔離、MCP 外部確認及付款／送單／機台動作確認。未改機台 profiles、資料庫、正式服務設定。
- 測試：模型請求契約驗證地理知識／歷史、語音 multipart、音訊二進位回覆、缺 key／未登入／無效 MIME；自動操作政策覆蓋敏感動作。建置與全套結果以本輪交付回報為準。
- 瀏覽器：scripts/check-demo-browser.mjs 於 1440×1000／390×844 實跑既有 demo 流程，另使用 Chromium 假麥克風及模擬 provider：文字問新竹→語音確定→保留歷史→真 router 到免費切片→聚焦上傳，文字直接免費列印亦一致，無額外確認卡。9 項流程、無 pageerror／HTTP 錯誤。截圖 /tmp/3drfm-demo-evidence/shared-voice-chat.png，暫存證據。
- 未驗證：真 OpenAI STT／TTS 音質、辨識率、延遲、自然環境靜音閾值及手機實體麥克風。未部署；伺服器更新後需重啟帶入新增 env，HTTPS 與麥克風權限沿原設定。語音每輪辨識／聊天／合成均計入原每日請求額度。
