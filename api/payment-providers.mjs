/**
 * @description 可插拔付款供應商抽象層，架構仿照 api/object-storage.mjs 的 createObjectStorage()。
 *
 * 三個供應商目前都還沒有正式商店憑證，因此 createPayment()/verifyCallback() 不會真的打對外 API——
 * 每個供應商會先檢查必要的環境變數是否齊全（configured），沒齊全就直接回傳 not_configured，
 * 不會假裝呼叫成功。request/response 欄位名稱是依各家「公開」文件整理（見下方各供應商註解的來源），
 * 但沒有真正商店憑證可供端對端驗證，接上真正憑證後務必自行對照官方文件再驗一次。
 *
 * 之後要接上真的 HTTP 呼叫時，只需要在每個 provider 的 createPayment()/verifyCallback() 裡
 * 補上實際的 fetch + 簽章邏輯，呼叫端（server.mjs 的 checkout 路由）完全不用改。
 */

function envConfig(env, keys) {
  const values = {};
  let complete = true;
  for (const key of keys) {
    const value = env[key];
    values[key] = value || "";
    if (!value) complete = false;
  }
  return { values, complete };
}

// 街口支付 OnlinePay：POST https://<host>/platform/entry，header: api-key + digest（簽章）
// 來源：https://open-doc.jkos.com/ 「線上支付 OnlinePay/API列表/訂單創建 API」
function createJkopayProvider(env) {
  const { values, complete } = envConfig(env, ["LAYERPILOT_JKOPAY_STORE_ID", "LAYERPILOT_JKOPAY_API_KEY"]);
  return {
    id: "jkopay",
    name: "街口支付",
    configured: complete,
    async createPayment({ orderId, amount, currency = "TWD", returnUrl, notifyUrl }) {
      if (!complete) return { ok: false, status: "not_configured", message: "缺少 LAYERPILOT_JKOPAY_STORE_ID / LAYERPILOT_JKOPAY_API_KEY" };
      // TODO: 補上真正的 HTTP 呼叫。預期 body 形狀：
      // { platform_order_id: orderId, store_id: values.LAYERPILOT_JKOPAY_STORE_ID, currency,
      //   total_price: amount, final_price: amount, result_url: notifyUrl, result_display_url: returnUrl }
      // headers: { "api-key": values.LAYERPILOT_JKOPAY_API_KEY, digest: <對 body 計算的簽章，街口文件未公開演算法細節，需登入商店後台查閱> }
      return { ok: true, status: "pending", providerOrderId: orderId, redirectUrl: "", qrImageUrl: "", message: "JKoPay 已備妥串接點，尚未實際呼叫（無正式商店憑證）" };
    },
    async verifyCallback() {
      if (!complete) return { ok: false, status: "not_configured" };
      return { ok: false, status: "unverified", message: "JKoPay callback 簽章驗證尚未實作" };
    }
  };
}

// LINE Pay Online API v3：POST /v3/payments/request，header: X-LINE-ChannelId + X-LINE-Authorization（HMAC 簽章）+ nonce
// 來源：https://developers-pay.line.me/online-api-v3/request-payment
function createLinePayProvider(env) {
  const { values, complete } = envConfig(env, ["LAYERPILOT_LINEPAY_CHANNEL_ID", "LAYERPILOT_LINEPAY_CHANNEL_SECRET"]);
  return {
    id: "linepay",
    name: 'LINE Pay',
    configured: complete,
    async createPayment({ orderId, amount, currency = "TWD", returnUrl, cancelUrl }) {
      if (!complete) return { ok: false, status: "not_configured", message: "缺少 LAYERPILOT_LINEPAY_CHANNEL_ID / LAYERPILOT_LINEPAY_CHANNEL_SECRET" };
      // TODO: 補上真正的 HTTP 呼叫。預期 body 形狀：
      // { amount, currency, orderId, packages: [{ id: orderId, amount, products: [...] }], redirectUrls: { confirmUrl: returnUrl, cancelUrl } }
      // headers: { "X-LINE-ChannelId": values.LAYERPILOT_LINEPAY_CHANNEL_ID,
      //   "X-LINE-Authorization-Nonce": <uuid>, "X-LINE-Authorization": <HMAC-SHA256(channelSecret, channelSecret+uri+body+nonce) base64> }
      return { ok: true, status: "pending", providerOrderId: orderId, redirectUrl: "", transactionId: "", message: "LINE Pay 已備妥串接點，尚未實際呼叫（無正式 Channel 憑證）" };
    },
    async verifyCallback() {
      if (!complete) return { ok: false, status: "not_configured" };
      return { ok: false, status: "unverified", message: "LINE Pay confirm API 尚未實作" };
    }
  };
}

// PayUni（統一金流）：台灣第三方金流常見的 MerID + HashKey/HashIV AES 加解密模式（ECPay/藍新/PayUni 都是類似架構），
// 官方公開頁面沒有揭露詳細技術文件，此處先照業界通用模式建骨架，實際串接時務必對照 PayUni 商店後台文件核對欄位。
function createPayuniProvider(env) {
  const { values, complete } = envConfig(env, ["LAYERPILOT_PAYUNI_MER_ID", "LAYERPILOT_PAYUNI_HASH_KEY", "LAYERPILOT_PAYUNI_HASH_IV"]);
  return {
    id: "payuni",
    name: "統一金流 PayUni",
    configured: complete,
    async createPayment({ orderId, amount, currency = "TWD", returnUrl, notifyUrl }) {
      if (!complete) return { ok: false, status: "not_configured", message: "缺少 LAYERPILOT_PAYUNI_MER_ID / LAYERPILOT_PAYUNI_HASH_KEY / LAYERPILOT_PAYUNI_HASH_IV" };
      // TODO: 補上真正的 HTTP 呼叫。預期為 MerID + AES(HashKey/HashIV) 加密的 EncryptInfo 欄位，
      // body 大致形狀：{ MerID: values.LAYERPILOT_PAYUNI_MER_ID, Timestamp, Version, EncryptInfo: <AES-256-CBC 加密後的訂單明細>, HashInfo: <雜湊驗證碼> }
      // 正式串接前請先登入 PayUni 商店後台取得完整技術文件核對欄位與加解密演算法。
      return { ok: true, status: "pending", providerOrderId: orderId, redirectUrl: "", message: "PayUni 已備妥串接點，尚未實際呼叫（無正式商店憑證）" };
    },
    async verifyCallback() {
      if (!complete) return { ok: false, status: "not_configured" };
      return { ok: false, status: "unverified", message: "PayUni callback 解密/驗證尚未實作" };
    }
  };
}

const PROVIDER_FACTORIES = {
  jkopay: createJkopayProvider,
  linepay: createLinePayProvider,
  payuni: createPayuniProvider
};

export function listPaymentProviders(env = process.env) {
  return Object.values(PROVIDER_FACTORIES).map((factory) => {
    const provider = factory(env);
    return { id: provider.id, name: provider.name, configured: provider.configured };
  });
}

export function createPaymentProvider(id, env = process.env) {
  const factory = PROVIDER_FACTORIES[id];
  if (!factory) return null;
  return factory(env);
}
