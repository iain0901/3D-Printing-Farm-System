import { createHmac, timingSafeEqual } from "node:crypto";

const cleanUrl = (value) => String(value || "").trim().replace(/\/+$/, "");

export function createChatwootClient(options = {}) {
  const baseUrl = cleanUrl(options.baseUrl || process.env.CHATWOOT_BASE_URL);
  const accountId = String(options.accountId || process.env.CHATWOOT_ACCOUNT_ID || "").trim();
  const apiToken = String(options.apiToken || process.env.CHATWOOT_API_TOKEN || "").trim();
  const fetchImpl = options.fetchImpl || fetch;
  const request = async (pathname, init = {}) => {
    if (!baseUrl || !accountId || !apiToken) throw new Error("Chatwoot integration is not configured");
    const response = await fetchImpl(`${baseUrl}/api/v1/accounts/${encodeURIComponent(accountId)}${pathname}`, {
      ...init,
      headers: { api_access_token: apiToken, "content-type": "application/json", ...(init.headers || {}) }
    });
    if (!response.ok) throw new Error(`Chatwoot API returned ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  return {
    configured: Boolean(baseUrl && accountId && apiToken),
    baseUrl,
    accountId,
    async getConversation(conversationId) { return request(`/conversations/${encodeURIComponent(conversationId)}`); },
    async sendMessage(conversationId, content, options = {}) {
      return request(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ content, message_type: options.messageType || "outgoing", private: Boolean(options.private) })
      });
    },
    // Portal 對話橋接用：找或建 contact（以 email 為 identifier），回傳 contactId
    async ensureContact({ email, name }) {
      const normalizedEmail = String(email || "").trim();
      if (!normalizedEmail) throw new Error("Email is required to ensure a Chatwoot contact");
      try {
        const found = await request(`/contacts/search?email=${encodeURIComponent(normalizedEmail)}&sort=-last_activity_at`);
        const hit = Array.isArray(found?.payload) ? found.payload[0] : found?.payload?.contact;
        if (hit?.id) return String(hit.id);
      } catch {
        // 搜尋失敗就往下嘗試建立
      }
      const created = await request("/contacts", {
        method: "POST",
        body: JSON.stringify({ identifier: normalizedEmail, email: normalizedEmail, name: String(name || normalizedEmail) })
      });
      return String(created?.payload?.contact?.id || created?.payload?.id || "");
    },
    // 在指定 inbox 建立對話（portal 對話串專用收件匣），回傳 conversationId
    async createContactConversation(contactId, inboxId) {
      const created = await request(`/contacts/${encodeURIComponent(contactId)}/conversations`, {
        method: "POST",
        body: JSON.stringify({ inbox_id: Number(inboxId) })
      });
      return String(created?.conversation_id || created?.id || "");
    },
    // 送出帶圖片/檔案的訊息（multipart attachments[]），messageType: 'incoming' | 'outgoing'
    async sendMessageWithAttachments(conversationId, content, files = [], options = {}) {
      if (!baseUrl || !accountId || !apiToken) throw new Error("Chatwoot integration is not configured");
      const form = new FormData();
      form.append("content", String(content || ""));
      form.append("message_type", options.messageType || "incoming");
      form.append("private", String(Boolean(options.private)));
      for (const file of files) {
        form.append("attachments[]", new Blob([file.buffer], { type: file.contentType || "application/octet-stream" }), file.filename || "attachment");
      }
      const response = await fetchImpl(`${baseUrl}/api/v1/accounts/${encodeURIComponent(accountId)}/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: "POST",
        headers: { api_access_token: apiToken },
        body: form
      });
      if (!response.ok) throw new Error(`Chatwoot API returned ${response.status}`);
      return response.json();
    },
    // 下載 webhook 帶來的附件（data_url）；self-host 簽章網址可直接抓，失敗時補 API token 重試
    async fetchRemoteFile(url) {
      let response = await fetchImpl(url);
      if (!response.ok) {
        response = await fetchImpl(url, { headers: { api_access_token: apiToken } });
      }
      if (!response.ok) throw new Error(`Attachment download failed (${response.status})`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, contentType: response.headers.get("content-type") || "application/octet-stream" };
    },
    async health() {
      if (!baseUrl || !accountId || !apiToken) return { ok: false, configured: false };
      await request("/conversations?status=open&page=1");
      return { ok: true, configured: true, baseUrl, accountId };
    }
  };
}

export function verifyChatwootWebhook(secret, signature, payload) {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(typeof payload === "string" ? payload : JSON.stringify(payload || {})).digest("hex");
  const actual = String(signature).replace(/^sha256=/i, "").trim();
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function chatwootMessageContext(payload = {}) {
  const conversation = payload.conversation || {};
  const contact = payload.sender || payload.contact || conversation.meta?.sender || {};
  return {
    event: String(payload.event || payload.event_type || ""),
    messageType: String(payload.message_type || payload.messageType || ""),
    messageId: String(payload.id || "").trim(),
    content: String(payload.content || payload.message?.content || "").trim(),
    accountId: String(payload.account?.id || payload.account_id || conversation.account_id || "").trim(),
    conversationId: String(conversation.id || payload.conversation_id || "").trim(),
    contactId: String(contact.id || payload.contact_id || "").trim(),
    contactName: String(contact.name || "").trim(),
    senderName: String(payload.sender?.name || contact.name || "").trim(),
    inboxId: String(conversation.inbox_id || payload.inbox?.id || "").trim(),
    email: String(contact.email || "").trim(),
    phone: String(contact.phone_number || contact.phone || "").trim(),
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.map((item) => String(item?.data_url || item?.url || "")).filter(Boolean)
      : []
  };
}
