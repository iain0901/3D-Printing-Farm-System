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
    content: String(payload.content || payload.message?.content || "").trim(),
    accountId: String(payload.account?.id || payload.account_id || conversation.account_id || "").trim(),
    conversationId: String(conversation.id || payload.conversation_id || "").trim(),
    contactId: String(contact.id || "").trim(),
    contactName: String(contact.name || "").trim(),
    inboxId: String(conversation.inbox_id || payload.inbox?.id || "").trim(),
    email: String(contact.email || "").trim(),
    phone: String(contact.phone_number || contact.phone || "").trim()
  };
}
