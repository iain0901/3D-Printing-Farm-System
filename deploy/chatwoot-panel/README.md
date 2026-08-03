# Chatwoot 3DRFM 案件側欄

`index.html` 是無框架的 Chatwoot iframe 側欄元件：它只讀取案件摘要與 AI 模式，**不複製、儲存或顯示對話逐字稿**。所有 LINE 對話仍完全留在既有的 Chatwoot。

## 設定

1. 將 `index.html` 以同源或 HTTPS 靜態站點提供。
2. 在 API 環境設定 `CHATWOOT_PANEL_SHARED_SECRET`（長隨機值）、`CHATWOOT_API_BASE_URL`、`CHATWOOT_ACCOUNT_ID`、`CHATWOOT_API_TOKEN` 與 `CHATWOOT_WEBHOOK_SECRET`。
3. 在 Chatwoot 建立側欄／Dashboard App iframe，URL 使用：

```text
https://PANEL_HOST/index.html?apiBase=https%3A%2F%2FAPI_HOST&panelSecret=PANEL_SECRET&accountId=ACCOUNT_ID&conversationId=CONVERSATION_ID
```

由 Chatwoot App 設定把目前 `accountId`、`conversationId` 注入 URL。上線時應由 App 設定或反向代理注入秘密值，避免把秘密寫進版本控制。

## API 行為

- `GET /api/integrations/chatwoot/context`：供側欄讀取關聯案件。
- `POST /api/integrations/chatwoot/webhook`：接收 Chatwoot 的入站事件，依 Inbox／案件階段套用 `auto`、`draft`、`hybrid`、`human` AI 模式。
- `POST /api/cases/:id/chatwoot/notify`：所有主動發送訊息均經由 Chatwoot Conversation。

未找到關聯時，側欄只提示建立或連結案件；不會自行建立重複對話。
