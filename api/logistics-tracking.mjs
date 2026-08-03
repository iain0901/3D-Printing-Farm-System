/**
 * @description 可插拔物流查詢供應商抽象層，架構仿照 api/object-storage.mjs 的 createObjectStorage()。
 *
 * Track.TW（https://track.tw/）是台灣的一站式物流查詢平台，整合約 23 家台灣快遞/電商的貨態查詢。
 * 但他們的公開頁面只有服務條款，沒有公開技術文件（endpoint 路徑、簽章方式、request/response 欄位），
 * 需要先向 Track.TW 申請 API 存取權（見 https://track.tw/article/detail/a1b5e6f5-814e-4317-82f5-f33f920acd1f
 * 的服務條款頁）才能拿到正式文件。因此這裡只先做好「串接點」：env 變數骨架 + 統一的查詢介面，
 * 實際 HTTP 呼叫等拿到 Track.TW 核發的 API 文件與金鑰後再補上，呼叫端（server.mjs）不用再改。
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

function createTrackTwProvider(env) {
  const { values, complete } = envConfig(env, ["LAYERPILOT_TRACKTW_API_KEY"]);
  const baseUrl = env.LAYERPILOT_TRACKTW_BASE_URL || "https://track.tw";
  return {
    id: "tracktw",
    name: "Track.TW",
    configured: complete,
    // carrier: 物流公司名稱（例如「黑貓宅急便」「7-ELEVEN 交貨便」），trackingNumber: 追蹤號碼
    async queryStatus({ carrier, trackingNumber }) {
      if (!complete) {
        return { ok: false, status: "not_configured", carrier, trackingNumber, message: "缺少 LAYERPILOT_TRACKTW_API_KEY，且 Track.TW 尚未提供公開技術文件，需先向其申請 API 存取權" };
      }
      // TODO: 拿到 Track.TW 正式 API 文件後，在這裡補上真正的 HTTP 呼叫，例如：
      // const response = await fetch(`${baseUrl}/api/...`, { headers: { Authorization: `Bearer ${values.LAYERPILOT_TRACKTW_API_KEY}` }, ... })
      return {
        ok: true,
        status: "pending",
        carrier,
        trackingNumber,
        events: [],
        message: `Track.TW 串接點已備妥（base=${baseUrl}），尚未實際查詢（無正式 API 文件與金鑰）`
      };
    }
  };
}

const PROVIDER_FACTORIES = {
  tracktw: createTrackTwProvider
};

export function createLogisticsProvider(id = "tracktw", env = process.env) {
  const factory = PROVIDER_FACTORIES[id];
  if (!factory) return null;
  return factory(env);
}
