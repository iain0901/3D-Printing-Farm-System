import { randomBytes } from "node:crypto";

// ============================================================================
// 3DRFM customer portal - Google / LINE OAuth login (Authorization Code Flow)
// - customers only; staff keep password + 2FA
// - one-time state (10 min TTL) persisted in DB (multi-instance safe)
// - callback 302 -> /portal/oauth-callback#token=... (hash never hits logs)
// - account linking: provider field (googleSub/lineUserId) -> email -> create
// - every fetch is injectable for tests
// ============================================================================

export const OAUTH_PROVIDERS = ["google", "line"];

export function oauthConfigFromEnv(env = process.env) {
  return {
    google: {
      clientId: String(env.GOOGLE_CLIENT_ID || "").trim(),
      clientSecret: String(env.GOOGLE_CLIENT_SECRET || "").trim(),
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userinfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo",
      scope: "openid email profile",
    },
    line: {
      clientId: String(env.LINE_LOGIN_CHANNEL_ID || "").trim(),
      clientSecret: String(env.LINE_LOGIN_CHANNEL_SECRET || "").trim(),
      authorizeUrl: "https://access.line.me/oauth2/v2.1/authorize",
      tokenUrl: "https://api.line.me/oauth2/v2.1/token",
      userinfoUrl: "https://api.line.me/oauth2/v2.1/userinfo",
      scope: "openid profile email",
    },
  };
}

export function redirectUriFor(provider, env = process.env) {
  const base = String(env.LAYERPILOT_OAUTH_REDIRECT_BASE || env.LAYERPILOT_PUBLIC_URL || "").replace(/\/+$/, "");
  return `${base}/api/customer-auth/oauth/${provider}/callback`;
}

export function isProviderConfigured(config, provider) {
  const p = config[provider];
  return Boolean(p && p.clientId && p.clientSecret);
}

export function buildAuthorizeUrl(config, provider, { redirectUri, state }) {
  const p = config[provider];
  const url = new URL(p.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", p.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", p.scope);
  if (provider === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }
  if (provider === "line") {
    url.searchParams.set("nonce", randomBytes(12).toString("hex"));
  }
  return url.toString();
}

export function newStateRecord(provider) {
  return { state: randomBytes(16).toString("hex"), provider, createdAt: new Date().toISOString() };
}

export function validateAndConsumeState(records, provider, state, now = Date.now(), ttlMs = 10 * 60 * 1000) {
  const idx = (records || []).findIndex((row) => row.state === state && row.provider === provider);
  if (idx === -1) return false;
  const row = records[idx];
  records.splice(idx, 1); // single-use
  const age = now - Date.parse(row.createdAt);
  return Number.isFinite(age) && age >= -5000 && age <= ttlMs;
}

async function postForm(url, params, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) throw new Error(`token exchange failed (${response.status})`);
  return response.json();
}

async function getJson(url, accessToken, fetchImpl) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error(`userinfo failed (${response.status})`);
  return response.json();
}

export async function exchangeAndFetchProfile(config, provider, { code, redirectUri }, fetchImpl = fetch) {
  const p = config[provider];
  const token = await postForm(
    p.tokenUrl,
    {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: p.clientId,
      client_secret: p.clientSecret,
    },
    fetchImpl
  );
  const accessToken = token.access_token;
  if (!accessToken) throw new Error("no access_token from provider");

  let raw;
  if (provider === "google") {
    raw = await getJson(p.userinfoUrl, accessToken, fetchImpl);
    return {
      providerId: String(raw.sub || ""),
      email: String(raw.email || "").toLowerCase(),
      emailVerified: raw.email_verified !== false,
      name: String(raw.name || raw.email || "").trim(),
      picture: String(raw.picture || ""),
    };
  }
  raw = await getJson(p.userinfoUrl, accessToken, fetchImpl);
  const email = String(raw.email || "").toLowerCase();
  return {
    providerId: String(raw.sub || ""),
    email,
    emailVerified: Boolean(email),
    name: String(raw.name || "").trim(),
    picture: String(raw.picture || ""),
  };
}

// provider 綁定欄位：google -> googleSub / line -> lineUserId
export function providerField(provider) {
  return provider === "google" ? "googleSub" : "lineUserId";
}

export function findCustomerByProvider(customers, provider, providerId) {
  if (!providerId) return null;
  const field = providerField(provider);
  return (customers || []).find((item) => String(item[field] || "") === providerId) || null;
}

export function findCustomerByEmail(customers, email) {
  const normalized = String(email || "").toLowerCase();
  if (!normalized) return null;
  return (customers || []).find((item) => String(item.email || "").toLowerCase() === normalized) || null;
}
