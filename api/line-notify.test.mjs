import { describe, expect, it } from "vitest";
import {
  createLineClient,
  lineConfigFromEnv,
  operatorMessageText,
  quoteReadyText,
  resolveLineTarget,
  shippedText
} from "./line-notify.mjs";

describe("line notify", () => {
  it("reports not configured without a channel token", async () => {
    expect(lineConfigFromEnv({}).configured).toBe(false);
    const client = createLineClient({ env: {} });
    expect(client.configured).toBe(false);
    const result = await client.push("U123", "hi");
    expect(result).toMatchObject({ sent: false, reason: "not_configured" });
  });

  it("pushes text messages with bearer auth to the messaging api", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      return { ok: true };
    };
    const client = createLineClient({
      config: { configured: true, channelAccessToken: "token-1", apiBase: "https://api.line.me" },
      fetchImpl
    });
    const result = await client.push("Uabc", "hello");
    expect(result).toEqual({ sent: true });
    expect(calls[0].url).toBe("https://api.line.me/v2/bot/message/push");
    expect(calls[0].init.headers.authorization).toBe("Bearer token-1");
    expect(JSON.parse(calls[0].init.body)).toEqual({ to: "Uabc", messages: [{ type: "text", text: "hello" }] });
  });

  it("maps api and network failures to structured results instead of throwing", async () => {
    const failing = createLineClient({
      config: { configured: true, channelAccessToken: "t", apiBase: "https://api.line.me" },
      fetchImpl: async () => ({ ok: false, status: 400 })
    });
    await expect(failing.push("U1", "x")).resolves.toMatchObject({ sent: false, reason: "api_error", status: 400 });

    const network = createLineClient({
      config: { configured: true, channelAccessToken: "t", apiBase: "https://api.line.me" },
      fetchImpl: async () => {
        throw new Error("boom");
      }
    });
    await expect(network.push("U1", "x")).resolves.toMatchObject({ sent: false, reason: "network_error" });
  });

  it("resolves the line target from the record then the crm fallback by email", () => {
    const data = { customers: [{ email: "Buyer@Example.com", line: "Ucrm999" }] };
    expect(resolveLineTarget(data, { lineUserId: "Udirect" })).toBe("Udirect");
    expect(resolveLineTarget(data, { customerSnapshot: { lineUserId: "Usnap" } })).toBe("Usnap");
    expect(resolveLineTarget(data, { email: "buyer@example.com" })).toBe("Ucrm999");
    expect(resolveLineTarget(data, { email: "nobody@example.com" })).toBe("");
    expect(resolveLineTarget({}, {})).toBe("");
  });

  it("builds zh-tw notification texts with key details", () => {
    const ready = quoteReadyText({ customer: "王先生", project: "齒輪箱外殼", quotedValue: 1250, url: "https://x/portal" });
    expect(ready).toContain("王先生 您好");
    expect(ready).toContain("NT$1,250");
    expect(ready).toContain("https://x/portal");

    const message = operatorMessageText({ author: "客服小美", project: "公仔", excerpt: "支撐面已調整，預計明天上機。".repeat(20), url: "https://x/portal" });
    expect(message).toContain("新的客服訊息");
    expect(message.length).toBeLessThan(4900);

    const shipped = shippedText({ project: "外殼 x3", carrier: "黑貓", trackingNumber: "T987654321", url: "https://x/portal" });
    expect(shipped).toContain("已出貨");
    expect(shipped).toContain("T987654321");
  });
});
