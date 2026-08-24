// ============================================================================
// 3DSTU FarmFlow LINE 客戶通知（notify-only）
//
// 定位：LINE 只做「單向通知」（報價就緒、專員回訊、已出貨），不做對話；
// 對話一律收斂在 Chatwoot（網站 widget / LINE inbox / email 皆匯入同一收件匣）。
//
// 需要：LINE Developers 後台開通 Messaging API 的 channel access token，
// 以及客戶的 LINE userId（U 開頭 33 碼）。userId 取得順序：
//   1) 案件/報價記錄上的 lineUserId（Chatwoot LINE inbox 對話會帶入）
//   2) CRM 客戶資料（customers.line）以 email 對應
// 未設定 token 或找不到 userId 時靜默略過，不影響主要流程。
// ============================================================================

const DEFAULT_API_BASE = "https://api.line.me";
const MAX_TEXT = 4900;

export function lineConfigFromEnv(env = process.env) {
  const channelAccessToken = String(env.LAYERPILOT_LINE_CHANNEL_ACCESS_TOKEN || "").trim();
  const apiBase = String(env.LAYERPILOT_LINE_API_BASE || DEFAULT_API_BASE).replace(/\/+$/, "");
  return { configured: Boolean(channelAccessToken), channelAccessToken, apiBase };
}

export function createLineClient(options = {}) {
  const config = options.config || lineConfigFromEnv(options.env);
  const fetchImpl = options.fetchImpl || fetch;
  return {
    configured: config.configured,
    async push(userId, text) {
      if (!config.configured) return { sent: false, reason: "not_configured" };
      if (!userId) return { sent: false, reason: "no_recipient" };
      const body = {
        to: String(userId),
        messages: [{ type: "text", text: String(text || "").slice(0, MAX_TEXT) }]
      };
      let response;
      try {
        response = await fetchImpl(`${config.apiBase}/v2/bot/message/push`, {
          method: "POST",
          headers: { authorization: `Bearer ${config.channelAccessToken}`, "content-type": "application/json" },
          body: JSON.stringify(body)
        });
      } catch (error) {
        return { sent: false, reason: "network_error", detail: error instanceof Error ? error.message : String(error) };
      }
      if (!response.ok) {
        return { sent: false, reason: "api_error", status: response.status };
      }
      return { sent: true };
    }
  };
}

/**
 * 由報價/案件相關記錄解析客戶的 LINE userId。
 * 順序：record.lineUserId → record.customerSnapshot.lineUserId → CRM（同 email）的 line 欄位。
 */
export function resolveLineTarget(data, record = {}) {
  const direct = String(record.lineUserId || "").trim();
  if (direct) return direct;
  const snapshot = String(record.customerSnapshot?.lineUserId || "").trim();
  if (snapshot) return snapshot;
  const email = String(record.email || record.customerEmail || record.customerSnapshot?.email || "").trim().toLowerCase();
  if (email && Array.isArray(data.customers)) {
    const match = data.customers.find((item) => String(item.email || "").trim().toLowerCase() === email && String(item.line || "").trim());
    if (match) return String(match.line).trim();
  }
  return "";
}

export function quoteReadyText({ customer, project, quotedValue, url }) {
  const lines = [
    `${customer ? `${customer} 您好，` : "您好，"}`,
    `您的報價「${project}」已完成，${quotedValue ? `金額 NT$${Number(quotedValue).toLocaleString()}，` : ""}請登入客戶入口查看並確認。`,
    "",
    url,
    "",
    "— 3DRFM 三點成型"
  ];
  return lines.join("\n").slice(0, MAX_TEXT);
}

export function operatorMessageText({ author, project, excerpt, url }) {
  const lines = [
    `您的案件「${project}」有新的客服訊息：`,
    `「${String(excerpt || "").slice(0, 120)}」`,
    "",
    "請進入客戶入口回覆：",
    url,
    "",
    "— 3DRFM 三點成型"
  ];
  void author;
  return lines.join("\n").slice(0, MAX_TEXT);
}

export function shippedText({ project, carrier, trackingNumber, url }) {
  const lines = [
    `好消息！您的訂單${project ? `（${project}）` : ""}已出貨。`,
    carrier ? `物流：${carrier}` : "",
    trackingNumber ? `追蹤號碼：${trackingNumber}` : "",
    "",
    "追蹤詳情請至客戶入口：",
    url,
    "",
    "— 3DRFM 三點成型"
  ].filter(Boolean);
  return lines.join("\n").slice(0, MAX_TEXT);
}
