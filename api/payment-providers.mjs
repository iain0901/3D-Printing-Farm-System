/**
 * @description 可插拔付款供應商抽象層，架構仿照 api/object-storage.mjs 的 createObjectStorage()。
 *
 * LINE Pay implements signed request + server confirmation, gated on merchant credentials.
 * Sandbox integration must be accepted before production activation. JKoPay and PayUni
 * remain unavailable until their merchant-specific protocols are implemented and verified.
 */

import { createHmac, randomUUID } from "node:crypto";

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
  const { values, complete } = envConfig(env, [
    "LAYERPILOT_JKOPAY_STORE_ID",
    "LAYERPILOT_JKOPAY_API_KEY",
  ]);
  return {
    id: "jkopay",
    name: "街口支付",
    configured: false,
    async createPayment({
      orderId,
      amount,
      currency = "TWD",
      returnUrl,
      notifyUrl,
    }) {
      if (!complete)
        return {
          ok: false,
          status: "not_configured",
          message:
            "缺少 LAYERPILOT_JKOPAY_STORE_ID / LAYERPILOT_JKOPAY_API_KEY",
        };
      // TODO: 補上真正的 HTTP 呼叫。預期 body 形狀：
      // { platform_order_id: orderId, store_id: values.LAYERPILOT_JKOPAY_STORE_ID, currency,
      //   total_price: amount, final_price: amount, result_url: notifyUrl, result_display_url: returnUrl }
      // headers: { "api-key": values.LAYERPILOT_JKOPAY_API_KEY, digest: <對 body 計算的簽章，街口文件未公開演算法細節，需登入商店後台查閱> }
      return {
        ok: false,
        status: "not_configured",
        message: "街口支付尚未開放",
      };
    },
    async verifyCallback() {
      if (!complete) return { ok: false, status: "not_configured" };
      return {
        ok: false,
        status: "unverified",
        message: "JKoPay callback 簽章驗證尚未實作",
      };
    },
  };
}

// LINE Pay Online API v3：POST /v3/payments/request，header: X-LINE-ChannelId + X-LINE-Authorization（HMAC 簽章）+ nonce
// 來源：https://developers-pay.line.me/online-api-v3/request-payment
function createLinePayProvider(env, { fetchImpl = globalThis.fetch } = {}) {
  const { values, complete } = envConfig(env, [
    "LAYERPILOT_LINEPAY_CHANNEL_ID",
    "LAYERPILOT_LINEPAY_CHANNEL_SECRET",
  ]);
  const base =
    env.LAYERPILOT_LINEPAY_SANDBOX === "true"
      ? "https://sandbox-api-pay.line.me"
      : "https://api-pay.line.me";
  async function call(uri, body) {
    const json = JSON.stringify(body),
      nonce = randomUUID();
    const secret = values.LAYERPILOT_LINEPAY_CHANNEL_SECRET;
    const response = await fetchImpl(base + uri, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        "X-LINE-ChannelId": values.LAYERPILOT_LINEPAY_CHANNEL_ID,
        "X-LINE-Authorization-Nonce": nonce,
        "X-LINE-Authorization": createHmac("sha256", secret)
          .update(secret + uri + json + nonce)
          .digest("base64"),
      },
      body: json,
    });
    if (!response.ok) throw new Error("LINE Pay 連線失敗，請稍後再試");
    // LINE Pay transaction IDs exceed JavaScript's safe integer range.
    return JSON.parse(
      (await response.text()).replace(
        /("transactionId"\s*:\s*)(\d+)/g,
        '$1"$2"'
      )
    );
  }
  return {
    id: "linepay",
    name: "LINE Pay",
    configured: complete,
    async createPayment({
      orderId,
      amount,
      currency = "TWD",
      returnUrl,
      cancelUrl,
    }) {
      if (!complete)
        return {
          ok: false,
          status: "not_configured",
          message:
            "缺少 LAYERPILOT_LINEPAY_CHANNEL_ID / LAYERPILOT_LINEPAY_CHANNEL_SECRET",
        };
      try {
        const result = await call("/v3/payments/request", {
          amount,
          currency,
          orderId,
          packages: [
            {
              id: orderId,
              amount,
              products: [
                { name: "3DRFM 列印服務", quantity: 1, price: amount },
              ],
            },
          ],
          redirectUrls: {
            confirmUrl: returnUrl,
            cancelUrl: cancelUrl || returnUrl,
          },
        });
        const url = result.info?.paymentUrl?.web;
        if (result.returnCode !== "0000" || !url || !result.info?.transactionId)
          return {
            ok: false,
            status: "failed",
            message: "LINE Pay 暫時無法建立付款，請稍後再試",
          };
        const parsed = new URL(url);
        if (
          parsed.protocol !== "https:" ||
          !(
            parsed.hostname === "line.me" ||
            parsed.hostname.endsWith(".line.me")
          )
        )
          throw new Error("付款網址驗證失敗");
        return {
          ok: true,
          status: "pending",
          providerOrderId: orderId,
          transactionId: String(result.info.transactionId),
          redirectUrl: url,
          message: "請前往 LINE Pay 完成付款",
        };
      } catch {
        return {
          ok: false,
          status: "failed",
          message: "無法連線至 LINE Pay，請稍後重試",
        };
      }
    },
    async verifyCallback({ transactionId, orderId, amount, currency = "TWD" }) {
      if (!complete) return { ok: false, status: "not_configured" };
      if (!/^\d{10,30}$/.test(String(transactionId)))
        return { ok: false, status: "unverified" };
      try {
        const result = await call(`/v3/payments/${transactionId}/confirm`, {
          amount,
          currency,
        });
        const info = result.info;
        const paid = (info?.payInfo || []).reduce(
          (sum, item) => sum + Number(item.amount),
          0
        );
        if (
          result.returnCode !== "0000" ||
          info?.orderId !== orderId ||
          String(info?.transactionId) !== String(transactionId) ||
          paid !== amount
        )
          return {
            ok: false,
            status: "unverified",
            message: "付款尚未確認，請聯絡專員協助查核",
          };
        return {
          ok: true,
          status: "paid",
          transactionId: String(transactionId),
          amount,
          currency,
        };
      } catch {
        return {
          ok: false,
          status: "unverified",
          message: "付款驗證暫時無法完成，請稍後再試",
        };
      }
    },
  };
}

// PayUni（統一金流）：台灣第三方金流常見的 MerID + HashKey/HashIV AES 加解密模式（ECPay/藍新/PayUni 都是類似架構），
// 官方公開頁面沒有揭露詳細技術文件，此處先照業界通用模式建骨架，實際串接時務必對照 PayUni 商店後台文件核對欄位。
function createPayuniProvider(env) {
  const { values, complete } = envConfig(env, [
    "LAYERPILOT_PAYUNI_MER_ID",
    "LAYERPILOT_PAYUNI_HASH_KEY",
    "LAYERPILOT_PAYUNI_HASH_IV",
  ]);
  return {
    id: "payuni",
    name: "統一金流 PayUni",
    configured: false,
    async createPayment({
      orderId,
      amount,
      currency = "TWD",
      returnUrl,
      notifyUrl,
    }) {
      if (!complete)
        return {
          ok: false,
          status: "not_configured",
          message:
            "缺少 LAYERPILOT_PAYUNI_MER_ID / LAYERPILOT_PAYUNI_HASH_KEY / LAYERPILOT_PAYUNI_HASH_IV",
        };
      // TODO: 補上真正的 HTTP 呼叫。預期為 MerID + AES(HashKey/HashIV) 加密的 EncryptInfo 欄位，
      // body 大致形狀：{ MerID: values.LAYERPILOT_PAYUNI_MER_ID, Timestamp, Version, EncryptInfo: <AES-256-CBC 加密後的訂單明細>, HashInfo: <雜湊驗證碼> }
      // 正式串接前請先登入 PayUni 商店後台取得完整技術文件核對欄位與加解密演算法。
      return {
        ok: false,
        status: "not_configured",
        message: "統一金流尚未開放",
      };
    },
    async verifyCallback() {
      if (!complete) return { ok: false, status: "not_configured" };
      return {
        ok: false,
        status: "unverified",
        message: "PayUni callback 解密/驗證尚未實作",
      };
    },
  };
}

const PROVIDER_FACTORIES = {
  jkopay: createJkopayProvider,
  linepay: createLinePayProvider,
  payuni: createPayuniProvider,
};

export function listPaymentProviders(env = process.env) {
  return Object.values(PROVIDER_FACTORIES).map((factory) => {
    const provider = factory(env);
    return {
      id: provider.id,
      name: provider.name,
      configured: provider.configured,
    };
  });
}

export function createPaymentProvider(id, env = process.env, options = {}) {
  const factory = PROVIDER_FACTORIES[id];
  if (!factory) return null;
  return factory(env, options);
}
