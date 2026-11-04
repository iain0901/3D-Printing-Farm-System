import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer, openDatabase, runTelemetryTick } from "./server.mjs";
import { launchServices } from "./launch-services.mjs";

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function fixture(emailClient = null, prepare = () => {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "3drfm-launch-"));
  const db = await openDatabase(path.join(dir, "data.json"));
  prepare(db);
  const app = await buildServer({
    db,
    emailClient,
    lineClient: null,
    serveStatic: false,
  });
  cleanups.push(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  await app.ready();
  const registered = await app.inject({
    method: "POST",
    url: "/api/customer-auth/register",
    payload: {
      name: "驗收會員",
      email: "launch@example.test",
      password: "fixture-password-123",
    },
  });
  expect(registered.statusCode).toBe(201);
  const member = registered.json();
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "demo@layerpilot.test", password: "layerpilot" },
  });
  const headers = { authorization: `Bearer ${login.json().token}` };
  return { app, db, member, headers, dir };
}
describe("non-hardware launch hardening", () => {
  it("resumes notification generation after restart instead of treating new changes as history", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const send = vi.fn(async () => {});
    const { app, db, member, dir } = await fixture({ send });
    expect(db.data.dataMeta.memberNotificationDeliveryVersion).toBe(1);
    await app.close();
    db.data.orders.push({
      id: "restart-order",
      customerId: member.customer.id,
      workspaceId: "ws-default",
      status: "ready",
    });
    await db.write();
    const reopened = await openDatabase(path.join(dir, "data.json"));
    const restarted = await buildServer({
      db: reopened,
      emailClient: { send },
      lineClient: null,
      serveStatic: false,
    });
    cleanups.push(() => restarted.close());
    await restarted.ready();
    await vi.advanceTimersByTimeAsync(15000);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(
      reopened.data.memberNotifications.find((n) =>
        n.sourceKey?.startsWith("order:restart-order")
      ).delivery.email.status
    ).toBe("sent");
  });
  it("does not send historical order notifications on initial startup", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const send = vi.fn(async () => {});
    const { db } = await fixture({ send }, (db) => {
      db.data.customers.push({
        id: "history-customer",
        workspaceId: "ws-default",
        email: "history@example.test",
      });
      db.data.orders.push({
        id: "history-order",
        customerId: "history-customer",
        workspaceId: "ws-default",
        status: "pending",
      });
    });
    await vi.advanceTimersByTimeAsync(15000);
    expect(send).not.toHaveBeenCalled();
    expect(
      db.data.memberNotifications.find((n) =>
        n.sourceKey?.startsWith("order:history-order")
      ).delivery.email
    ).toMatchObject({ status: "skipped", reason: "historical_baseline" });
    db.data.orders.find((o) => o.id === "history-order").status = "complete";
    await vi.advanceTimersByTimeAsync(15000);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });
  it("rejects a genuine reset token with malformed expiry and clears delivery issues after successful reset", async () => {
    const send = vi.fn(async () => {});
    const { app, db, member } = await fixture({ send });
    await app.inject({
      method: "POST",
      url: "/api/customer-auth/request-reset",
      payload: { email: "launch@example.test" },
    });
    const token = decodeURIComponent(
      send.mock.calls[0][0].text.match(/resetToken=([^&\s#]+)/)[1]
    );
    const customer = db.data.customers.find((c) => c.id === member.customer.id);
    customer.resetTokenExpiresAt = "invalid";
    const reset = () =>
      app.inject({
        method: "POST",
        url: "/api/customer-auth/reset",
        payload: { token, password: "new-fixture-password" },
      });
    expect((await reset()).statusCode).toBe(400);
    customer.resetTokenExpiresAt = new Date(Date.now() + 60000).toISOString();
    expect((await reset()).statusCode).toBe(200);
    expect(customer.resetDelivery).toBeUndefined();
    expect((await reset()).statusCode).toBe(400);
  });
  it("never advances simulated physical jobs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const database = {
      data: {
        printers: [{ id: "p", status: "printing", progress: 99 }],
        queue: [{ status: "printing", printerId: "p" }],
      },
      write: vi.fn(),
    };
    const before = structuredClone(database.data);
    expect(await runTelemetryTick(database, { increment: 100 })).toMatchObject({
      changed: false,
      skipped: true,
    });
    expect(database.data).toEqual(before);
    expect(database.write).not.toHaveBeenCalled();
  });
  it("forwards launch-service environment variables into the API container, not only the compose CLI", async () => {
    const compose = await readFile(
      new URL("../docker-compose.yml", import.meta.url),
      "utf8"
    );
    const template = await readFile(
      new URL("../.env.example", import.meta.url),
      "utf8"
    );
    const api = compose
      .split("  layerpilot:\n")[1]
      .split("  layerpilot-worker:\n")[0];
    for (const key of [
      "LAYERPILOT_PUBLIC_URL",
      "LAYERPILOT_SMTP_HOST",
      "LAYERPILOT_SMTP_PORT",
      "LAYERPILOT_SMTP_SECURE",
      "LAYERPILOT_SMTP_USER",
      "LAYERPILOT_SMTP_PASSWORD",
      "LAYERPILOT_SMTP_FROM",
      "LAYERPILOT_LINEPAY_CHANNEL_ID",
      "LAYERPILOT_LINEPAY_CHANNEL_SECRET",
      "LAYERPILOT_LINEPAY_SANDBOX",
      "LAYERPILOT_LINE_CHANNEL_ACCESS_TOKEN",
      "LAYERPILOT_LINE_API_BASE",
      "CHATWOOT_PORTAL_INBOX_ID",
      "CHATWOOT_API_CHANNEL_IDENTIFIER",
    ]) {
      expect(api).toContain(`${key}: \${${key}:-`);
      expect(template).toContain(`${key}=`);
    }
  });
  it("reports configuration separately from real-service verification without exposing credentials", () => {
    const status = launchServices({
      OPENAI_API_KEY: "must-not-leak",
      LAYERPILOT_LINEPAY_CHANNEL_ID: "id",
      LAYERPILOT_LINEPAY_CHANNEL_SECRET: "must-not-leak",
      LAYERPILOT_PUBLIC_URL: "http://not-production.test",
    });
    expect(status.checks.linepay.configured).toBe(true);
    expect(status.checks.publicUrl.configured).toBe(false);
    expect(status.liveServicesVerified).toBe(false);
    expect(JSON.stringify(status)).not.toContain("must-not-leak");
  });
  it("returns the same unavailable reset response for known and unknown accounts without SMTP", async () => {
    const { app, db } = await fixture();
    const known = await app.inject({
      method: "POST",
      url: "/api/customer-auth/request-reset",
      payload: { email: "launch@example.test" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/customer-auth/request-reset",
      payload: { email: "unknown@example.test" },
    });
    expect(known.statusCode).toBe(503);
    expect(unknown.statusCode).toBe(503);
    expect(known.json()).toEqual(unknown.json());
    expect(
      db.data.customers.find((c) => c.email === "launch@example.test")
        .resetTokenHash
    ).toBeFalsy();
  });
  it("persists reset delivery failure for operators without exposing account existence or reset tokens", async () => {
    const { app, db, dir, headers, member } = await fixture({
      send: async () => {
        throw new Error("provider disconnected");
      },
    });
    const known = await app.inject({
      method: "POST",
      url: "/api/customer-auth/request-reset",
      payload: { email: "launch@example.test" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/customer-auth/request-reset",
      payload: { email: "unknown@example.test" },
    });
    expect(known.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
    const customer = db.data.customers.find((c) => c.id === member.customer.id);
    expect(customer.resetDelivery.status).toBe("uncertain");
    const saved = JSON.parse(
      await readFile(path.join(dir, "data.json"), "utf8")
    );
    expect(
      saved.customers.find((c) => c.id === customer.id).resetDelivery.status
    ).toBe("uncertain");
    const report = await app.inject({
      url: "/api/member-service/launch-readiness",
      headers,
    });
    expect(report.json().passwordResetDeliveryIssues).toBe(1);
    const profile = await app.inject({
      url: "/api/customer-auth/me",
      headers: { authorization: `Bearer ${member.token}` },
    });
    expect(profile.json().customer.resetDelivery).toBeUndefined();
    customer.resetTokenExpiresAt = "invalid";
    // An invalid expiry must never become an indefinitely valid reset credential.
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/customer-auth/reset",
          payload: { token: "bad-token", password: "new-fixture-password" },
        })
      ).statusCode
    ).toBe(400);
  });
  it("restricts delivery diagnostics and retry to admins in the notification workspace", async () => {
    const { app, db, member, headers } = await fixture();
    db.data.memberNotifications.push(
      {
        id: "failed-notice",
        workspaceId: "ws-default",
        customerId: member.customer.id,
        delivery: { email: { status: "uncertain" } },
      },
      {
        id: "other-notice",
        workspaceId: "other",
        delivery: { email: { status: "failed" } },
      }
    );
    expect(
      (await app.inject({ url: "/api/member-service/launch-readiness" }))
        .statusCode
    ).toBe(401);
    expect(
      (
        await app.inject({
          url: "/api/member-service/notification-deliveries",
          headers: { authorization: `Bearer ${member.token}` },
        })
      ).statusCode
    ).toBe(401);
    const notices = await app.inject({
      url: "/api/member-service/notification-deliveries",
      headers,
    });
    expect(notices.statusCode).toBe(200);
    expect(notices.body).not.toContain("other-notice");
    const retry = (id, payload) =>
      app.inject({
        method: "POST",
        url: `/api/member-service/notification-deliveries/${id}/retry`,
        headers,
        payload,
      });
    expect(
      (await retry("failed-notice", { channel: "email" })).statusCode
    ).toBe(400);
    expect(
      (
        await retry("other-notice", {
          channel: "email",
          acknowledgeDuplicateRisk: true,
        })
      ).statusCode
    ).toBe(409);
    expect(
      (
        await retry("failed-notice", {
          channel: "email",
          acknowledgeDuplicateRisk: true,
        })
      ).json()
    ).toEqual({ queued: true });
    const staff = db.data.users.find((u) => u.email === "demo@layerpilot.test");
    staff.role = "Operator";
    expect(
      (
        await app.inject({
          url: "/api/member-service/launch-readiness",
          headers,
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/member-service/notification-deliveries",
          headers,
        })
      ).statusCode
    ).toBe(403);
    expect(
      (
        await retry("failed-notice", {
          channel: "email",
          acknowledgeDuplicateRisk: true,
        })
      ).statusCode
    ).toBe(403);
  });
  it("detects background order changes and delivers without a member visit", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const send = vi.fn(async () => {});
    const { app, db, member } = await fixture({ send });
    db.data.orders.push({
      id: "background-order",
      customerId: member.customer.id,
      workspaceId: "ws-default",
      status: "ready",
    });
    await vi.advanceTimersByTimeAsync(15000);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(
      db.data.memberNotifications.find((n) =>
        n.sourceKey?.startsWith("order:background-order")
      ).delivery.email.status
    ).toBe("sent");
    await vi.advanceTimersByTimeAsync(15000);
    expect(send).toHaveBeenCalledTimes(1);
    await app.close();
  });
  it("retains uncertain LINE Pay confirmation for operator reconciliation without marking an order paid", async () => {
    const { app, db, member, headers, dir } = await fixture();
    vi.stubEnv("LAYERPILOT_LINEPAY_CHANNEL_ID", "fixture-id");
    vi.stubEnv("LAYERPILOT_LINEPAY_CHANNEL_SECRET", "fixture-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection lost after provider received confirmation");
      })
    );
    db.data.orders.push({
      id: "payment-order",
      workspaceId: "ws-default",
      customerId: member.customer.id,
      value: 200,
      currency: "TWD",
      status: "pending",
      payment: {
        provider: "linepay",
        status: "pending",
        transactionId: "2023042201206549310",
        amount: 200,
        currency: "TWD",
      },
    });
    const result = await app.inject({
      method: "POST",
      url: "/api/customer/payments/linepay/confirm",
      headers: { authorization: `Bearer ${member.token}` },
      payload: {
        orderId: "payment-order",
        transactionId: "2023042201206549310",
      },
    });
    expect(result.statusCode).toBe(409);
    const saved = JSON.parse(
      await readFile(path.join(dir, "data.json"), "utf8")
    );
    expect(
      saved.orders.find((o) => o.id === "payment-order").payment
    ).toMatchObject({
      status: "pending",
      confirmation: { status: "needs_review", attempts: 1 },
    });
    const report = await app.inject({
      url: "/api/member-service/launch-readiness",
      headers,
    });
    expect(report.json().paymentsNeedingReview).toEqual([
      expect.objectContaining({ orderId: "payment-order", amount: 200 }),
    ]);
    expect(report.body).not.toContain("fixture-secret");
  });
});
