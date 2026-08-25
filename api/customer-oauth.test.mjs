import { describe, expect, it } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeAndFetchProfile,
  findCustomerByEmail,
  findCustomerByProvider,
  isProviderConfigured,
  newStateRecord,
  oauthConfigFromEnv,
  redirectUriFor,
  validateAndConsumeState,
} from "./customer-oauth.mjs";

const CONFIG = {
  google: { clientId: "g-id", clientSecret: "g-secret", authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", userinfoUrl: "https://www.googleapis.com/oauth2/v3/userinfo", scope: "openid email profile" },
  line: { clientId: "l-id", clientSecret: "l-secret", authorizeUrl: "https://access.line.me/oauth2/v2.1/authorize", tokenUrl: "https://api.line.me/oauth2/v2.1/token", userinfoUrl: "https://api.line.me/oauth2/v2.1/userinfo", scope: "openid profile email" },
};

describe("customer oauth", () => {
  it("reports configured state per provider", () => {
    expect(isProviderConfigured(oauthConfigFromEnv({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }), "google")).toBe(true);
    expect(isProviderConfigured(oauthConfigFromEnv({}), "line")).toBe(false);
  });

  it("builds authorize urls with required params", () => {
    const url = new URL(buildAuthorizeUrl(CONFIG, "google", { redirectUri: "https://x/cb", state: "s1" }));
    expect(url.searchParams.get("client_id")).toBe("g-id");
    expect(url.searchParams.get("redirect_uri")).toBe("https://x/cb");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("scope")).toContain("email");

    const line = new URL(buildAuthorizeUrl(CONFIG, "line", { redirectUri: "https://x/cb", state: "s2" }));
    expect(line.searchParams.get("nonce")).toBeTruthy();
  });

  it("redirect base derives provider callback urls", () => {
    const env = { LAYERPILOT_PUBLIC_URL: "https://print.3drfm.com/" };
    expect(redirectUriFor("google", env)).toBe("https://print.3drfm.com/api/customer-auth/oauth/google/callback");
  });

  it("state is single-use, provider-scoped and expiring", () => {
    const records = [newStateRecord("google")];
    const state = records[0].state;
    expect(validateAndConsumeState(records, "google", state)).toBe(true);
    // 已消耗：第二次必敗
    expect(validateAndConsumeState(records, "google", state)).toBe(false);

    const fresh = [newStateRecord("line")];
    expect(validateAndConsumeState(fresh, "google", fresh[0].state)).toBe(false);
    expect(validateAndConsumeState(fresh, "line", fresh[0].state)).toBe(true);

    const stale = [{ ...newStateRecord("google"), createdAt: new Date(Date.now() - 11 * 60 * 1000).toISOString() }];
    expect(validateAndConsumeState(stale, "google", stale[0].state)).toBe(false);
  });

  it("exchanges code and normalizes google profile", async () => {
    const fetchImpl = async (url, init) => {
      if (url === CONFIG.google.tokenUrl) {
        expect(new URLSearchParams(init.body).get("code")).toBe("abc");
        return { ok: true, json: async () => ({ access_token: "at" }) };
      }
      return { ok: true, json: async () => ({ sub: "g123", email: "User@X.com", name: "User", email_verified: true }) };
    };
    const profile = await exchangeAndFetchProfile(CONFIG, "google", { code: "abc", redirectUri: "r" }, fetchImpl);
    expect(profile).toMatchObject({ providerId: "g123", email: "user@x.com", name: "User" });
  });

  it("exchanges code and normalizes line profile", async () => {
    const fetchImpl = async (url) => {
      if (url === CONFIG.line.tokenUrl) return { ok: true, json: async () => ({ access_token: "lt" }) };
      return { ok: true, json: async () => ({ sub: "L9", name: "LINE User", email: "l@x.com" }) };
    };
    const profile = await exchangeAndFetchProfile(CONFIG, "line", { code: "c", redirectUri: "r" }, fetchImpl);
    expect(profile.providerId).toBe("L9");
  });

  it("links by provider field first, then email", () => {
    const customers = [
      { id: "c1", googleSub: "g123" },
      { id: "c2", email: "user@x.com" },
    ];
    expect(findCustomerByProvider(customers, "google", "g123").id).toBe("c1");
    expect(findCustomerByProvider(customers, "google", "nope")).toBe(null);
    expect(findCustomerByEmail(customers, "USER@x.com").id).toBe("c2");
  });
});
