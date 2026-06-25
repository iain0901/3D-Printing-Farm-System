import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { buildServer, generateTotpCode, openDatabase } from "./server.mjs";

async function withApp(testBody, serverOptions = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "layerpilot-api-"));
  const dbPath = path.join(dir, "db.json");
  const db = await openDatabase(dbPath);
  const app = await buildServer({ db, ...serverOptions });
  try {
    return await testBody({ app, db, dbPath });
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
}

async function login(app, email = "demo@layerpilot.test", password = "layerpilot") {
  const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });
  expect(response.statusCode).toBe(200);
  return response.json().token;
}

function auth(token) {
  return { authorization: `Bearer ${token}` };
}

function createWebSocketCollector() {
  const messages = [];
  const waiters = [];
  const onMessage = (event) => {
    try {
      const raw = event?.data ?? event;
      const message = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw || "{}"));
      messages.push(message);
      for (const waiter of [...waiters]) {
        if (!waiter.predicate(message)) continue;
        clearTimeout(waiter.timer);
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(message);
      }
    } catch {
      // Ignore malformed frames; tests wait only for valid JSON frames.
    }
  };
  return {
    attach(socket) {
      if (socket.addEventListener) socket.addEventListener("message", onMessage);
      else socket.on("message", onMessage);
    },
    waitFor(predicate, timeoutMs = 3000) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            waiters.splice(waiters.indexOf(waiter), 1);
            reject(new Error("Timed out waiting for WebSocket message"));
          }, timeoutMs)
        };
        waiters.push(waiter);
      });
    }
  };
}

async function withEnv(patch, testBody) {
  const previous = {};
  for (const key of Object.keys(patch)) {
    previous[key] = process.env[key];
    process.env[key] = patch[key];
  }
  try {
    return await testBody();
  } finally {
    for (const key of Object.keys(patch)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function removeDirWithRetry(dir, attempts = 5) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 75 * attempt));
    }
  }
}

function multipartPayload({ boundary, filename, content, fields = {} }) {
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`));
  chunks.push(Buffer.isBuffer(content) ? content : Buffer.from(content));
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

function createFakeS3Storage() {
  const objects = new Map();
  return {
    provider: "s3",
    root: "s3://layerpilot-test/lab",
    objects,
    async put({ relativePath, buffer }) {
      const key = `lab/${relativePath}`.replace(/\\/g, "/");
      objects.set(key, Buffer.from(buffer));
      return { storagePath: `s3://layerpilot-test/${key}`, storageProvider: "s3", storageKey: key, bytes: buffer.length };
    },
    async get(file) {
      const value = objects.get(file.storageKey);
      if (!value) throw new Error("S3 object missing");
      return Buffer.from(value);
    },
    async stat(file) {
      const value = objects.get(file.storageKey);
      if (!value) throw new Error("S3 object missing");
      return value.length;
    },
    async delete(file) {
      return objects.delete(file.storageKey);
    },
    async health() {
      return { ok: true, detail: "s3://layerpilot-test/lab" };
    }
  };
}

describe("3DSTU FarmFlow API", () => {
  it("reports health and protects full persisted state", async () => {
    await withApp(async ({ app }) => {
      const health = await app.inject({ method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ ok: true, persistence: "lowdb-json" });

      const locked = await app.inject({ method: "GET", url: "/api/state" });
      expect(locked.statusCode).toBe(401);

      const token = await login(app);
      const state = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(state.statusCode).toBe(200);
      expect(state.json().printers.length).toBeGreaterThan(0);
      expect(state.json().todos.length).toBeGreaterThan(0);
      expect(state.json().sessions).toBeUndefined();
      expect(state.json().users.some((user) => "passwordHash" in user)).toBe(false);
    });
  });

  it("streams authenticated realtime state and events over WebSocket", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      await app.ready();
      const collector = createWebSocketCollector();
      const socket = await app.injectWS("/api/events/ws", { headers: auth(token) }, { onInit: (ws) => collector.attach(ws) });
      try {
        const initial = await collector.waitFor((message) => message.event === "state");
        expect(initial.data).toMatchObject({ reason: "ws.open" });
        expect(initial.data.state.printers.length).toBeGreaterThan(0);
        const printerId = initial.data.state.printers[0].id;

        const updated = await app.inject({
          method: "PATCH",
          url: `/api/printers/${printerId}/status`,
          headers: auth(token),
          payload: { status: "maintenance" }
        });
        expect(updated.statusCode).toBe(200);

        const event = await collector.waitFor((message) => message.event === "event" && message.data?.event?.type === "printer.status");
        expect(event.data.event).toMatchObject({ type: "printer.status" });
        expect(event.data.event.data).toMatchObject({ printerId, status: "maintenance" });
      } finally {
        socket.close();
      }
    });
  });

  it("reports readiness and protects operational metrics", async () => {
    await withEnv({ LAYERPILOT_METRICS_TOKEN: "metrics-secret" }, async () => {
      await withApp(async ({ app }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(200);
        expect(readiness.json()).toMatchObject({
          ok: true,
          service: "layerpilot-api",
          checks: expect.arrayContaining([
            expect.objectContaining({ name: "database", ok: true }),
            expect.objectContaining({ name: "storage", ok: true })
          ])
        });

        const anonymousMetrics = await app.inject({ method: "GET", url: "/api/metrics" });
        expect(anonymousMetrics.statusCode).toBe(401);

        const queryTokenMetrics = await app.inject({ method: "GET", url: "/api/metrics?metricsToken=metrics-secret" });
        expect(queryTokenMetrics.statusCode).toBe(200);
        expect(queryTokenMetrics.headers["content-type"]).toContain("text/plain");
        expect(queryTokenMetrics.body).toContain("layerpilot_up 1");

        const tokenMetrics = await app.inject({ method: "GET", url: "/api/metrics", headers: { "x-layerpilot-metrics-token": "metrics-secret" } });
        expect(tokenMetrics.statusCode).toBe(200);
        expect(tokenMetrics.headers["content-type"]).toContain("text/plain");
        expect(tokenMetrics.body).toContain("layerpilot_up 1");
        expect(tokenMetrics.body).toContain('layerpilot_records_total{collection="queue"}');
        expect(tokenMetrics.body).toContain("layerpilot_storage_used_bytes");

        const ownerToken = await login(app);
        const created = await app.inject({
          method: "POST",
          url: "/api/apiKeys",
          headers: auth(ownerToken),
          payload: { name: "Metrics key", scopes: ["metrics:read"], enabled: true }
        });
        expect(created.statusCode).toBe(201);
        const keyMetrics = await app.inject({ method: "GET", url: "/api/metrics", headers: auth(created.json().secret) });
        expect(keyMetrics.statusCode).toBe(200);
        expect(keyMetrics.body).toContain("layerpilot_printers_total");

        const metricsKeyQueue = await app.inject({ method: "GET", url: "/api/queue", headers: auth(created.json().secret) });
        expect(metricsKeyQueue.statusCode).toBe(403);
        expect(metricsKeyQueue.json()).toMatchObject({ error: "API key scope does not allow reading this resource" });
      });
    });
  });

  it("fails production readiness when default access or weak ops tokens are configured", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "change-this-password",
      LAYERPILOT_WORKER_TOKEN: "change-this-worker-token",
      LAYERPILOT_METRICS_TOKEN: "change-this-metrics-token",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "",
      LAYERPILOT_DISABLE_DEMO_LOGIN: ""
    }, async () => {
      await withApp(async ({ app }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(503);
        expect(readiness.json()).toMatchObject({ ok: false });
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-env-required", ok: true }),
          expect.objectContaining({ name: "production-secrets", ok: false }),
          expect.objectContaining({ name: "production-default-access", ok: false })
        ]));
        expect(readiness.json().checks.find((check) => check.name === "production-secrets").detail).toContain("uses documented default");
        expect(readiness.json().checks.find((check) => check.name === "production-default-access").detail).toContain("LAYERPILOT_DISABLE_DEFAULT_USERS is not true");
        expect(readiness.json().checks.find((check) => check.name === "production-default-access").detail).toContain("demo@layerpilot.test");
      });
    });
  });

  it("passes production readiness when deployment gates are satisfied", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_WORKER_TELEMETRY: "false",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "false"
    }, async () => {
      await withApp(async ({ app }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(200);
        expect(readiness.json()).toMatchObject({ ok: true });
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-env-required", ok: true }),
          expect.objectContaining({ name: "production-secrets", ok: true }),
          expect.objectContaining({ name: "production-default-access", ok: true }),
          expect.objectContaining({ name: "production-public-signup", ok: true, enabled: false })
        ]));
      });
    });
  });

  it("restricts production CORS to configured trusted browser origins", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_WORKER_TELEMETRY: "false",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "false",
      LAYERPILOT_PUBLIC_URL: "https://farm.example.com/app",
      LAYERPILOT_CORS_ORIGINS: "https://quotes.example.com, https://ops.example.com/path"
    }, async () => {
      await withApp(async ({ app }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(200);
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-cors-origins", ok: true })
        ]));

        const appOrigin = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://farm.example.com" } });
        expect(appOrigin.headers["access-control-allow-origin"]).toBe("https://farm.example.com");

        const portalOrigin = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://quotes.example.com" } });
        expect(portalOrigin.headers["access-control-allow-origin"]).toBe("https://quotes.example.com");

        const normalizedOrigin = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://ops.example.com" } });
        expect(normalizedOrigin.headers["access-control-allow-origin"]).toBe("https://ops.example.com");

        const blockedOrigin = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://evil.example.com" } });
        expect(blockedOrigin.statusCode).toBe(200);
        expect(blockedOrigin.headers["access-control-allow-origin"]).toBeUndefined();
      });
    });
  });

  it("fails production readiness when configured CORS origins are invalid", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_WORKER_TELEMETRY: "false",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "false",
      LAYERPILOT_PUBLIC_URL: "not-a-url",
      LAYERPILOT_CORS_ORIGINS: "https://quotes.example.com, *, ftp://legacy.example.com"
    }, async () => {
      await withApp(async ({ app }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(503);
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-cors-origins", ok: false })
        ]));
        const detail = readiness.json().checks.find((check) => check.name === "production-cors-origins").detail;
        expect(detail).toContain("LAYERPILOT_PUBLIC_URL: not-a-url is not a valid http(s) URL");
        expect(detail).toContain("wildcard origins are not allowed in production");
        expect(detail).toContain("ftp://legacy.example.com");
      });
    });
  });

  it("blocks public signup in production unless explicitly enabled", async () => {
    const productionEnv = {
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_WORKER_TELEMETRY: "false",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "false",
      LAYERPILOT_ENABLE_PUBLIC_SIGNUP: ""
    };
    await withEnv(productionEnv, async () => {
      await withApp(async ({ app, db }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(200);
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-public-signup", ok: true, enabled: false })
        ]));

        const blocked = await app.inject({
          method: "POST",
          url: "/api/auth/signup",
          payload: {
            name: "Customer Owner",
            email: "customer@example.com",
            password: "customer-owner-password",
            workspace: "Customer Farm"
          }
        });
        expect(blocked.statusCode).toBe(403);
        expect(blocked.json()).toMatchObject({ error: "Public signup is disabled in production" });
        expect(db.data.users.some((user) => user.email === "customer@example.com")).toBe(false);
      });
    });

    await withEnv({ ...productionEnv, LAYERPILOT_ENABLE_PUBLIC_SIGNUP: "true" }, async () => {
      await withApp(async ({ app, db }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(200);
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-public-signup", ok: true, enabled: true })
        ]));

        const created = await app.inject({
          method: "POST",
          url: "/api/auth/signup",
          payload: {
            name: "Customer Owner",
            email: "customer@example.com",
            password: "customer-owner-password",
            workspace: "Customer Farm"
          }
        });
        expect(created.statusCode).toBe(201);
        expect(created.json().user).toMatchObject({ email: "customer@example.com", role: "Owner" });
        expect(db.data.users.some((user) => user.email === "customer@example.com" && user.role === "Owner")).toBe(true);
      });
    });
  });

  it("fails production readiness when API key IP allowlist rules are invalid", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_WORKER_TELEMETRY: "false",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "false"
    }, async () => {
      await withApp(async ({ app, db }) => {
        db.data.workspaceSettings.restrictApiByIp = true;
        db.data.workspaceSettings.allowedApiIps = ["203.0.113.0/24", "not-an-ip", "10.0.0.1/99"];
        db.data.workspaces[0].settings.restrictApiByIp = true;
        db.data.workspaces[0].settings.allowedApiIps = db.data.workspaceSettings.allowedApiIps;
        await db.write();

        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(503);
        expect(readiness.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-api-ip-allowlist", ok: false })
        ]));
        const detail = readiness.json().checks.find((check) => check.name === "production-api-ip-allowlist").detail;
        expect(detail).toContain("not-an-ip");
        expect(detail).toContain("10.0.0.1/99");
      });
    });
  });

  it("fails production readiness when enabled worker jobs have no fresh heartbeat", async () => {
    const productionEnv = {
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_WORKER_TELEMETRY: "true",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "true",
      LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS: "1000",
      LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS: "1000"
    };
    await withEnv(productionEnv, async () => {
      await withApp(async ({ app, db }) => {
        const missing = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(missing.statusCode).toBe(503);
        expect(missing.json().checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "worker", ok: false })
        ]));
        expect(missing.json().checks.find((check) => check.name === "worker").detail).toContain("no worker heartbeat");

        db.data.dataMeta.worker = {
          id: "stale-worker",
          lastRunAt: new Date(Date.now() - 120_000).toISOString(),
          telemetryEnabled: true,
          bridgePollingEnabled: true,
          telemetryIntervalMs: 1000,
          bridgePollingIntervalMs: 1000
        };
        await db.write();
        const stale = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(stale.statusCode).toBe(503);
        expect(stale.json().checks.find((check) => check.name === "worker")).toMatchObject({ ok: false, id: "stale-worker" });
        expect(stale.json().checks.find((check) => check.name === "worker").detail).toContain("stale");

        db.data.dataMeta.worker.lastRunAt = new Date().toISOString();
        await db.write();
        const fresh = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(fresh.statusCode).toBe(200);
        expect(fresh.json().checks.find((check) => check.name === "worker")).toMatchObject({ ok: true, id: "stale-worker" });
      });
    });
  });

  it("fails production readiness for incomplete optional dependency configuration", async () => {
    const productionEnv = {
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true",
      LAYERPILOT_OBJECT_STORAGE_PROVIDER: "s3",
      LAYERPILOT_S3_BUCKET: "layerpilot-production",
      LAYERPILOT_S3_REGION: "",
      LAYERPILOT_S3_ACCESS_KEY_ID: "s3-access-key",
      LAYERPILOT_S3_SECRET_ACCESS_KEY: "",
      LAYERPILOT_STRIPE_SECRET_KEY: "sk_test_configured",
      LAYERPILOT_STRIPE_WEBHOOK_SECRET: "",
      LAYERPILOT_STRIPE_PRICE_STUDIO: "price_studio",
      LAYERPILOT_STRIPE_PRICE_FARM: "",
      LAYERPILOT_STRIPE_PRICE_ENTERPRISE: "price_enterprise",
      LAYERPILOT_MQTT_URL: "http://broker.example.com",
      LAYERPILOT_MQTT_QOS: "9",
      LAYERPILOT_MQTT_RETAIN: "maybe"
    };
    await withEnv(productionEnv, async () => {
      await withApp(async ({ app }) => {
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.statusCode).toBe(503);
        const checks = readiness.json().checks;
        expect(checks).toEqual(expect.arrayContaining([
          expect.objectContaining({ name: "production-dependencies", ok: false })
        ]));
        const detail = checks.find((check) => check.name === "production-dependencies").detail;
        expect(detail).toContain("Missing LAYERPILOT_S3_REGION");
        expect(detail).toContain("Missing LAYERPILOT_S3_SECRET_ACCESS_KEY");
        expect(detail).toContain("Missing LAYERPILOT_STRIPE_WEBHOOK_SECRET");
        expect(detail).toContain("Missing LAYERPILOT_STRIPE_PRICE_FARM");
        expect(detail).toContain("LAYERPILOT_MQTT_URL must start with mqtt:// or mqtts://");
        expect(detail).toContain("LAYERPILOT_MQTT_QOS must be 0, 1, or 2");
        expect(detail).toContain("LAYERPILOT_MQTT_RETAIN must be true or false");
      }, { objectStorageAdapter: createFakeS3Storage() });
    });
  });

  it("replays idempotent mutating requests and rejects key reuse with a different body", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app);
      const payload = {
        source: "Manual",
        customer: "Retry Safe Customer",
        items: ["PLA spacer"],
        due: "Friday 12:00",
        value: 42
      };
      const headers = { ...auth(token), "idempotency-key": "order-create-retry-001" };

      const first = await app.inject({ method: "POST", url: "/api/orders", headers, payload });
      expect(first.statusCode).toBe(201);
      const firstOrder = first.json();

      const replay = await app.inject({ method: "POST", url: "/api/orders", headers, payload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(firstOrder);
      expect(db.data.orders.filter((order) => order.customer === payload.customer)).toHaveLength(1);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers,
        payload: { ...payload, value: 99 }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });
      expect(db.data.dataMeta.idempotencyKeys).toHaveLength(1);
      expect(db.data.dataMeta.idempotencyKeys[0]).toMatchObject({
        key: "order-create-retry-001",
        method: "POST",
        path: "/api/orders",
        statusCode: 201,
        replayCount: 1
      });
    });
  });

  it("replays public quote intake retries without creating duplicate requests", async () => {
    await withApp(async ({ app, dbPath }) => {
      const payload = {
        customer: "Retry Intake Buyer",
        email: "retry-intake@example.com",
        company: "Retry Intake Studio",
        project: "PETG bracket run",
        material: "PETG",
        quantity: 8,
        due: "2026-08-04",
        budget: 480,
        notes: "Browser submit retry",
        fileName: "petg-bracket.3mf"
      };
      const headers = { "idempotency-key": "public-quote-intake-001" };

      const first = await app.inject({ method: "POST", url: "/api/public/quoteRequests", headers, payload });
      expect(first.statusCode).toBe(201);

      const replay = await app.inject({ method: "POST", url: "/api/public/quoteRequests", headers, payload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        headers,
        payload: { ...payload, quantity: 9 }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.filter((quote) => quote.email === payload.email)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "quote_request.created" && event.data?.quoteRequestId === first.json().quoteRequest.id)).toHaveLength(1);
      const ledgerRecord = persisted.dataMeta.idempotencyKeys.find((record) => record.key === "public-quote-intake-001");
      expect(ledgerRecord).toMatchObject({
        actorId: "public:quote-intake",
        method: "POST",
        path: "/api/public/quoteRequests",
        replayCount: 1,
        statusCode: 201
      });
      expect(ledgerRecord.responseBody).toContain(first.json().quoteRequest.accessToken);

      const token = await login(app);
      for (const url of ["/api/state", "/api/admin/export"]) {
        const sanitized = await app.inject({ method: "GET", url, headers: auth(token) });
        expect(sanitized.statusCode).toBe(200);
        expect(sanitized.body).not.toContain("idempotencyKeys");
        expect(sanitized.body).not.toContain("responseBody");
        expect(sanitized.body).not.toContain(first.json().quoteRequest.accessToken);
      }
    });
  });

  it("protects internal worker broadcast with a shared worker token", async () => {
    await withEnv({ LAYERPILOT_WORKER_TOKEN: "worker-secret" }, async () => {
      await withApp(async ({ app, db }) => {
        db.data.dataMeta.worker = { id: "qc-worker", lastRunAt: new Date().toISOString() };
        await db.write();
        const locked = await app.inject({ method: "POST", url: "/api/internal/worker-broadcast", payload: { reason: "worker.test" } });
        expect(locked.statusCode).toBe(401);

        const invalid = await app.inject({
          method: "POST",
          url: "/api/internal/worker-broadcast",
          headers: { "x-layerpilot-worker-token": "bad-token" },
          payload: { reason: "worker.test" }
        });
        expect(invalid.statusCode).toBe(401);

        const valid = await app.inject({
          method: "POST",
          url: "/api/internal/worker-broadcast",
          headers: { "x-layerpilot-worker-token": "worker-secret" },
          payload: { reason: "worker.test" }
        });
        expect(valid.statusCode).toBe(200);
        expect(valid.json()).toMatchObject({ ok: true, worker: { id: "qc-worker" } });

        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.json().checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "worker", ok: true })]));
      });
    });
  });

  it("requires ops tokens in headers in production", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum"
    }, async () => {
      await withApp(async ({ app, db }) => {
        db.data.dataMeta.worker = { id: "qc-worker", lastRunAt: new Date().toISOString() };
        await db.write();

        const queryMetrics = await app.inject({ method: "GET", url: "/api/metrics?metricsToken=metrics-token-32-characters-minimum" });
        expect(queryMetrics.statusCode).toBe(401);

        const headerMetrics = await app.inject({
          method: "GET",
          url: "/api/metrics",
          headers: { "x-layerpilot-metrics-token": "metrics-token-32-characters-minimum" }
        });
        expect(headerMetrics.statusCode).toBe(200);
        expect(headerMetrics.body).toContain("layerpilot_up 1");

        const queryWorker = await app.inject({
          method: "POST",
          url: "/api/internal/worker-broadcast?workerToken=worker-token-32-characters-minimum",
          payload: { reason: "worker.test" }
        });
        expect(queryWorker.statusCode).toBe(401);

        const headerWorker = await app.inject({
          method: "POST",
          url: "/api/internal/worker-broadcast",
          headers: { "x-layerpilot-worker-token": "worker-token-32-characters-minimum" },
          payload: { reason: "worker.test" }
        });
        expect(headerWorker.statusCode).toBe(200);
        expect(headerWorker.json()).toMatchObject({ ok: true, worker: { id: "qc-worker" } });
      });
    });
  });

  it("can persist the application document in SQLite", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "layerpilot-sqlite-"));
    const dbPath = path.join(dir, "layerpilot.sqlite");
    try {
      const db = await openDatabase(dbPath, { adapter: "sqlite" });
      expect(db.persistenceLabel).toBe("sqlite");
      db.data.workspaceSettings.organizationName = "SQLite QC Farm";
      db.data.events.unshift({ id: "sqlite-event", type: "sqlite.test", message: "SQLite persistence check", at: new Date().toISOString(), data: {} });
      await db.write();
      await db.close?.();

      const reopened = await openDatabase(dbPath, { adapter: "sqlite" });
      const app = await buildServer({ db: reopened });
      try {
        expect(reopened.data.workspaceSettings.organizationName).toBe("SQLite QC Farm");
        expect(reopened.data.events.some((event) => event.id === "sqlite-event")).toBe(true);
        const health = await app.inject({ method: "GET", url: "/api/health" });
        expect(health.statusCode).toBe(200);
        expect(health.json()).toMatchObject({ persistence: "sqlite" });
        const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
        expect(readiness.json().checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "database", ok: true, detail: "sqlite writable" })]));
      } finally {
        await app.close();
        await reopened.close?.();
      }
    } finally {
      await removeDirWithRetry(dir);
    }
  });

  it("migrates legacy databases with metadata and pre-migration backups", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "layerpilot-migration-"));
    const dbPath = path.join(dir, "db.json");
    await writeFile(dbPath, JSON.stringify({
      printers: [{ name: "Legacy Printer", status: "idle", compatibleMaterials: ["PLA"], buildVolume: [220, 220, 220] }],
      files: [],
      queue: [],
      users: [{ email: "legacy@example.com", role: "Admin" }],
      events: []
    }, null, 2));
    try {
      const db = await openDatabase(dbPath);
      expect(db.data.dataMeta).toMatchObject({ schemaVersion: 4 });
      expect(db.data.dataMeta.migrations.map((item) => item.version)).toEqual([1, 2, 3, 4]);
      expect(db.data.printers[0].id).toBeTruthy();
      expect(db.data.users.find((user) => user.email === "legacy@example.com").passwordHash).toMatch(/^scrypt\$/);
      expect(db.data.events.some((event) => event.type === "system.migrated")).toBe(true);
      const files = await readdir(dir);
      expect(files.some((file) => file.includes(".pre-migration-0-to-4-") && file.endsWith(".bak.json"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports admin integrity checks and readiness failures for broken references", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app);
      const clean = await app.inject({ method: "GET", url: "/api/admin/integrity", headers: auth(token) });
      expect(clean.statusCode).toBe(200);
      expect(clean.json()).toMatchObject({ ok: true, schemaVersion: 4 });
      expect(clean.json().counts.printers).toBeGreaterThan(0);

      db.data.queue.push({
        id: "broken-job",
        fileId: "missing-file",
        file: "missing.gcode",
        printerId: "missing-printer",
        printer: "Missing",
        status: "queued",
        stage: "needs scheduling",
        priority: "Normal",
        material: "PLA",
        due: "Today 17:00",
        dimensions: [10, 10, 10]
      });
      const broken = await app.inject({ method: "GET", url: "/api/admin/integrity", headers: auth(token) });
      expect(broken.statusCode).toBe(200);
      expect(broken.json().ok).toBe(false);
      expect(broken.json().errors.map((error) => error.code)).toEqual(expect.arrayContaining(["queue.printer_missing"]));
      expect(broken.json().warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["queue.file_missing"]));

      const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
      expect(readiness.statusCode).toBe(503);
      expect(readiness.json().checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "data-integrity", ok: false })]));
    });
  });

  it("reports storage payload coverage during admin integrity checks", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app);
      const sample = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: auth(token),
        payload: { name: "Integrity Coverage Bracket", material: "PETG", folder: "Backups" }
      });
      expect(sample.statusCode).toBe(201);
      const sampleFile = sample.json().file;
      await access(sampleFile.storagePath);
      await rm(sampleFile.storagePath, { force: true });

      const checked = await app.inject({ method: "GET", url: "/api/admin/integrity?checkStorage=true", headers: auth(token) });
      expect(checked.statusCode).toBe(200);
      expect(checked.json().storage).toMatchObject({
        checked: true,
        complete: false,
        expected: expect.any(Number),
        present: expect.any(Number),
        missing: expect.arrayContaining([expect.objectContaining({ fileId: sampleFile.id, name: sampleFile.name })])
      });
      expect(checked.json().storage.expected).toBeGreaterThan(checked.json().storage.present);
      expect(checked.json().warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["file.storage_missing"]));
      const auditEvent = db.data.events.find((event) => event.type === "admin.integrity_checked");
      expect(auditEvent?.data).toMatchObject({
        checkStorage: true,
        storageComplete: false,
        storageExpected: checked.json().storage.expected,
        storagePresent: checked.json().storage.present,
        storageMissingFiles: checked.json().storage.missing.length
      });
    });
  });

  it("sets production security headers and rate limits sensitive auth routes", async () => {
    await withApp(async ({ app }) => {
      const health = await app.inject({ method: "GET", url: "/api/health" });
      expect(health.statusCode).toBe(200);
      expect(health.headers["content-security-policy"]).toContain("default-src 'self'");
      expect(health.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
      expect(health.headers["x-content-type-options"]).toBe("nosniff");
      expect(health.headers["x-frame-options"]).toBe("DENY");

      const payload = { email: "demo@layerpilot.test", password: "wrong-password" };
      const first = await app.inject({ method: "POST", url: "/api/auth/login", payload });
      const second = await app.inject({ method: "POST", url: "/api/auth/login", payload });
      const limited = await app.inject({ method: "POST", url: "/api/auth/login", payload });
      expect(first.statusCode).toBe(401);
      expect(second.statusCode).toBe(401);
      expect(limited.statusCode).toBe(429);
      expect(limited.headers["retry-after"]).toBeDefined();
    }, { authRateLimit: { max: 2, timeWindow: "1 minute", groupId: "auth-qc" } });
  });

  it("authenticates users and supports logout", async () => {
    await withApp(async ({ app, db }) => {
      const bad = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "wrong-password" } });
      expect(bad.statusCode).toBe(401);
      const failedLoginEvent = db.data.events.find((event) => event.type === "auth.login_failed" && event.data?.email === "demo@layerpilot.test");
      expect(failedLoginEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          userId: "u0",
          email: "demo@layerpilot.test",
          reason: "invalid_password"
        }
      });
      expect(JSON.stringify(failedLoginEvent)).not.toContain("wrong-password");

      const token = await login(app, "owner@layerpilot.test", "layerpilot");
      const session = db.data.sessions.find((item) => item.userId === "u1");
      expect(session).toBeTruthy();
      expect(session.token).toBeUndefined();
      expect(session.tokenHash).toMatch(/^scrypt\$/);
      expect(session.expiresAt).toBeTruthy();
      expect(session.idleExpiresAt).toBeTruthy();

      const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(token) });
      expect(me.statusCode).toBe(200);
      expect(me.json().user).toMatchObject({ email: "owner@layerpilot.test", role: "Owner" });
      expect(me.json().user.passwordHash).toBeUndefined();

      const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: auth(token) });
      expect(logout.statusCode).toBe(200);

      const locked = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(locked.statusCode).toBe(401);

      const loginEvent = db.data.events.find((event) => event.type === "auth.login" && event.data?.userId === "u1");
      expect(loginEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          userId: "u1",
          actorId: "u1",
          actorEmail: "owner@layerpilot.test",
          actorRole: "Owner",
          actorType: "user",
          sessionId: session.id
        }
      });
      const logoutEvent = db.data.events.find((event) => event.type === "auth.logout" && event.data?.userId === "u1");
      expect(logoutEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          userId: "u1",
          actorId: "u1",
          actorEmail: "owner@layerpilot.test",
          actorRole: "Owner",
          actorType: "user",
          sessionId: session.id,
          revokedSessions: 1
        }
      });
      expect(JSON.stringify([loginEvent, logoutEvent])).not.toContain(token);
    });
  });

  it("locks known accounts after repeated password failures and clears lock on password reset", async () => {
    await withEnv({ LAYERPILOT_AUTH_LOCK_THRESHOLD: "3", LAYERPILOT_AUTH_LOCK_MINUTES: "10" }, async () => {
      await withApp(async ({ app, db }) => {
        const payload = { email: "owner@layerpilot.test", password: "wrong-password" };
        const first = await app.inject({ method: "POST", url: "/api/auth/login", payload });
        const second = await app.inject({ method: "POST", url: "/api/auth/login", payload });
        const locked = await app.inject({ method: "POST", url: "/api/auth/login", payload });
        expect(first.statusCode).toBe(401);
        expect(second.statusCode).toBe(401);
        expect(locked.statusCode).toBe(423);
        expect(locked.json()).toMatchObject({ error: "Account temporarily locked", reason: "invalid_password", retryAfterSeconds: expect.any(Number) });

        const correctDuringLock = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner@layerpilot.test", password: "layerpilot" } });
        expect(correctDuringLock.statusCode).toBe(423);

        const user = db.data.users.find((item) => item.email === "owner@layerpilot.test");
        expect(user).toMatchObject({ authFailedAttempts: 3, authLockedReason: "invalid_password" });
        expect(Date.parse(user.authLockedUntil)).toBeGreaterThan(Date.now());

        const lockEvent = db.data.events.find((event) => event.type === "auth.account_locked" && event.data?.userId === "u1");
        expect(lockEvent).toMatchObject({
          workspaceId: "ws-default",
          data: {
            workspaceId: "ws-default",
            userId: "u1",
            email: "owner@layerpilot.test",
            reason: "invalid_password",
            failedAttempts: 3,
            lockMinutes: 10
          }
        });
        const lockedAttemptEvent = db.data.events.find((event) => event.type === "auth.login_locked" && event.data?.userId === "u1");
        expect(lockedAttemptEvent).toMatchObject({
          data: {
            email: "owner@layerpilot.test",
            reason: "account_locked",
            lockedReason: "invalid_password"
          }
        });
        expect(JSON.stringify([lockEvent, lockedAttemptEvent])).not.toContain("wrong-password");

        const demoToken = await login(app);
        const reset = await app.inject({
          method: "POST",
          url: "/api/users/u1/reset-password",
          headers: auth(demoToken),
          payload: { password: "reset-owner-password", requireChange: false }
        });
        expect(reset.statusCode).toBe(200);
        expect(db.data.users.find((item) => item.id === "u1")).toMatchObject({ authFailedAttempts: 0, authLockedUntil: "" });

        const afterReset = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner@layerpilot.test", password: "reset-owner-password" } });
        expect(afterReset.statusCode).toBe(200);
      });
    });
  });

  it("expires stale user sessions and migrates legacy plaintext session tokens on use", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app, "owner@layerpilot.test", "layerpilot");
      const session = db.data.sessions.find((item) => item.userId === "u1");
      session.lastSeenAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      session.idleExpiresAt = new Date(Date.now() - 60_000).toISOString();

      const expired = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(expired.statusCode).toBe(401);
      expect(db.data.sessions.some((item) => item.id === session.id)).toBe(false);

      const legacyToken = "legacy-session-token";
      db.data.sessions.push({
        id: "legacy-session",
        token: legacyToken,
        userId: "u1",
        workspaceId: "ws-default",
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });
      const migrated = await app.inject({ method: "GET", url: "/api/state", headers: auth(legacyToken) });
      expect(migrated.statusCode).toBe(200);
      const migratedSession = db.data.sessions.find((item) => item.id === "legacy-session");
      expect(migratedSession.token).toBeUndefined();
      expect(migratedSession.tokenHash).toMatch(/^scrypt\$/);
      expect(migratedSession.expiresAt).toBeTruthy();
      expect(migratedSession.idleExpiresAt).toBeTruthy();
    });
  });

  it("supports password changes and admin password resets", async () => {
    await withApp(async ({ app, dbPath }) => {
      const ownerToken = await login(app);
      const invited = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: auth(ownerToken),
        payload: { name: "Password QC", email: "password.qc@layerpilot.test", role: "Operator", location: "QC Bench" }
      });
      expect(invited.statusCode).toBe(201);
      const operatorPassword = invited.json().temporaryPassword;
      const operatorToken = await login(app, "password.qc@layerpilot.test", operatorPassword);

      const wrongCurrent = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: auth(operatorToken),
        payload: { currentPassword: "wrong-password", newPassword: "operator-secret-1" }
      });
      expect(wrongCurrent.statusCode).toBe(401);

      const changed = await app.inject({
        method: "POST",
        url: "/api/auth/change-password",
        headers: auth(operatorToken),
        payload: { currentPassword: operatorPassword, newPassword: "operator-secret-1" }
      });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().user).toMatchObject({ email: "password.qc@layerpilot.test", passwordResetRequired: false });

      const oldPassword = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "password.qc@layerpilot.test", password: operatorPassword } });
      expect(oldPassword.statusCode).toBe(401);
      const newPasswordToken = await login(app, "password.qc@layerpilot.test", "operator-secret-1");

      const reset = await app.inject({
        method: "POST",
        url: `/api/users/${invited.json().user.id}/reset-password`,
        headers: auth(ownerToken),
        payload: {}
      });
      expect(reset.statusCode).toBe(200);
      expect(reset.json().temporaryPassword).toBeTruthy();
      expect(reset.json().user).toMatchObject({ email: "password.qc@layerpilot.test", passwordResetRequired: true });

      const staleSession = await app.inject({ method: "GET", url: "/api/state", headers: auth(newPasswordToken) });
      expect(staleSession.statusCode).toBe(401);
      await login(app, "password.qc@layerpilot.test", reset.json().temporaryPassword);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const passwordEvent = persisted.events.find((event) => event.type === "auth.password_changed" && event.data?.userId === invited.json().user.id);
      expect(passwordEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          userId: invited.json().user.id,
          actorId: invited.json().user.id,
          actorEmail: "password.qc@layerpilot.test",
          actorRole: "Operator",
          actorType: "user",
          sessionsRevoked: 0
        }
      });
      expect(persisted.events.some((event) => event.type === "user.password_reset")).toBe(true);
      expect(persisted.users.find((user) => user.email === "password.qc@layerpilot.test")).toMatchObject({ passwordResetRequired: true });
      expect(JSON.stringify(passwordEvent)).not.toContain("operator-secret-1");
      expect(JSON.stringify(passwordEvent)).not.toContain(operatorPassword);
    });
  });

  it("enables TOTP two-factor auth, challenges login, and consumes recovery codes", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const token = await login(app);
      const setup = await app.inject({ method: "POST", url: "/api/auth/2fa/setup", headers: auth(token) });
      expect(setup.statusCode).toBe(200);
      expect(setup.json().secret).toMatch(/^[A-Z2-7]+$/);
      expect(setup.json().otpauthUrl).toContain("otpauth://totp/");

      const wrongEnable = await app.inject({
        method: "POST",
        url: "/api/auth/2fa/enable",
        headers: auth(token),
        payload: { secret: setup.json().secret, code: "000000" }
      });
      expect(wrongEnable.statusCode).toBe(401);

      const enable = await app.inject({
        method: "POST",
        url: "/api/auth/2fa/enable",
        headers: auth(token),
        payload: { secret: setup.json().secret, code: generateTotpCode(setup.json().secret) }
      });
      expect(enable.statusCode).toBe(200);
      expect(enable.json().user).toMatchObject({ email: "demo@layerpilot.test", twoFactorEnabled: true });
      expect(enable.json().user.twoFactorSecret).toBeUndefined();
      expect(enable.json().recoveryCodes).toHaveLength(8);

      const challenged = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot" } });
      expect(challenged.statusCode).toBe(409);
      expect(challenged.json()).toMatchObject({ requiresTwoFactor: true });

      const badCode = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: "123123" } });
      expect(badCode.statusCode).toBe(401);
      const failedTwoFactorEvent = db.data.events.find((event) => event.type === "auth.2fa_failed" && event.data?.userId === "u0");
      expect(failedTwoFactorEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          userId: "u0",
          email: "demo@layerpilot.test",
          reason: "invalid_two_factor"
        }
      });
      expect(JSON.stringify(failedTwoFactorEvent)).not.toContain("123123");

      const totpLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: generateTotpCode(setup.json().secret) } });
      expect(totpLogin.statusCode).toBe(200);

      const recoveryCode = enable.json().recoveryCodes[0];
      const recoveryLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: recoveryCode } });
      expect(recoveryLogin.statusCode).toBe(200);
      const reusedRecovery = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: recoveryCode } });
      expect(reusedRecovery.statusCode).toBe(401);

      const persistedAfterRecovery = JSON.parse(await readFile(dbPath, "utf8"));
      const persistedUser = persistedAfterRecovery.users.find((user) => user.email === "demo@layerpilot.test");
      expect(persistedUser.twoFactorRecoveryCodeHashes).toHaveLength(7);
      expect(persistedUser.twoFactorSecret).toBeTruthy();

      const disable = await app.inject({
        method: "POST",
        url: "/api/auth/2fa/disable",
        headers: auth(totpLogin.json().token),
        payload: { password: "layerpilot", code: generateTotpCode(setup.json().secret) }
      });
      expect(disable.statusCode).toBe(200);
      expect(disable.json().user).toMatchObject({ email: "demo@layerpilot.test", twoFactorEnabled: false });
      expect(disable.json().user.twoFactorSecret).toBeUndefined();

      const plainLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot" } });
      expect(plainLogin.statusCode).toBe(200);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const setupEvent = persisted.events.find((event) => event.type === "auth.2fa_setup_started");
      const enabledEvent = persisted.events.find((event) => event.type === "auth.2fa_enabled");
      const verifiedEvent = persisted.events.find((event) => event.type === "auth.2fa_verified" && event.data?.method === "totp");
      const disabledEvent = persisted.events.find((event) => event.type === "auth.2fa_disabled");
      for (const event of [setupEvent, enabledEvent, verifiedEvent, disabledEvent]) {
        expect(event).toMatchObject({
          workspaceId: "ws-default",
          data: {
            workspaceId: "ws-default",
            userId: "u0",
            actorId: "u0",
            actorEmail: "demo@layerpilot.test",
            actorRole: "Admin",
            actorType: "user"
          }
        });
      }
      expect(verifiedEvent.data).toMatchObject({ method: "totp" });
      const serializedEvents = JSON.stringify([setupEvent, enabledEvent, verifiedEvent, disabledEvent]);
      expect(serializedEvents).not.toContain(setup.json().secret);
      expect(serializedEvents).not.toContain(recoveryCode);
    });
  });

  it("locks known accounts after repeated two-factor failures and clears lock on successful 2FA", async () => {
    await withEnv({ LAYERPILOT_AUTH_LOCK_THRESHOLD: "2", LAYERPILOT_AUTH_LOCK_MINUTES: "10" }, async () => {
      await withApp(async ({ app, db }) => {
        const token = await login(app);
        const setup = await app.inject({ method: "POST", url: "/api/auth/2fa/setup", headers: auth(token) });
        expect(setup.statusCode).toBe(200);
        const enable = await app.inject({
          method: "POST",
          url: "/api/auth/2fa/enable",
          headers: auth(token),
          payload: { secret: setup.json().secret, code: generateTotpCode(setup.json().secret) }
        });
        expect(enable.statusCode).toBe(200);

        const badPayload = { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: "111111" };
        const first = await app.inject({ method: "POST", url: "/api/auth/login", payload: badPayload });
        const locked = await app.inject({ method: "POST", url: "/api/auth/login", payload: badPayload });
        expect(first.statusCode).toBe(401);
        expect(locked.statusCode).toBe(423);
        expect(locked.json()).toMatchObject({ error: "Account temporarily locked", reason: "invalid_two_factor" });

        const correctDuringLock = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: generateTotpCode(setup.json().secret) }
        });
        expect(correctDuringLock.statusCode).toBe(423);

        const user = db.data.users.find((item) => item.email === "demo@layerpilot.test");
        expect(user).toMatchObject({ authFailedAttempts: 2, authLockedReason: "invalid_two_factor" });
        const lockEvent = db.data.events.find((event) => event.type === "auth.account_locked" && event.data?.userId === "u0");
        expect(lockEvent).toMatchObject({ data: { reason: "invalid_two_factor", failedAttempts: 2 } });
        expect(JSON.stringify(lockEvent)).not.toContain("111111");

        user.authLockedUntil = new Date(Date.now() - 60_000).toISOString();
        await db.write();
        const success = await app.inject({
          method: "POST",
          url: "/api/auth/login",
          payload: { email: "demo@layerpilot.test", password: "layerpilot", twoFactorCode: generateTotpCode(setup.json().secret) }
        });
        expect(success.statusCode).toBe(200);
        expect(db.data.users.find((item) => item.id === "u0")).toMatchObject({ authFailedAttempts: 0, authLockedUntil: "" });
      });
    });
  });

  it("requires production Owner and Admin sessions to enroll 2FA before protected API access", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true"
    }, async () => {
      await withApp(async ({ app }) => {
        const loginResponse = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner@example.com", password: "production-owner-password" } });
        expect(loginResponse.statusCode).toBe(200);
        expect(loginResponse.json().user).toMatchObject({ email: "owner@example.com", role: "Owner", twoFactorEnabled: false });
        const token = loginResponse.json().token;

        const blockedState = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
        expect(blockedState.statusCode).toBe(403);
        expect(blockedState.json()).toMatchObject({ error: "Two-factor enrollment required", requiresTwoFactorEnrollment: true });
        const blockedStream = await app.inject({ method: "GET", url: "/api/events/stream", headers: auth(token) });
        expect(blockedStream.statusCode).toBe(403);
        expect(blockedStream.json()).toMatchObject({ requiresTwoFactorEnrollment: true });

        const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(token) });
        expect(me.statusCode).toBe(200);
        expect(me.json().user).toMatchObject({ email: "owner@example.com", twoFactorEnabled: false });

        const setup = await app.inject({ method: "POST", url: "/api/auth/2fa/setup", headers: auth(token) });
        expect(setup.statusCode).toBe(200);
        const enable = await app.inject({
          method: "POST",
          url: "/api/auth/2fa/enable",
          headers: auth(token),
          payload: { secret: setup.json().secret, code: generateTotpCode(setup.json().secret) }
        });
        expect(enable.statusCode).toBe(200);

        const allowedState = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
        expect(allowedState.statusCode).toBe(200);
      });
    });
  });

  it("prevents production Owner and Admin users from disabling required 2FA", async () => {
    await withEnv({
      NODE_ENV: "production",
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-owner-password",
      LAYERPILOT_WORKER_TOKEN: "worker-token-32-characters-minimum",
      LAYERPILOT_METRICS_TOKEN: "metrics-token-32-characters-minimum",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true"
    }, async () => {
      await withApp(async ({ app }) => {
        const loginResponse = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner@example.com", password: "production-owner-password" } });
        expect(loginResponse.statusCode).toBe(200);
        const token = loginResponse.json().token;

        const setup = await app.inject({ method: "POST", url: "/api/auth/2fa/setup", headers: auth(token) });
        expect(setup.statusCode).toBe(200);
        const enable = await app.inject({
          method: "POST",
          url: "/api/auth/2fa/enable",
          headers: auth(token),
          payload: { secret: setup.json().secret, code: generateTotpCode(setup.json().secret) }
        });
        expect(enable.statusCode).toBe(200);

        const denied = await app.inject({
          method: "POST",
          url: "/api/auth/2fa/disable",
          headers: auth(token),
          payload: { password: "production-owner-password", code: generateTotpCode(setup.json().secret) }
        });
        expect(denied.statusCode).toBe(409);
        expect(denied.json()).toMatchObject({
          error: "Two-factor authentication is required for production Owner/Admin accounts",
          requiresTwoFactorEnrollment: true
        });

        const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(token) });
        expect(me.statusCode).toBe(200);
        expect(me.json().user).toMatchObject({ email: "owner@example.com", twoFactorEnabled: true });
      });
    });
  });

  it("bootstraps a production owner from environment and can disable default users", async () => {
    await withEnv({
      LAYERPILOT_ADMIN_EMAIL: "owner@example.com",
      LAYERPILOT_ADMIN_PASSWORD: "production-secret",
      LAYERPILOT_ADMIN_NAME: "Production Owner",
      LAYERPILOT_WORKSPACE_NAME: "Production Farm",
      LAYERPILOT_DISABLE_DEFAULT_USERS: "true",
      LAYERPILOT_DISABLE_DEMO_LOGIN: "true"
    }, async () => {
      await withApp(async ({ app, db }) => {
        expect(db.data.workspaceSettings.organizationName).toBe("Production Farm");
        expect(db.data.users).toHaveLength(1);
        expect(db.data.users[0]).toMatchObject({ email: "owner@example.com", role: "Owner", name: "Production Owner" });

        const token = await login(app, "owner@example.com", "production-secret");
        const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(token) });
        expect(me.statusCode).toBe(200);
        expect(me.json().user).toMatchObject({ email: "owner@example.com", role: "Owner" });

        const defaultOwner = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "owner@layerpilot.test", password: "layerpilot" } });
        const demo = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot" } });
        expect(defaultOwner.statusCode).toBe(401);
        expect(demo.statusCode).toBe(401);
      });
    });
  });

  it("creates isolated workspaces for signup tenants", async () => {
    await withApp(async ({ app, dbPath }) => {
      const signup = await app.inject({
        method: "POST",
        url: "/api/auth/signup",
        payload: {
          email: "tenant.owner@layerpilot.test",
          password: "tenant-secret-1",
          name: "Tenant Owner",
          workspace: "Tenant Print Farm"
        }
      });
      expect(signup.statusCode).toBe(201);
      expect(signup.json().user).toMatchObject({ email: "tenant.owner@layerpilot.test", role: "Owner", workspaceId: expect.any(String) });
      const tenantToken = signup.json().token;
      const tenantWorkspaceId = signup.json().user.workspaceId;

      const tenantState = await app.inject({ method: "GET", url: "/api/state", headers: auth(tenantToken) });
      expect(tenantState.statusCode).toBe(200);
      expect(tenantState.json().workspaceSettings).toMatchObject({ organizationName: "Tenant Print Farm", workspaceId: tenantWorkspaceId });
      expect(tenantState.json().printers).toHaveLength(0);
      expect(tenantState.json().files).toHaveLength(0);
      expect(tenantState.json().users.map((user) => user.email)).toEqual(["tenant.owner@layerpilot.test"]);

      const invited = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: auth(tenantToken),
        payload: { name: "Tenant Scheduler", email: "tenant.scheduler@layerpilot.test", role: "Admin", location: "Remote" }
      });
      expect(invited.statusCode).toBe(201);
      expect(invited.json().user).toMatchObject({ email: "tenant.scheduler@layerpilot.test", workspaceId: tenantWorkspaceId });

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(tenantToken),
        payload: { name: "Tenant automation", scopes: ["queue:write"], enabled: true }
      });
      expect(apiKey.statusCode).toBe(201);
      expect(apiKey.json().apiKey).toMatchObject({ workspaceId: tenantWorkspaceId });

      const tenantCannotPatchDefaultJob = await app.inject({
        method: "PATCH",
        url: "/api/queue/q1/status",
        headers: auth(tenantToken),
        payload: { status: "failed" }
      });
      expect(tenantCannotPatchDefaultJob.statusCode).toBe(404);

      const tenantPrinter = await app.inject({
        method: "POST",
        url: "/api/printers",
        headers: auth(tenantToken),
        payload: {
          name: "Tenant CoreXY",
          model: "Voron 2.4",
          status: "idle",
          connection: "Manual",
          compatibleMaterials: ["PLA"],
          buildVolume: [300, 300, 300],
          filament: "PLA White",
          nozzle: 25,
          bed: 25,
          targetNozzle: 0,
          targetBed: 0
        }
      });
      expect(tenantPrinter.statusCode).toBe(201);
      expect(tenantPrinter.json()).toMatchObject({ name: "Tenant CoreXY", workspaceId: tenantWorkspaceId });

      const tenantOrder = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: auth(tenantToken),
        payload: { source: "Manual", customer: "Tenant Customer", items: ["TENANT-PART x1"], status: "received", due: "Tomorrow 12:00", value: 120 }
      });
      expect(tenantOrder.statusCode).toBe(201);
      expect(tenantOrder.json()).toMatchObject({ customer: "Tenant Customer", workspaceId: tenantWorkspaceId });

      const tenantAudit = await app.inject({ method: "GET", url: "/api/audit?type=order.created&limit=5", headers: auth(tenantToken) });
      expect(tenantAudit.statusCode).toBe(200);
      expect(tenantAudit.json()).toMatchObject({ returned: 1 });
      expect(tenantAudit.json().events[0]).toMatchObject({
        workspaceId: tenantWorkspaceId,
        type: "order.created",
        data: {
          workspaceId: tenantWorkspaceId,
          actorEmail: "tenant.owner@layerpilot.test",
          actorRole: "Owner",
          orderId: tenantOrder.json().id
        }
      });

      const defaultToken = await login(app, "owner@layerpilot.test", "layerpilot");
      const defaultState = await app.inject({ method: "GET", url: "/api/state", headers: auth(defaultToken) });
      expect(defaultState.statusCode).toBe(200);
      expect(defaultState.json().workspaceSettings.workspaceId).not.toBe(tenantWorkspaceId);
      expect(defaultState.json().printers.length).toBeGreaterThan(0);
      expect(defaultState.json().printers.map((printer) => printer.id)).not.toContain(tenantPrinter.json().id);
      expect(defaultState.json().users.map((user) => user.email)).not.toContain("tenant.owner@layerpilot.test");

      const defaultCannotPatchTenantPrinter = await app.inject({
        method: "PATCH",
        url: `/api/printers/${tenantPrinter.json().id}/status`,
        headers: auth(defaultToken),
        payload: { status: "maintenance" }
      });
      expect(defaultCannotPatchTenantPrinter.statusCode).toBe(404);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaces.some((workspace) => workspace.id === tenantWorkspaceId && workspace.name === "Tenant Print Farm")).toBe(true);
      expect(persisted.users.find((user) => user.email === "tenant.scheduler@layerpilot.test")).toMatchObject({ workspaceId: tenantWorkspaceId });
      expect(persisted.apiKeys.find((key) => key.name === "Tenant automation")).toMatchObject({ workspaceId: tenantWorkspaceId });
      expect(persisted.events.find((event) => event.type === "order.created" && event.data?.orderId === tenantOrder.json().id)).toMatchObject({ workspaceId: tenantWorkspaceId, data: { actorEmail: "tenant.owner@layerpilot.test" } });
    });
  });

  it("creates scoped API keys and authorizes automation requests", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "QC automation key", scopes: ["queue:write"], enabled: true }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().secret).toMatch(/^lp_live_/);
      expect(created.json().apiKey).toMatchObject({ name: "QC automation key", scopes: ["queue:write"], enabled: true });
      expect(created.json().apiKey.secretHash).toBeUndefined();

      const listed = await app.inject({ method: "GET", url: "/api/apiKeys", headers: auth(token) });
      expect(listed.statusCode).toBe(200);
      const listedKey = listed.json().find((item) => item.id === created.json().apiKey.id);
      expect(listedKey.secretHash).toBeUndefined();
      expect(listedKey.secret).toBeUndefined();

      const queued = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(created.json().secret),
        payload: { fileId: "f1", file: "API key batch.gcode", material: "PLA", due: "Tomorrow 12:00", dimensions: [80, 80, 20], time: "1h 10m", cost: 20 }
      });
      expect(queued.statusCode).toBe(201);
      expect(queued.json().job).toMatchObject({ file: "API key batch.gcode", material: "PLA" });

      const denied = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(created.json().secret),
        payload: { material: "PLA", color: "#111111", brand: "QC", remaining: 500, weight: 1000, location: "Rack", dry: true }
      });
      expect(denied.statusCode).toBe(403);

      const restricted = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { restrictApiByIp: true, allowedApiIps: ["203.0.113.0/24"] }
      });
      expect(restricted.statusCode).toBe(200);
      expect(restricted.json()).toMatchObject({ restrictApiByIp: true, allowedApiIps: ["203.0.113.0/24"] });

      const deniedByIp = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(created.json().secret),
        payload: { fileId: "f1", file: "Blocked IP key.gcode", material: "PLA", due: "Tomorrow 12:00", dimensions: [80, 80, 20] }
      });
      expect(deniedByIp.statusCode).toBe(403);
      expect(deniedByIp.json()).toMatchObject({ error: "API key is not allowed from this IP" });

      await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { restrictApiByIp: true, allowedApiIps: ["127.0.0.0/8"] }
      });
      const allowedByCidr = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(created.json().secret),
        payload: { fileId: "f1", file: "Allowed IP key.gcode", material: "PLA", due: "Tomorrow 12:00", dimensions: [80, 80, 20] }
      });
      expect(allowedByCidr.statusCode).toBe(201);

      const queueRead = await app.inject({ method: "GET", url: "/api/queue", headers: auth(created.json().secret) });
      expect(queueRead.statusCode).toBe(200);
      expect(queueRead.json().some((job) => job.file === "Allowed IP key.gcode")).toBe(true);

      for (const url of ["/api/users", "/api/apiKeys", "/api/workspaceSettings", "/api/audit"]) {
        const scopedReadDenied = await app.inject({ method: "GET", url, headers: auth(created.json().secret) });
        expect(scopedReadDenied.statusCode).toBe(403);
        expect(scopedReadDenied.json()).toMatchObject({ error: "API key scope does not allow reading this resource" });
      }

      const disabled = await app.inject({ method: "PATCH", url: `/api/apiKeys/${created.json().apiKey.id}`, headers: auth(token), payload: { enabled: false } });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json()).toMatchObject({ enabled: false });

      const locked = await app.inject({ method: "GET", url: "/api/files", headers: auth(created.json().secret) });
      expect(locked.statusCode).toBe(401);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const persistedKey = persisted.apiKeys.find((item) => item.id === created.json().apiKey.id);
      expect(persistedKey.secretHash).toMatch(/^scrypt\$/);
      expect(persistedKey.lastUsedAt).toBeTruthy();
      expect(persisted.queue.some((item) => item.file === "API key batch.gcode")).toBe(true);
      expect(persisted.queue.some((item) => item.file === "Allowed IP key.gcode")).toBe(true);
      expect(persisted.queue.some((item) => item.file === "Blocked IP key.gcode")).toBe(false);
      expect(persisted.workspaceSettings).toMatchObject({ restrictApiByIp: true, allowedApiIps: ["127.0.0.0/8"] });
    });
  });

  it("rejects over-scoped API keys and blocks API-key credential chaining", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app);
      for (const scopes of [["*"], ["queue:write", "unknown:write"], ["apiKeys:write"]]) {
        const rejected = await app.inject({
          method: "POST",
          url: "/api/apiKeys",
          headers: auth(token),
          payload: { name: `Rejected ${scopes.join(",")}`, scopes, enabled: true }
        });
        expect(rejected.statusCode).toBe(400);
        expect(rejected.json()).toMatchObject({ error: "Invalid API key payload" });
      }

      const created = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Legacy chained key", scopes: ["queue:write"], enabled: true }
      });
      expect(created.statusCode).toBe(201);
      const secret = created.json().secret;
      const key = db.data.apiKeys.find((item) => item.id === created.json().apiKey.id);
      key.scopes = ["apiKeys:write"];
      await db.write();

      const chained = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(secret),
        payload: { name: "Chained key", scopes: ["queue:write"], enabled: true }
      });
      expect(chained.statusCode).toBe(403);
      expect(chained.json()).toMatchObject({ error: "API key management requires a user session" });
    });
  });

  it("records operator context for production scheduling, bridge, and file-version audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = auth(token);

      const queued = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers,
        payload: { fileId: "f2", file: "Audit actor fixture.3mf", material: "PETG", dimensions: [80, 60, 30], time: "1h 00m", cost: 20 }
      });
      expect(queued.statusCode).toBe(201);
      const jobId = queued.json().job.id;

      const scheduled = await app.inject({ method: "PATCH", url: `/api/queue/${jobId}/schedule`, headers, payload: { printerId: "p2", scheduledStart: "15:00" } });
      expect(scheduled.statusCode).toBe(200);

      const priority = await app.inject({ method: "PATCH", url: `/api/queue/${jobId}/priority`, headers, payload: { priority: "Rush" } });
      expect(priority.statusCode).toBe(200);

      const auto = await app.inject({ method: "POST", url: "/api/schedule/auto", headers, payload: { includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 600 } });
      expect(auto.statusCode).toBe(200);

      const bridge = await app.inject({
        method: "POST",
        url: "/api/bridges",
        headers,
        payload: { printerId: "p1", kind: "manual", name: "Audit Manual Bridge", baseUrl: "manual://audit", enabled: true }
      });
      expect([200, 201]).toContain(bridge.statusCode);

      const versioned = await app.inject({ method: "PATCH", url: "/api/files/f2/version", headers });
      expect(versioned.statusCode).toBe(200);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      for (const type of ["queue.created", "queue.scheduled", "queue.priority", "queue.auto_scheduled", "bridge.saved", "file.versioned"]) {
        const event = persisted.events.find((item) => item.type === type);
        expect(event, `missing ${type}`).toBeTruthy();
        expect(event).toMatchObject({
          workspaceId: "ws-default",
          data: {
            workspaceId: "ws-default",
            actorEmail: "demo@layerpilot.test",
            actorType: "user"
          }
        });
      }
    });
  });

  it("manages team users with invites, role updates, and owner protection", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const invited = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: auth(token),
        payload: { name: "QC Operator", email: "qc.operator@layerpilot.test", role: "Operator", location: "QC Lab" }
      });
      expect(invited.statusCode).toBe(201);
      expect(invited.json().temporaryPassword).toBeTruthy();
      expect(invited.json().user).toMatchObject({ email: "qc.operator@layerpilot.test", role: "Operator", location: "QC Lab", lastSeen: "Invite sent" });
      expect(invited.json().user.passwordHash).toBeUndefined();

      const duplicate = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: auth(token),
        payload: { name: "Duplicate", email: "qc.operator@layerpilot.test", role: "Viewer", location: "QC Lab" }
      });
      expect(duplicate.statusCode).toBe(409);

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/users/${invited.json().user.id}`,
        headers: auth(token),
        payload: { role: "Admin", location: "Studio South" }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ role: "Admin", location: "Studio South" });
      expect(updated.json().passwordHash).toBeUndefined();

      const invitedLogin = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "qc.operator@layerpilot.test", password: invited.json().temporaryPassword }
      });
      expect(invitedLogin.statusCode).toBe(200);

      const owner = (await app.inject({ method: "GET", url: "/api/users", headers: auth(token) })).json().find((user) => user.email === "owner@layerpilot.test");
      const demoteOwner = await app.inject({ method: "PATCH", url: `/api/users/${owner.id}`, headers: auth(token), payload: { role: "Admin" } });
      expect(demoteOwner.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const persistedUser = persisted.users.find((user) => user.email === "qc.operator@layerpilot.test");
      expect(persistedUser.passwordHash).toMatch(/^scrypt\$/);
      expect(persistedUser).toMatchObject({ role: "Admin", location: "Studio South" });
    });
  });

  it("replays idempotent admin account writes without rotating generated secrets", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);

      const apiKeyHeaders = { ...auth(token), "idempotency-key": "admin-api-key-create-retry-001" };
      const apiKeyPayload = { name: "Retry admin automation", scopes: ["queue:write"], enabled: true };
      const apiKey = await app.inject({ method: "POST", url: "/api/apiKeys", headers: apiKeyHeaders, payload: apiKeyPayload });
      expect(apiKey.statusCode).toBe(201);
      const apiKeyReplay = await app.inject({ method: "POST", url: "/api/apiKeys", headers: apiKeyHeaders, payload: apiKeyPayload });
      expect(apiKeyReplay.statusCode).toBe(201);
      expect(apiKeyReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(apiKeyReplay.json()).toEqual(apiKey.json());

      const apiKeyUpdateHeaders = { ...auth(token), "idempotency-key": "admin-api-key-update-retry-001" };
      const apiKeyUpdatePayload = { enabled: false, scopes: ["orders:write"] };
      const apiKeyUpdated = await app.inject({ method: "PATCH", url: `/api/apiKeys/${apiKey.json().apiKey.id}`, headers: apiKeyUpdateHeaders, payload: apiKeyUpdatePayload });
      expect(apiKeyUpdated.statusCode).toBe(200);
      const apiKeyUpdatedReplay = await app.inject({ method: "PATCH", url: `/api/apiKeys/${apiKey.json().apiKey.id}`, headers: apiKeyUpdateHeaders, payload: apiKeyUpdatePayload });
      expect(apiKeyUpdatedReplay.statusCode).toBe(200);
      expect(apiKeyUpdatedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(apiKeyUpdatedReplay.json()).toEqual(apiKeyUpdated.json());

      const inviteHeaders = { ...auth(token), "idempotency-key": "admin-user-invite-retry-001" };
      const invitePayload = { name: "Retry Invite", email: "retry.invite@layerpilot.test", role: "Operator", location: "QC Lab" };
      const invited = await app.inject({ method: "POST", url: "/api/users", headers: inviteHeaders, payload: invitePayload });
      expect(invited.statusCode).toBe(201);
      expect(invited.json().temporaryPassword).toBeTruthy();
      const invitedReplay = await app.inject({ method: "POST", url: "/api/users", headers: inviteHeaders, payload: invitePayload });
      expect(invitedReplay.statusCode).toBe(201);
      expect(invitedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(invitedReplay.json()).toEqual(invited.json());

      const userUpdateHeaders = { ...auth(token), "idempotency-key": "admin-user-update-retry-001" };
      const userUpdatePayload = { role: "Admin", location: "Studio South" };
      const userUpdated = await app.inject({ method: "PATCH", url: `/api/users/${invited.json().user.id}`, headers: userUpdateHeaders, payload: userUpdatePayload });
      expect(userUpdated.statusCode).toBe(200);
      const userUpdatedReplay = await app.inject({ method: "PATCH", url: `/api/users/${invited.json().user.id}`, headers: userUpdateHeaders, payload: userUpdatePayload });
      expect(userUpdatedReplay.statusCode).toBe(200);
      expect(userUpdatedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(userUpdatedReplay.json()).toEqual(userUpdated.json());

      const resetHeaders = { ...auth(token), "idempotency-key": "admin-user-reset-retry-001" };
      const resetPayload = { requireChange: true };
      const reset = await app.inject({ method: "POST", url: `/api/users/${invited.json().user.id}/reset-password`, headers: resetHeaders, payload: resetPayload });
      expect(reset.statusCode).toBe(200);
      expect(reset.json().temporaryPassword).toBeTruthy();
      const resetReplay = await app.inject({ method: "POST", url: `/api/users/${invited.json().user.id}/reset-password`, headers: resetHeaders, payload: resetPayload });
      expect(resetReplay.statusCode).toBe(200);
      expect(resetReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(resetReplay.json()).toEqual(reset.json());

      const conflict = await app.inject({
        method: "POST",
        url: `/api/users/${invited.json().user.id}/reset-password`,
        headers: resetHeaders,
        payload: { requireChange: false }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.apiKeys.filter((key) => key.name === "Retry admin automation")).toHaveLength(1);
      expect(persisted.users.filter((user) => user.email === "retry.invite@layerpilot.test")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "api_key.created" && event.data?.apiKeyId === apiKey.json().apiKey.id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "api_key.updated" && event.data?.apiKeyId === apiKey.json().apiKey.id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "user.invited" && event.data?.userId === invited.json().user.id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "user.updated" && event.data?.userId === invited.json().user.id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "user.password_reset" && event.data?.userId === invited.json().user.id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "admin-user-reset-retry-001")).toMatchObject({
        method: "POST",
        path: `/api/users/${invited.json().user.id}/reset-password`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("persists workspace settings with role protection", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const current = await app.inject({ method: "GET", url: "/api/workspaceSettings", headers: auth(token) });
      expect(current.statusCode).toBe(200);
      expect(current.json()).toMatchObject({ organizationName: "North Campus Lab", timezone: "Asia/Taipei", requireAdmin2fa: true, hotDropMode: "Direct Print" });

      const updated = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { organizationName: "QC Print Farm", defaultLocation: "QC Bay", currency: "TWD", restrictApiByIp: true, allowedApiIps: ["127.0.0.0/8"], hotDropMode: "Auto-Queue" }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ organizationName: "QC Print Farm", defaultLocation: "QC Bay", currency: "TWD", restrictApiByIp: true, allowedApiIps: ["127.0.0.0/8"], hotDropMode: "Auto-Queue" });

      const invalidMode = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { hotDropMode: "Fire and forget" }
      });
      expect(invalidMode.statusCode).toBe(400);

      const invalidAllowlist = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { restrictApiByIp: true, allowedApiIps: ["127.0.0.1", "bad-rule", "10.0.0.1/99", "::1"] }
      });
      expect(invalidAllowlist.statusCode).toBe(400);
      expect(invalidAllowlist.json()).toMatchObject({ error: "Invalid workspace settings payload" });
      expect(invalidAllowlist.json().issues.map((issue) => issue.path[0])).toContain("allowedApiIps");

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "No settings key", scopes: ["queue:write"], enabled: true }
      });
      const denied = await app.inject({ method: "PATCH", url: "/api/workspaceSettings", headers: auth(apiKey.json().secret), payload: { organizationName: "Bad" } });
      expect(denied.statusCode).toBe(403);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaceSettings).toMatchObject({ organizationName: "QC Print Farm", defaultLocation: "QC Bay", currency: "TWD", restrictApiByIp: true, allowedApiIps: ["127.0.0.0/8"], hotDropMode: "Auto-Queue" });
      expect(persisted.events.some((event) => event.type === "settings.updated")).toBe(true);
    });
  });

  it("tracks onboarding readiness and generates redacted support snapshots", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const token = await login(app);
      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Support automation", scopes: ["admin:export"], enabled: true }
      });
      expect(apiKey.statusCode).toBe(201);

      const onboarding = await app.inject({ method: "GET", url: "/api/onboarding", headers: auth(token) });
      expect(onboarding.statusCode).toBe(200);
      expect(onboarding.json().steps).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "workspace", status: "complete" }),
        expect.objectContaining({ id: "backup", status: "pending" })
      ]));

      const backup = await app.inject({
        method: "PATCH",
        url: "/api/onboarding/backup",
        headers: auth(token),
        payload: { status: "complete", note: "Export verified by owner" }
      });
      expect(backup.statusCode).toBe(200);
      expect(backup.json().onboarding.steps.find((step) => step.id === "backup")).toMatchObject({ status: "complete", note: "Export verified by owner" });

      db.data.events.unshift({
        id: "support-url-event",
        workspaceId: "ws-default",
        type: "bridge.saved",
        message: "Bridge endpoint updated",
        at: new Date().toISOString(),
        data: {
          url: "https://hooks.slack.com/services/T000/B000/SUPPORT_SECRET?token=support-query-secret",
          baseUrl: "http://octoprint.local/api?apikey=support-bridge-secret",
          publicUrl: "https://farm.example.test/portal"
        }
      });
      await db.write();

      const snapshot = await app.inject({ method: "POST", url: "/api/support/snapshot", headers: auth(token) });
      expect(snapshot.statusCode).toBe(200);
      expect(snapshot.json()).toMatchObject({
        service: "3DSTU FarmFlow",
        workspace: expect.objectContaining({ name: "North Campus Lab" }),
        counts: expect.objectContaining({ printers: expect.any(Number), apiKeys: expect.any(Number) }),
        readiness: expect.objectContaining({ onboarding: expect.objectContaining({ percent: expect.any(Number) }) })
      });
      const snapshotText = JSON.stringify(snapshot.json());
      expect(snapshotText).not.toContain(apiKey.json().secret);
      expect(snapshotText).not.toContain("scrypt$");
      expect(snapshotText).not.toContain("SUPPORT_SECRET");
      expect(snapshotText).not.toContain("support-query-secret");
      expect(snapshotText).not.toContain("support-bridge-secret");
      const endpointEvent = snapshot.json().recentEvents.find((event) => event.type === "bridge.saved");
      expect(endpointEvent.data).toMatchObject({
        url: "https://hooks.slack.com (redacted)",
        baseUrl: "http://octoprint.local (redacted)",
        publicUrl: "https://farm.example.test (redacted)"
      });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaceSettings.onboarding.backup).toMatchObject({ status: "complete", note: "Export verified by owner" });
      expect(persisted.events.some((event) => event.type === "support.snapshot")).toBe(true);
    });
  });

  it("records operator context for governance and go-live audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const actorEmail = "demo@layerpilot.test";

      const settings = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { organizationName: "Governance Farm", auditLogRetentionDays: 120 }
      });
      expect(settings.statusCode).toBe(200);

      const onboarding = await app.inject({
        method: "PATCH",
        url: "/api/onboarding/security",
        headers: auth(token),
        payload: { status: "complete", note: "2FA policy reviewed" }
      });
      expect(onboarding.statusCode).toBe(200);

      const snapshot = await app.inject({ method: "POST", url: "/api/support/snapshot", headers: auth(token) });
      expect(snapshot.statusCode).toBe(200);

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Governance automation", scopes: ["admin:export"], enabled: true }
      });
      expect(apiKey.statusCode).toBe(201);
      const apiKeyUpdate = await app.inject({
        method: "PATCH",
        url: `/api/apiKeys/${apiKey.json().apiKey.id}`,
        headers: auth(token),
        payload: { enabled: false }
      });
      expect(apiKeyUpdate.statusCode).toBe(200);

      const user = await app.inject({
        method: "POST",
        url: "/api/users",
        headers: auth(token),
        payload: { name: "Governance Viewer", email: "governance.viewer@layerpilot.test", role: "Viewer", location: "HQ" }
      });
      expect(user.statusCode).toBe(201);
      const userUpdate = await app.inject({
        method: "PATCH",
        url: `/api/users/${user.json().user.id}`,
        headers: auth(token),
        payload: { role: "Operator", location: "Line 2" }
      });
      expect(userUpdate.statusCode).toBe(200);
      const reset = await app.inject({
        method: "POST",
        url: `/api/users/${user.json().user.id}/reset-password`,
        headers: auth(token),
        payload: { requireChange: true }
      });
      expect(reset.statusCode).toBe(200);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      for (const type of [
        "settings.updated",
        "onboarding.updated",
        "support.snapshot",
        "api_key.created",
        "api_key.updated",
        "user.invited",
        "user.updated",
        "user.password_reset"
      ]) {
        const event = persisted.events.find((item) => item.type === type);
        expect(event, type).toBeTruthy();
        expect(event).toMatchObject({
          workspaceId: "ws-default",
          data: expect.objectContaining({
            workspaceId: "ws-default",
            actorEmail,
            actorType: "user"
          })
        });
      }
    });
  });

  it("replays idempotent governance setup writes without duplicate audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);

      const settingsHeaders = { ...auth(token), "idempotency-key": "governance-settings-retry-001" };
      const settingsPayload = { organizationName: "Retry Safe Farm", auditLogRetentionDays: 180 };
      const settings = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: settingsHeaders,
        payload: settingsPayload
      });
      expect(settings.statusCode).toBe(200);
      const settingsReplay = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: settingsHeaders,
        payload: settingsPayload
      });
      expect(settingsReplay.statusCode).toBe(200);
      expect(settingsReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(settingsReplay.json()).toEqual(settings.json());

      const onboardingHeaders = { ...auth(token), "idempotency-key": "governance-onboarding-retry-001" };
      const onboardingPayload = { status: "complete", note: "Restore drill verified" };
      const onboarding = await app.inject({
        method: "PATCH",
        url: "/api/onboarding/backup",
        headers: onboardingHeaders,
        payload: onboardingPayload
      });
      expect(onboarding.statusCode).toBe(200);
      const onboardingReplay = await app.inject({
        method: "PATCH",
        url: "/api/onboarding/backup",
        headers: onboardingHeaders,
        payload: onboardingPayload
      });
      expect(onboardingReplay.statusCode).toBe(200);
      expect(onboardingReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(onboardingReplay.json()).toEqual(onboarding.json());

      const snapshotHeaders = { ...auth(token), "idempotency-key": "governance-snapshot-retry-001" };
      const snapshot = await app.inject({ method: "POST", url: "/api/support/snapshot", headers: snapshotHeaders });
      expect(snapshot.statusCode).toBe(200);
      const snapshotReplay = await app.inject({ method: "POST", url: "/api/support/snapshot", headers: snapshotHeaders });
      expect(snapshotReplay.statusCode).toBe(200);
      expect(snapshotReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(snapshotReplay.json()).toEqual(snapshot.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: settingsHeaders,
        payload: { organizationName: "Different Farm" }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "settings.updated" && event.data?.settings?.organizationName === "Retry Safe Farm")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "onboarding.updated" && event.data?.stepId === "backup")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "support.snapshot")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "governance-settings-retry-001")).toMatchObject({ method: "PATCH", path: "/api/workspaceSettings", replayCount: 1, statusCode: 200 });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "governance-onboarding-retry-001")).toMatchObject({ method: "PATCH", path: "/api/onboarding/backup", replayCount: 1, statusCode: 200 });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "governance-snapshot-retry-001")).toMatchObject({ method: "POST", path: "/api/support/snapshot", replayCount: 1, statusCode: 200 });
    });
  });

  it("redacts credential-bearing integration endpoints from state, lists, delivery logs, and exports", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const token = await login(app);
      const webhookUrl = "https://hooks.slack.com/services/T000/B000/WEBHOOK_SECRET?token=webhook-query-secret";
      const notificationUrl = "https://discord.com/api/webhooks/NOTIFICATION_SECRET?wait=true";
      const commerceUrl = "https://commerce.example.test/orders.json?access_token=commerce-query-secret";
      const bridgeBaseUrl = "http://octoprint.local/api?apikey=bridge-query-secret";

      const webhook = await app.inject({
        method: "POST",
        url: "/api/webhooks",
        headers: auth(token),
        payload: { name: "Secret webhook", url: webhookUrl, events: ["queue.created"], enabled: true }
      });
      expect(webhook.statusCode).toBe(201);
      expect(JSON.stringify(webhook.json())).not.toContain("WEBHOOK_SECRET");
      expect(webhook.json()).toMatchObject({ hasUrl: true, urlHost: "https://hooks.slack.com" });

      const notification = await app.inject({
        method: "POST",
        url: "/api/notificationChannels",
        headers: auth(token),
        payload: { name: "Secret notification", type: "discord", url: notificationUrl, token: "notification-token-secret", events: ["queue.created"], enabled: true }
      });
      expect(notification.statusCode).toBe(201);
      expect(JSON.stringify(notification.json())).not.toContain("NOTIFICATION_SECRET");
      expect(notification.json()).toMatchObject({ hasUrl: true, urlHost: "https://discord.com", hasToken: true });

      const commerce = await app.inject({
        method: "POST",
        url: "/api/commerceConnectors",
        headers: auth(token),
        payload: { name: "Secret commerce", source: "Generic", url: commerceUrl, token: "commerce-token-secret", enabled: true, mapping: {} }
      });
      expect(commerce.statusCode).toBe(201);
      expect(JSON.stringify(commerce.json())).not.toContain("commerce-query-secret");
      expect(commerce.json()).toMatchObject({ hasUrl: true, urlHost: "https://commerce.example.test", hasToken: true });

      const bridge = await app.inject({
        method: "POST",
        url: "/api/bridges",
        headers: auth(token),
        payload: { printerId: "p1", kind: "octoprint", name: "Secret bridge", baseUrl: bridgeBaseUrl, apiKey: "octo-api-secret", enabled: true }
      });
      expect([200, 201]).toContain(bridge.statusCode);
      expect(JSON.stringify(bridge.json())).not.toContain("bridge-query-secret");
      expect(bridge.json()).toMatchObject({ hasBaseUrl: true, baseUrlHost: "http://octoprint.local", hasApiKey: true });

      db.data.webhookDeliveries.unshift({ id: "wd-secret", webhookId: webhook.json().id, webhookName: "Secret webhook", eventId: "event-secret", eventType: "queue.created", url: webhookUrl, status: "failed", statusCode: 500, at: new Date().toISOString() });
      db.data.notificationDeliveries.unshift({ id: "nd-secret", channelId: notification.json().id, channelName: "Secret notification", channelType: "discord", eventId: "event-secret", eventType: "queue.created", url: notificationUrl, status: "failed", statusCode: 500, at: new Date().toISOString() });
      await db.write();

      const rawDb = JSON.parse(await readFile(dbPath, "utf8"));
      expect(rawDb.webhooks.find((item) => item.id === webhook.json().id).url).toBe(webhookUrl);
      expect(rawDb.notificationChannels.find((item) => item.id === notification.json().id).url).toBe(notificationUrl);
      expect(rawDb.commerceConnectors.find((item) => item.id === commerce.json().id).url).toBe(commerceUrl);
      expect(rawDb.bridges.find((item) => item.id === bridge.json().id).baseUrl).toBe(bridgeBaseUrl);

      for (const url of ["/api/state", "/api/webhooks", "/api/webhookDeliveries", "/api/notificationChannels", "/api/notificationDeliveries", "/api/commerceConnectors", "/api/bridges", "/api/admin/export"]) {
        const response = await app.inject({ method: "GET", url, headers: auth(token) });
        expect(response.statusCode).toBe(200);
        const text = response.body;
        expect(text).not.toContain("WEBHOOK_SECRET");
        expect(text).not.toContain("webhook-query-secret");
        expect(text).not.toContain("NOTIFICATION_SECRET");
        expect(text).not.toContain("notification-token-secret");
        expect(text).not.toContain("commerce-query-secret");
        expect(text).not.toContain("commerce-token-secret");
        expect(text).not.toContain("bridge-query-secret");
        expect(text).not.toContain("octo-api-secret");
      }
    });
  });

  it("replays idempotent integration configuration writes without duplicate records or audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);

      const webhookHeaders = { ...auth(token), "idempotency-key": "webhook-config-retry-001" };
      const webhookPayload = { name: "Retry webhook config", url: "https://hooks.example.test/config", events: ["queue.created"], enabled: true };
      const webhook = await app.inject({ method: "POST", url: "/api/webhooks", headers: webhookHeaders, payload: webhookPayload });
      expect(webhook.statusCode).toBe(201);
      const webhookReplay = await app.inject({ method: "POST", url: "/api/webhooks", headers: webhookHeaders, payload: webhookPayload });
      expect(webhookReplay.statusCode).toBe(201);
      expect(webhookReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(webhookReplay.json()).toEqual(webhook.json());

      const webhookPatchHeaders = { ...auth(token), "idempotency-key": "webhook-update-retry-001" };
      const webhookPatch = await app.inject({
        method: "PATCH",
        url: `/api/webhooks/${webhook.json().id}`,
        headers: webhookPatchHeaders,
        payload: { enabled: false, events: ["order.status"] }
      });
      expect(webhookPatch.statusCode).toBe(200);
      const webhookPatchReplay = await app.inject({
        method: "PATCH",
        url: `/api/webhooks/${webhook.json().id}`,
        headers: webhookPatchHeaders,
        payload: { enabled: false, events: ["order.status"] }
      });
      expect(webhookPatchReplay.statusCode).toBe(200);
      expect(webhookPatchReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(webhookPatchReplay.json()).toEqual(webhookPatch.json());

      const channelHeaders = { ...auth(token), "idempotency-key": "notification-config-retry-001" };
      const channelPayload = { name: "Retry notification config", type: "slack", url: "https://hooks.slack.test/config", token: "secret-token", events: ["queue.created"], enabled: true, recipients: [] };
      const channel = await app.inject({ method: "POST", url: "/api/notificationChannels", headers: channelHeaders, payload: channelPayload });
      expect(channel.statusCode).toBe(201);
      const channelReplay = await app.inject({ method: "POST", url: "/api/notificationChannels", headers: channelHeaders, payload: channelPayload });
      expect(channelReplay.statusCode).toBe(201);
      expect(channelReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(channelReplay.json()).toEqual(channel.json());

      const channelPatchHeaders = { ...auth(token), "idempotency-key": "notification-update-retry-001" };
      const channelPatch = await app.inject({
        method: "PATCH",
        url: `/api/notificationChannels/${channel.json().id}`,
        headers: channelPatchHeaders,
        payload: { enabled: false, events: ["order.status"] }
      });
      expect(channelPatch.statusCode).toBe(200);
      const channelPatchReplay = await app.inject({
        method: "PATCH",
        url: `/api/notificationChannels/${channel.json().id}`,
        headers: channelPatchHeaders,
        payload: { enabled: false, events: ["order.status"] }
      });
      expect(channelPatchReplay.statusCode).toBe(200);
      expect(channelPatchReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(channelPatchReplay.json()).toEqual(channelPatch.json());

      const connectorHeaders = { ...auth(token), "idempotency-key": "commerce-config-retry-001" };
      const connectorPayload = { name: "Retry commerce config", source: "Generic", url: "https://commerce.example.test/feed.json", token: "commerce-secret", enabled: true, mapping: {} };
      const connector = await app.inject({ method: "POST", url: "/api/commerceConnectors", headers: connectorHeaders, payload: connectorPayload });
      expect(connector.statusCode).toBe(201);
      const connectorReplay = await app.inject({ method: "POST", url: "/api/commerceConnectors", headers: connectorHeaders, payload: connectorPayload });
      expect(connectorReplay.statusCode).toBe(201);
      expect(connectorReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(connectorReplay.json()).toEqual(connector.json());

      const connectorPatchHeaders = { ...auth(token), "idempotency-key": "commerce-update-retry-001" };
      const connectorPatch = await app.inject({
        method: "PATCH",
        url: `/api/commerceConnectors/${connector.json().id}`,
        headers: connectorPatchHeaders,
        payload: { enabled: false, mapping: { externalOrderId: "id" } }
      });
      expect(connectorPatch.statusCode).toBe(200);
      const connectorPatchReplay = await app.inject({
        method: "PATCH",
        url: `/api/commerceConnectors/${connector.json().id}`,
        headers: connectorPatchHeaders,
        payload: { enabled: false, mapping: { externalOrderId: "id" } }
      });
      expect(connectorPatchReplay.statusCode).toBe(200);
      expect(connectorPatchReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(connectorPatchReplay.json()).toEqual(connectorPatch.json());

      const addonHeaders = { ...auth(token), "idempotency-key": "addon-config-retry-001" };
      const addonPayload = { enabled: true, config: { topicPrefix: "layerpilot/retry", password: "mqtt-secret" }, note: "Retry-safe add-on config" };
      const addon = await app.inject({ method: "PATCH", url: "/api/addons/mqtt", headers: addonHeaders, payload: addonPayload });
      expect(addon.statusCode).toBe(200);
      const addonReplay = await app.inject({ method: "PATCH", url: "/api/addons/mqtt", headers: addonHeaders, payload: addonPayload });
      expect(addonReplay.statusCode).toBe(200);
      expect(addonReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(addonReplay.json()).toEqual(addon.json());

      const bridgeHeaders = { ...auth(token), "idempotency-key": "bridge-config-retry-001" };
      const bridgePayload = { printerId: "p1", kind: "manual", name: "Retry bridge config", baseUrl: "manual://retry", enabled: true };
      const bridge = await app.inject({ method: "POST", url: "/api/bridges", headers: bridgeHeaders, payload: bridgePayload });
      expect(bridge.statusCode).toBe(200);
      const bridgeReplay = await app.inject({ method: "POST", url: "/api/bridges", headers: bridgeHeaders, payload: bridgePayload });
      expect(bridgeReplay.statusCode).toBe(200);
      expect(bridgeReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(bridgeReplay.json()).toEqual(bridge.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/webhooks",
        headers: webhookHeaders,
        payload: { ...webhookPayload, name: "Different webhook config" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.webhooks.filter((item) => item.name === "Retry webhook config")).toHaveLength(1);
      expect(persisted.notificationChannels.filter((item) => item.name === "Retry notification config")).toHaveLength(1);
      expect(persisted.commerceConnectors.filter((item) => item.name === "Retry commerce config")).toHaveLength(1);
      expect(persisted.bridges.filter((item) => item.name === "Retry bridge config")).toHaveLength(1);
      for (const [type, idKey, idValue] of [
        ["webhook.created", "webhookId", webhook.json().id],
        ["webhook.updated", "webhookId", webhook.json().id],
        ["notification.channel_created", "channelId", channel.json().id],
        ["notification.channel_updated", "channelId", channel.json().id],
        ["commerce.connector_created", "connectorId", connector.json().id],
        ["commerce.connector_updated", "connectorId", connector.json().id]
      ]) {
        const event = persisted.events.find((item) => item.type === type && item.data?.[idKey] === idValue);
        expect(event).toMatchObject({
          workspaceId: "ws-default",
          data: {
            workspaceId: "ws-default",
            [idKey]: idValue,
            actorEmail: "demo@layerpilot.test",
            actorType: "user"
          }
        });
        expect(JSON.stringify(event)).not.toContain("secret-token");
        expect(JSON.stringify(event)).not.toContain("commerce-secret");
        expect(JSON.stringify(event)).not.toContain("https://hooks.example.test/config");
        expect(JSON.stringify(event)).not.toContain("https://hooks.slack.test/config");
        expect(JSON.stringify(event)).not.toContain("https://commerce.example.test/feed.json");
      }
      expect(persisted.events.filter((event) => event.type === "addon.updated" && event.data?.addonId === "mqtt")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "bridge.saved" && event.data?.bridgeId === bridge.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "webhook-config-retry-001")).toMatchObject({ method: "POST", path: "/api/webhooks", replayCount: 1, statusCode: 201 });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "bridge-config-retry-001")).toMatchObject({ method: "POST", path: "/api/bridges", replayCount: 1, statusCode: 200 });
    });
  });

  it("enforces audit retention policy and preserves protected admin events", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const token = await login(app);
      const updated = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { auditLogRetention: true, auditLogRetentionDays: 30 }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ auditLogRetention: true, auditLogRetentionDays: 30 });

      db.data.workspaces.push({
        id: "ws-retention-other",
        name: "Other Farm",
        slug: "other-farm",
        ownerEmail: "other@example.com",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        settings: { ...db.data.workspaceSettings, workspaceId: "ws-retention-other", organizationName: "Other Farm", auditLogRetention: true, auditLogRetentionDays: 30 }
      });
      db.data.events.unshift(
        { id: "old-queue-event", workspaceId: "ws-default", type: "queue.status", message: "Old queue event", data: {}, at: "2020-01-01T00:00:00.000Z" },
        { id: "old-admin-event", workspaceId: "ws-default", type: "admin.restore", message: "Old restore event", data: {}, at: "2020-01-01T00:00:00.000Z" },
        { id: "other-workspace-event", workspaceId: "ws-retention-other", type: "queue.status", message: "Other workspace event", data: {}, at: "2020-01-01T00:00:00.000Z" }
      );
      await db.write();

      const run = await app.inject({ method: "POST", url: "/api/admin/audit-retention/run", headers: auth(token) });
      expect(run.statusCode).toBe(200);
      expect(run.json().retention).toMatchObject({ enabled: true, days: 30, pruned: 1 });
      expect(db.data.events.some((event) => event.id === "old-queue-event")).toBe(false);
      expect(db.data.events.some((event) => event.id === "old-admin-event")).toBe(true);
      expect(db.data.events.some((event) => event.id === "other-workspace-event")).toBe(true);
      expect(db.data.events.some((event) => event.type === "admin.audit_retention_run")).toBe(true);

      const disabled = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { auditLogRetention: false, auditLogRetentionDays: 45 }
      });
      expect(disabled.statusCode).toBe(200);
      db.data.events.unshift({ id: "old-kept-event", type: "queue.status", message: "Old kept event", data: {}, at: "2020-01-01T00:00:00.000Z" });
      await db.write();
      const disabledRun = await app.inject({ method: "POST", url: "/api/admin/audit-retention/run", headers: auth(token) });
      expect(disabledRun.statusCode).toBe(200);
      expect(disabledRun.json().retention).toMatchObject({ enabled: false, days: 45, pruned: 0 });
      expect(db.data.events.some((event) => event.id === "old-kept-event")).toBe(true);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaceSettings).toMatchObject({ auditLogRetention: false, auditLogRetentionDays: 45 });
      expect(persisted.dataMeta.auditRetentionLastRunAt).toBeTruthy();
    });
  });

  it("reports billing storage usage, changes plans, and records billing sessions", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const billing = await app.inject({ method: "GET", url: "/api/billing", headers: auth(token) });
      expect(billing.statusCode).toBe(200);
      expect(billing.json()).toMatchObject({ status: "trialing", plan: { id: "trial", name: "Print Farm Trial" } });
      expect(billing.json().storage.usedBytes).toBeGreaterThan(0);
      expect(billing.json().tiers.some((tier) => tier.id === "farm")).toBe(true);

      const changed = await app.inject({ method: "PATCH", url: "/api/billing/plan", headers: auth(token), payload: { planId: "farm" } });
      expect(changed.statusCode).toBe(200);
      expect(changed.json().settings).toMatchObject({ plan: "Print Farm", storageLimitGb: 500 });
      expect(changed.json().billing).toMatchObject({ status: "active", plan: { id: "farm", monthlyPrice: 149 } });
      expect(changed.json().invoice).toMatchObject({ plan: "Print Farm", amount: 149, status: "open" });

      const portal = await app.inject({ method: "POST", url: "/api/billing/portal", headers: auth(token), payload: { returnUrl: "http://127.0.0.1:8797/settings" } });
      expect(portal.statusCode).toBe(200);
      expect(portal.json().session).toMatchObject({ mode: "internal", status: "created" });
      expect(portal.json().billing.sessions.length).toBeGreaterThan(0);

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "No billing key", scopes: ["queue:write"], enabled: true }
      });
      const denied = await app.inject({ method: "PATCH", url: "/api/billing/plan", headers: auth(apiKey.json().secret), payload: { planId: "studio" } });
      expect(denied.statusCode).toBe(403);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaceSettings).toMatchObject({ plan: "Print Farm", storageLimitGb: 500 });
      expect(persisted.invoices.some((invoice) => invoice.plan === "Print Farm")).toBe(true);
      expect(persisted.billingSessions.length).toBeGreaterThan(0);
      expect(persisted.events.some((event) => event.type === "billing.plan_changed")).toBe(true);
      expect(persisted.events.some((event) => event.type === "billing.portal_session")).toBe(true);
    });
  });

  it("replays idempotent billing plan changes and portal sessions without duplicate billing records", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const planHeaders = { ...auth(token), "idempotency-key": "billing-plan-retry-001" };

      const firstPlan = await app.inject({
        method: "PATCH",
        url: "/api/billing/plan",
        headers: planHeaders,
        payload: { planId: "farm" }
      });
      expect(firstPlan.statusCode).toBe(200);
      const firstPlanBody = firstPlan.json();
      expect(firstPlanBody.invoice).toMatchObject({ planId: "farm", amount: 149, status: "open" });

      const replayPlan = await app.inject({
        method: "PATCH",
        url: "/api/billing/plan",
        headers: planHeaders,
        payload: { planId: "farm" }
      });
      expect(replayPlan.statusCode).toBe(200);
      expect(replayPlan.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replayPlan.json().invoice.id).toBe(firstPlanBody.invoice.id);

      const portalHeaders = { ...auth(token), "idempotency-key": "billing-portal-retry-001" };
      const firstPortal = await app.inject({
        method: "POST",
        url: "/api/billing/portal",
        headers: portalHeaders,
        payload: { returnUrl: "http://127.0.0.1:8797/settings", planId: "studio" }
      });
      expect(firstPortal.statusCode).toBe(200);
      const firstPortalBody = firstPortal.json();
      expect(firstPortalBody.session).toMatchObject({ mode: "internal", status: "created", planId: "studio" });

      const replayPortal = await app.inject({
        method: "POST",
        url: "/api/billing/portal",
        headers: portalHeaders,
        payload: { returnUrl: "http://127.0.0.1:8797/settings", planId: "studio" }
      });
      expect(replayPortal.statusCode).toBe(200);
      expect(replayPortal.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replayPortal.json().session.id).toBe(firstPortalBody.session.id);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.invoices.filter((invoice) => invoice.planId === "farm")).toHaveLength(1);
      expect(persisted.billingSessions.filter((session) => session.planId === "studio")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "billing.plan_changed")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "billing.portal_session")).toHaveLength(1);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/billing/portal",
        headers: portalHeaders,
        payload: { returnUrl: "http://127.0.0.1:8797/settings?changed=1", planId: "studio" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });
    });
  });

  it("creates Stripe billing sessions and applies Stripe webhook updates", async () => {
    const calls = [];
    const fakeStripe = {
      checkout: {
        sessions: {
          create: async (params) => {
            calls.push({ kind: "checkout", params });
            return { id: "cs_test_layerpilot", status: "open", url: "https://checkout.stripe.test/session" };
          }
        }
      },
      billingPortal: {
        sessions: {
          create: async (params) => {
            calls.push({ kind: "portal", params });
            return { id: "bps_test_layerpilot", status: "created", url: "https://billing.stripe.test/portal" };
          }
        }
      }
    };
    await withEnv({
      LAYERPILOT_STRIPE_PRICE_STUDIO: "price_studio_test",
      LAYERPILOT_STRIPE_PRICE_FARM: "price_farm_test",
      LAYERPILOT_STRIPE_WEBHOOK_SECRET: "whsec_test"
    }, async () => {
      await withApp(async ({ app, dbPath }) => {
        const token = await login(app);
        const billing = await app.inject({ method: "GET", url: "/api/billing", headers: auth(token) });
        expect(billing.statusCode).toBe(200);
        expect(billing.json().portalMode).toBe("stripe");

        const portal = await app.inject({
          method: "POST",
          url: "/api/billing/portal",
          headers: { ...auth(token), "idempotency-key": "stripe-billing-portal-retry-001" },
          payload: { returnUrl: "http://127.0.0.1:8797/settings", planId: "farm" }
        });
        expect(portal.statusCode).toBe(200);
        expect(portal.json().session).toMatchObject({ mode: "stripe", provider: "stripe", id: "cs_test_layerpilot", stripePriceId: "price_farm_test" });
        expect(portal.json().session.url).toBe("https://checkout.stripe.test/session");
        expect(calls[0].params).toMatchObject({ mode: "subscription", line_items: [{ price: "price_farm_test", quantity: 1 }] });

        const replayPortal = await app.inject({
          method: "POST",
          url: "/api/billing/portal",
          headers: { ...auth(token), "idempotency-key": "stripe-billing-portal-retry-001" },
          payload: { returnUrl: "http://127.0.0.1:8797/settings", planId: "farm" }
        });
        expect(replayPortal.statusCode).toBe(200);
        expect(replayPortal.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replayPortal.json().session.id).toBe("cs_test_layerpilot");
        expect(calls.filter((call) => call.kind === "checkout")).toHaveLength(1);

        const denied = await app.inject({
          method: "POST",
          url: "/api/billing/webhook/stripe",
          payload: { id: "evt_denied", type: "invoice.paid", data: { object: {} } }
        });
        expect(denied.statusCode).toBe(401);

        const stripeEvent = {
          id: "evt_paid",
          type: "checkout.session.completed",
          data: {
            object: {
              id: "cs_test_layerpilot",
              customer: "cus_layerpilot",
              subscription: "sub_layerpilot",
              amount_total: 14900,
              currency: "usd",
              status: "paid",
              created: 1781430000,
              lines: { data: [{ price: { id: "price_farm_test" } }] }
            }
          }
        };
        const rawStripeEvent = JSON.stringify(stripeEvent);
        const badSignature = await app.inject({
          method: "POST",
          url: "/api/billing/webhook/stripe",
          headers: {
            "content-type": "application/json",
            "stripe-signature": Stripe.webhooks.generateTestHeaderString({
              payload: rawStripeEvent,
              secret: "wrong_webhook_secret"
            })
          },
          payload: rawStripeEvent
        });
        expect(badSignature.statusCode).toBe(401);
        expect(badSignature.json()).toMatchObject({ error: "Invalid Stripe webhook signature" });

        const webhook = await app.inject({
          method: "POST",
          url: "/api/billing/webhook/stripe",
          headers: {
            "content-type": "application/json",
            "stripe-signature": Stripe.webhooks.generateTestHeaderString({
              payload: rawStripeEvent,
              secret: "whsec_test"
            })
          },
          payload: rawStripeEvent
        });
        expect(webhook.statusCode).toBe(200);
        expect(webhook.json().plan).toMatchObject({ id: "farm", name: "Print Farm" });
        expect(webhook.json().invoice).toMatchObject({ id: "cs_test_layerpilot", provider: "stripe", planId: "farm", amount: 149, status: "paid" });

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.workspaceSettings).toMatchObject({ plan: "Print Farm", stripeCustomerId: "cus_layerpilot", stripeSubscriptionId: "sub_layerpilot" });
        expect(persisted.events.some((event) => event.type === "billing.stripe_webhook" && event.data.planId === "farm")).toBe(true);
      }, { stripeClient: fakeStripe });
    });
  });

  it("updates the cost catalog and uses it for quotes and file estimates", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const current = await app.inject({ method: "GET", url: "/api/costCatalog", headers: auth(token) });
      expect(current.statusCode).toBe(200);
      expect(current.json()).toMatchObject({ currency: "USD", machineHourlyRate: 18, materialRates: { PLA: 0.82 } });

      const updated = await app.inject({
        method: "PATCH",
        url: "/api/costCatalog",
        headers: auth(token),
        payload: { materialRates: { PETG: 2 }, machineHourlyRate: 30, failureReservePercent: 10, overheadPercent: 0, minimumQuote: 5 }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ machineHourlyRate: 30, failureReservePercent: 10, materialRates: { PLA: 0.82, PETG: 2 } });

      const quote = await app.inject({
        method: "POST",
        url: "/api/quotes",
        headers: auth(token),
        payload: { material: "PETG", grams: 100, minutes: 60, includeLabor: false, quantity: 1 }
      });
      expect(quote.statusCode).toBe(200);
      expect(quote.json()).toMatchObject({ currency: "USD", material: "PETG", materialCost: 2, machineCost: 30, reserve: 3.2, total: 35.2 });

      const created = await app.inject({
        method: "POST",
        url: "/api/files",
        headers: auth(token),
        payload: { name: "Quoted fixture.stl", type: "STL", material: "PETG", dimensions: [100, 100, 40], estimateGrams: 100, estimateMinutes: 60 }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ name: "Quoted fixture.stl", cost: 35.2, quote: 35.2, quoteBreakdown: { materialCost: 2, machineCost: 30 } });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.costCatalog).toMatchObject({ machineHourlyRate: 30, materialRates: { PETG: 2 } });
      expect(persisted.files.find((file) => file.name === "Quoted fixture.stl")).toMatchObject({ quote: 35.2 });
      expect(persisted.events.some((event) => event.type === "cost_catalog.updated")).toBe(true);
    });
  });

  it("replays idempotent catalog governance writes without duplicate pricing or material-map events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);

      const costHeaders = { ...auth(token), "idempotency-key": "catalog-cost-governance-retry-001" };
      const costPayload = { materialRates: { PETG: 2.4 }, machineHourlyRate: 42, failureReservePercent: 12, overheadPercent: 4, minimumQuote: 8 };
      const cost = await app.inject({ method: "PATCH", url: "/api/costCatalog", headers: costHeaders, payload: costPayload });
      expect(cost.statusCode).toBe(200);
      const costReplay = await app.inject({ method: "PATCH", url: "/api/costCatalog", headers: costHeaders, payload: costPayload });
      expect(costReplay.statusCode).toBe(200);
      expect(costReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(costReplay.json()).toEqual(cost.json());

      const part = await app.inject({
        method: "POST",
        url: "/api/parts",
        headers: auth(token),
        payload: { name: "Governance material alias", fileId: "f2", material: "Any PETG", process: "0.20mm Production", plates: 1, variants: ["Black"], status: "ready" }
      });
      expect(part.statusCode).toBe(201);

      const mapHeaders = { ...auth(token), "idempotency-key": "catalog-material-map-retry-001" };
      const mapPayload = { apply: true };
      const mapped = await app.inject({ method: "POST", url: "/api/catalog/material-map", headers: mapHeaders, payload: mapPayload });
      expect(mapped.statusCode).toBe(200);
      expect(mapped.json()).toMatchObject({ applied: true });
      expect(mapped.json().changed).toBeGreaterThanOrEqual(1);
      const mappedReplay = await app.inject({ method: "POST", url: "/api/catalog/material-map", headers: mapHeaders, payload: mapPayload });
      expect(mappedReplay.statusCode).toBe(200);
      expect(mappedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(mappedReplay.json()).toEqual(mapped.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/catalog/material-map",
        headers: mapHeaders,
        payload: { apply: false }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.costCatalog).toMatchObject({ machineHourlyRate: 42, materialRates: { PETG: 2.4 } });
      expect(persisted.materialMapRuns).toHaveLength(1);
      expect(persisted.materialMapRuns[0]).toMatchObject({ applied: true });
      expect(persisted.parts.find((item) => item.id === part.json().id)).toMatchObject({ material: "PETG" });

      const costEvents = persisted.events.filter((event) => event.type === "cost_catalog.updated" && event.data?.costCatalog?.machineHourlyRate === 42);
      const mapEvents = persisted.events.filter((event) => event.type === "catalog.material_mapped");
      expect(costEvents).toHaveLength(1);
      expect(mapEvents).toHaveLength(1);
      expect(mapEvents[0]).toMatchObject({
        workspaceId: "ws-default",
        data: expect.objectContaining({
          workspaceId: "ws-default",
          actorEmail: "demo@layerpilot.test",
          actorRole: "Admin",
          actorType: "user",
          applied: true
        })
      });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "catalog-cost-governance-retry-001")).toMatchObject({ method: "PATCH", path: "/api/costCatalog", replayCount: 1, statusCode: 200 });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "catalog-material-map-retry-001")).toMatchObject({ method: "POST", path: "/api/catalog/material-map", replayCount: 1, statusCode: 200 });
    });
  });

  it("persists add-on marketplace status, config, and audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const addons = await app.inject({ method: "GET", url: "/api/addons", headers: auth(token) });
      expect(addons.statusCode).toBe(200);
      expect(addons.json().map((addon) => addon.id)).toEqual(expect.arrayContaining(["commerce", "cost", "audit", "maintenance", "mqtt", "pwa"]));

      const enabled = await app.inject({
        method: "PATCH",
        url: "/api/addons/mqtt",
        headers: auth(token),
        payload: { enabled: true, config: { topic: "layerpilot/events", qos: 1, retained: false, password: "mqtt-secret" }, note: "Enable MQTT for automations" }
      });
      expect(enabled.statusCode).toBe(200);
      expect(enabled.json().addon).toMatchObject({ id: "mqtt", status: "enabled", enabled: true, config: { topic: "layerpilot/events", qos: 1, retained: false } });
      expect(enabled.json().addon.config.password).toBeUndefined();
      expect(enabled.json().addon.config.hasPassword).toBe(true);

      const disabled = await app.inject({
        method: "PATCH",
        url: "/api/addons/pwa",
        headers: auth(token),
        payload: { status: "disabled", note: "Not launched for tablets yet" }
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().addon).toMatchObject({ id: "pwa", status: "disabled", enabled: false });

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Queue only", scopes: ["queue:write"], enabled: true }
      });
      const denied = await app.inject({ method: "PATCH", url: "/api/addons/cost", headers: auth(apiKey.json().secret), payload: { enabled: false } });
      expect(denied.statusCode).toBe(403);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.addons.find((addon) => addon.id === "mqtt")).toMatchObject({ status: "enabled", enabled: true, config: { topic: "layerpilot/events", password: "mqtt-secret" } });
      expect(persisted.addons.find((addon) => addon.id === "pwa")).toMatchObject({ status: "disabled", enabled: false });
      expect(persisted.events.filter((event) => event.type === "addon.updated")).toHaveLength(2);
    });
  });

  it("publishes matching production events to MQTT and hides MQTT credentials", async () => {
    const mqttCalls = [];
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const configured = await app.inject({
        method: "PATCH",
        url: "/api/addons/mqtt",
        headers: auth(token),
        payload: {
          enabled: true,
          config: {
            brokerUrl: "mqtt://broker.test:1883",
            topicPrefix: "layerpilot/qc",
            events: ["queue.*"],
            qos: 1,
            retain: true,
            username: "farm",
            password: "mqtt-secret"
          },
          note: "Enable MQTT QC stream"
        }
      });
      expect(configured.statusCode).toBe(200);
      expect(configured.json().addon.config.password).toBeUndefined();
      expect(configured.json().addon.config.hasPassword).toBe(true);

      const queued = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(token),
        payload: { fileId: "f1", file: "MQTT published job.gcode", material: "PLA", due: "Tomorrow 12:00", dimensions: [80, 80, 20], time: "1h 10m", cost: 20 }
      });
      expect(queued.statusCode).toBe(201);
      expect(mqttCalls).toHaveLength(1);
      expect(mqttCalls[0]).toMatchObject({ topic: "layerpilot/qc/events/queue.created" });
      expect(mqttCalls[0].config).toMatchObject({ brokerUrl: "mqtt://broker.test:1883", username: "farm", password: "mqtt-secret", qos: 1, retain: true });
      const payload = JSON.parse(mqttCalls[0].payload);
      expect(payload).toMatchObject({ service: "3DSTU FarmFlow", event: { type: "queue.created", message: "MQTT published job.gcode queued" } });

      const listed = await app.inject({ method: "GET", url: "/api/addons", headers: auth(token) });
      expect(listed.json().find((addon) => addon.id === "mqtt").config.password).toBeUndefined();
      const state = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(state.json().addons.find((addon) => addon.id === "mqtt").config.password).toBeUndefined();

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.mqttDeliveries[0]).toMatchObject({ eventType: "queue.created", topic: "layerpilot/qc/events/queue.created", status: "delivered", qos: 1, retain: true });
    }, {
      mqttPublisher: async ({ config, topic, payload }) => {
        mqttCalls.push({ config, topic, payload });
      }
    });
  });

  it("queries audit events with filters and exports CSV with admin permissions", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app);
      await app.inject({
        method: "PATCH",
        url: "/api/costCatalog",
        headers: auth(token),
        payload: { machineHourlyRate: 42 }
      });
      await app.inject({
        method: "PATCH",
        url: "/api/costCatalog",
        headers: auth(token),
        payload: { laborPerOrder: 18 }
      });

      const audit = await app.inject({ method: "GET", url: "/api/audit?type=cost_catalog.updated&limit=1", headers: auth(token) });
      expect(audit.statusCode).toBe(200);
      expect(audit.json()).toMatchObject({ total: expect.any(Number), matched: 2, returned: 1, offset: 0, limit: 1, hasMore: true });
      expect(audit.json().events[0]).toMatchObject({ type: "cost_catalog.updated", message: "Cost catalog updated" });
      expect(audit.json().events[0].data.costCatalog.laborPerOrder).toBe(18);

      const secondPage = await app.inject({ method: "GET", url: "/api/audit?type=cost_catalog.updated&limit=1&offset=1", headers: auth(token) });
      expect(secondPage.statusCode).toBe(200);
      expect(secondPage.json()).toMatchObject({ matched: 2, returned: 1, offset: 1, limit: 1, hasMore: false });
      expect(secondPage.json().events[0].data.costCatalog.machineHourlyRate).toBe(42);

      const searched = await app.inject({ method: "GET", url: "/api/audit?search=Cost%20catalog", headers: auth(token) });
      expect(searched.statusCode).toBe(200);
      expect(searched.json().events.some((event) => event.type === "cost_catalog.updated")).toBe(true);
      expect(searched.json().matched).toBeGreaterThanOrEqual(2);

      const csv = await app.inject({ method: "GET", url: "/api/audit/export?type=cost_catalog.updated&limit=1&offset=1", headers: auth(token) });
      expect(csv.statusCode).toBe(200);
      expect(csv.headers["content-type"]).toContain("text/csv");
      expect(csv.headers["content-disposition"]).toContain("layerpilot-audit");
      expect(csv.body).toContain("id,type,message,at,data");
      expect(csv.body).toContain("cost_catalog.updated");
      expect(csv.body).toContain("machineHourlyRate");
      expect(csv.body).not.toContain("\"\"laborPerOrder\"\":18");
      const auditExportEvent = db.data.events.find((event) => event.type === "admin.audit_exported");
      expect(auditExportEvent).toMatchObject({
        workspaceId: "ws-default",
        data: expect.objectContaining({
          workspaceId: "ws-default",
          type: "cost_catalog.updated",
          limit: 1,
          offset: 1,
          exportedEvents: 1
        })
      });
      expect(auditExportEvent.data).toMatchObject({ actorEmail: "demo@layerpilot.test", actorType: "user" });
      expect(JSON.stringify(auditExportEvent.data)).not.toContain("machineHourlyRate");

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "No audit export", scopes: ["queue:write"], enabled: true }
      });
      const denied = await app.inject({ method: "GET", url: "/api/audit/export", headers: auth(apiKey.json().secret) });
      expect(denied.statusCode).toBe(403);

      const exportKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Audit export automation", scopes: ["admin:export"], enabled: true }
      });
      expect(exportKey.statusCode).toBe(201);

      const keyAudit = await app.inject({ method: "GET", url: "/api/audit?type=cost_catalog.updated", headers: auth(exportKey.json().secret) });
      expect(keyAudit.statusCode).toBe(200);
      expect(keyAudit.json().events[0]).toMatchObject({ type: "cost_catalog.updated" });

      const keyExport = await app.inject({ method: "GET", url: "/api/audit/export?type=cost_catalog.updated", headers: auth(exportKey.json().secret) });
      expect(keyExport.statusCode).toBe(200);
      expect(keyExport.body).toContain("cost_catalog.updated");

      const keyListDenied = await app.inject({ method: "GET", url: "/api/apiKeys", headers: auth(exportKey.json().secret) });
      expect(keyListDenied.statusCode).toBe(403);
    });
  });

  it("replays idempotent audit retention runs without duplicate audit events", async () => {
    await withApp(async ({ app, db }) => {
      const token = await login(app);
      db.data.workspaceSettings.auditLogRetention = true;
      db.data.workspaceSettings.auditLogRetentionDays = 7;
      db.data.events.push(
        { id: "stale-queue-event", workspaceId: "ws-default", type: "queue.created", message: "Old queued job", at: "2020-01-01T00:00:00.000Z", data: {} },
        { id: "protected-restore-event", workspaceId: "ws-default", type: "admin.restore", message: "Old restore", at: "2020-01-01T00:00:00.000Z", data: {} }
      );
      await db.write();
      const headers = { ...auth(token), "idempotency-key": "audit-retention-retry-001" };

      const first = await app.inject({ method: "POST", url: "/api/admin/audit-retention/run", headers, payload: {} });
      expect(first.statusCode).toBe(200);
      const firstBody = first.json();
      expect(firstBody.retention.pruned).toBeGreaterThanOrEqual(1);

      const replay = await app.inject({ method: "POST", url: "/api/admin/audit-retention/run", headers, payload: {} });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(firstBody);

      const runEvents = db.data.events.filter((event) => event.type === "admin.audit_retention_run");
      expect(runEvents).toHaveLength(1);
      expect(db.data.events.some((event) => event.id === "stale-queue-event")).toBe(false);
      expect(db.data.events.some((event) => event.id === "protected-restore-event")).toBe(true);
      expect(db.data.dataMeta.idempotencyKeys.find((record) => record.key === "audit-retention-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/admin/audit-retention/run",
        statusCode: 200,
        replayCount: 1
      });

      const conflict = await app.inject({
        method: "POST",
        url: "/api/admin/audit-retention/run",
        headers,
        payload: { reason: "different retry body" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });
    });
  });

  it("creates files with validation and persists them", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const bad = await app.inject({ method: "POST", url: "/api/files", headers: auth(token), payload: { name: "", type: "PDF", material: "" } });
      expect(bad.statusCode).toBe(400);

      const created = await app.inject({
        method: "POST",
        url: "/api/files",
        headers: auth(token),
        payload: { name: "Production fixture.stl", type: "STL", material: "PETG", dimensions: [120, 80, 20], estimateGrams: 55, estimateMinutes: 90, quote: 88 }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ name: "Production fixture.stl", status: "uploaded", version: 1 });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.some((file) => file.name === "Production fixture.stl")).toBe(true);
      const event = persisted.events.find((item) => item.type === "file.created" && item.data?.fileId === created.json().id);
      expect(event).toMatchObject({
        workspaceId: "ws-default",
        data: expect.objectContaining({
          workspaceId: "ws-default",
          actorEmail: "demo@layerpilot.test",
          actorId: expect.any(String),
          actorRole: expect.any(String),
          actorType: "user",
          fileId: created.json().id,
          name: "Production fixture.stl",
          type: "STL",
          material: "PETG",
          storageBacked: false
        })
      });
      expect(JSON.stringify(event)).not.toContain("storagePath");
    });
  });

  it("uploads real model files, stores bytes, and extracts metadata", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const boundary = "layerpilot-test-boundary";
      const stl = `solid bracket
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 80 0 0
vertex 0 40 20
endloop
endfacet
endsolid bracket`;
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...auth(token), "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipartPayload({ boundary, filename: "bracket.stl", content: stl, fields: { material: "PETG", folder: "QC Uploads" } })
      });
      expect(uploaded.statusCode).toBe(201);
      expect(uploaded.json()).toMatchObject({ name: "bracket.stl", type: "STL", folder: "QC Uploads", material: "PETG", dimensions: [80, 40, 20], status: "uploaded" });
      expect(uploaded.json().usage).toBeGreaterThan(0);
      await access(uploaded.json().storagePath);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.some((file) => file.id === uploaded.json().id && file.storagePath)).toBe(true);
    });
  });

  it("replays idempotent model uploads without duplicate stored files or upload events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "file-upload-retry-001" };
      const stl = `solid retry
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 60 0 0
vertex 0 30 12
endloop
endfacet
endsolid retry`;
      const uploadPayload = (content = stl) => multipartPayload({
        boundary: "layerpilot-upload-retry",
        filename: "retry-upload.stl",
        content,
        fields: { material: "PETG", folder: "Retry Uploads" }
      });
      const upload = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...headers, "content-type": "multipart/form-data; boundary=layerpilot-upload-retry" },
        payload: uploadPayload()
      });
      expect(upload.statusCode).toBe(201);

      const replay = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...headers, "content-type": "multipart/form-data; boundary=layerpilot-upload-retry" },
        payload: uploadPayload()
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toMatchObject({ id: upload.json().id, name: "retry-upload.stl", folder: "Retry Uploads", material: "PETG" });

      const conflict = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...headers, "content-type": "multipart/form-data; boundary=layerpilot-upload-retry" },
        payload: uploadPayload(`${stl}\nsolid changed\nendsolid changed`)
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.filter((file) => file.name === "retry-upload.stl")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "file.uploaded" && event.data?.fileId === upload.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "file-upload-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/files/upload",
        replayCount: 1,
        statusCode: 201
      });
    });
  });

  it("creates file folders and generated sample STL files with stored bytes", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const folder = await app.inject({
        method: "POST",
        url: "/api/file-folders",
        headers: auth(token),
        payload: { name: "QC Review", parent: "Inbox", purpose: "review" }
      });
      expect(folder.statusCode).toBe(201);
      expect(folder.json().folder).toMatchObject({ name: "Inbox / QC Review", purpose: "review" });

      const reused = await app.inject({
        method: "POST",
        url: "/api/file-folders",
        headers: auth(token),
        payload: { name: "QC Review", parent: "Inbox", purpose: "review" }
      });
      expect(reused.statusCode).toBe(200);
      expect(reused.json()).toMatchObject({ created: false });

      const retryHeaders = { ...auth(token), "idempotency-key": "file-folder-retry-001" };
      const firstRetrySafe = await app.inject({
        method: "POST",
        url: "/api/file-folders",
        headers: retryHeaders,
        payload: { name: "QC Intake", parent: "Inbox", purpose: "review" }
      });
      expect(firstRetrySafe.statusCode).toBe(201);
      expect(firstRetrySafe.json()).toMatchObject({ created: true, folder: expect.objectContaining({ name: "Inbox / QC Intake" }) });

      const replayRetrySafe = await app.inject({
        method: "POST",
        url: "/api/file-folders",
        headers: retryHeaders,
        payload: { name: "QC Intake", parent: "Inbox", purpose: "review" }
      });
      expect(replayRetrySafe.statusCode).toBe(201);
      expect(replayRetrySafe.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replayRetrySafe.json().folder.id).toBe(firstRetrySafe.json().folder.id);

      const persistedAfterRetry = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persistedAfterRetry.events.filter((event) => event.type === "file_folder.created" && event.data?.name === "Inbox / QC Intake")).toHaveLength(1);
      expect(persistedAfterRetry.events.filter((event) => event.type === "file_folder.reused" && event.data?.name === "Inbox / QC Intake")).toHaveLength(0);

      const sample = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: auth(token),
        payload: { name: "QC sample bracket", folder: "Inbox / QC Review", material: "PETG" }
      });
      expect(sample.statusCode).toBe(201);
      expect(sample.json().file).toMatchObject({ type: "STL", folder: "Inbox / QC Review", material: "PETG", status: "uploaded" });
      expect(sample.json().stlBytes).toBeGreaterThan(100);
      await access(sample.json().file.storagePath);

      const downloaded = await app.inject({ method: "GET", url: `/api/files/${sample.json().file.id}/download`, headers: auth(token) });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.body).toContain("solid layerpilot_sample_qc-sample-bracket");

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.fileFolders.find((item) => item.name === "Inbox / QC Review")).toMatchObject({ fileCount: 1 });
      expect(persisted.files.find((item) => item.id === sample.json().file.id)).toMatchObject({ storagePath: sample.json().file.storagePath });
      expect(persisted.events.some((event) => event.type === "file.sample_generated")).toBe(true);
    });
  });

  it("handles Hot Drop as an atomic stored-file and queue workflow", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const uploadOnly = await app.inject({
        method: "POST",
        url: "/api/hot-drop",
        headers: auth(token),
        payload: { mode: "Upload Only", name: "QC hot upload", folder: "Hot Drops / QC", material: "PLA" }
      });
      expect(uploadOnly.statusCode).toBe(201);
      expect(uploadOnly.json()).toMatchObject({ mode: "Upload Only", job: null });
      expect(uploadOnly.json().file.tags).toEqual(expect.arrayContaining(["hot-drop", "upload-only"]));
      await access(uploadOnly.json().file.storagePath);

      const autoQueue = await app.inject({
        method: "POST",
        url: "/api/hot-drop",
        headers: auth(token),
        payload: { mode: "Auto-Queue", name: "QC hot queue", folder: "Hot Drops / QC", material: "PETG" }
      });
      expect(autoQueue.statusCode).toBe(201);
      expect(autoQueue.json().job).toMatchObject({ fileId: autoQueue.json().file.id, stage: "needs slicing", status: "queued", material: "PETG", added: "Hot Drop" });
      expect(autoQueue.json().todos.some((todo) => todo.kind === "slicing" && todo.source === autoQueue.json().file.name)).toBe(true);

      const directPrint = await app.inject({
        method: "POST",
        url: "/api/hot-drop",
        headers: auth(token),
        payload: { mode: "Direct Print", name: "QC hot direct", folder: "Hot Drops / QC", material: "PLA" }
      });
      expect(directPrint.statusCode).toBe(201);
      expect(directPrint.json().job).toMatchObject({ stage: "needs slicing", status: "queued" });
      expect(directPrint.json().match).toBeNull();

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.filter((file) => file.tags.includes("hot-drop"))).toHaveLength(3);
      expect(persisted.queue.filter((job) => job.added === "Hot Drop")).toHaveLength(2);
      expect(persisted.events.some((event) => event.type === "hot_drop.handled")).toBe(true);
    });
  });

  it("replays idempotent file artifact writes without duplicate files, queue jobs, or version events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);

      const samplePayload = { name: "Retry sample bracket", folder: "Inbox / Retry", material: "PETG" };
      const sampleHeaders = { ...auth(token), "idempotency-key": "file-sample-retry-001" };
      const sample = await app.inject({ method: "POST", url: "/api/files/sample", headers: sampleHeaders, payload: samplePayload });
      expect(sample.statusCode).toBe(201);
      const sampleReplay = await app.inject({ method: "POST", url: "/api/files/sample", headers: sampleHeaders, payload: samplePayload });
      expect(sampleReplay.statusCode).toBe(201);
      expect(sampleReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(sampleReplay.json()).toEqual(sample.json());

      const hotDropPayload = { mode: "Auto-Queue", name: "Retry hot queue", folder: "Hot Drops / Retry", material: "PETG" };
      const hotDropHeaders = { ...auth(token), "idempotency-key": "hot-drop-retry-001" };
      const hotDrop = await app.inject({ method: "POST", url: "/api/hot-drop", headers: hotDropHeaders, payload: hotDropPayload });
      expect(hotDrop.statusCode).toBe(201);
      const hotDropReplay = await app.inject({ method: "POST", url: "/api/hot-drop", headers: hotDropHeaders, payload: hotDropPayload });
      expect(hotDropReplay.statusCode).toBe(201);
      expect(hotDropReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(hotDropReplay.json()).toEqual(hotDrop.json());

      const versionHeaders = { ...auth(token), "idempotency-key": "file-version-retry-001" };
      const versioned = await app.inject({ method: "PATCH", url: "/api/files/f2/version", headers: versionHeaders });
      expect(versioned.statusCode).toBe(200);
      const versionReplay = await app.inject({ method: "PATCH", url: "/api/files/f2/version", headers: versionHeaders });
      expect(versionReplay.statusCode).toBe(200);
      expect(versionReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(versionReplay.json()).toEqual(versioned.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: sampleHeaders,
        payload: { ...samplePayload, material: "PLA" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.filter((file) => file.name === "retry-sample-bracket.stl")).toHaveLength(1);
      expect(persisted.files.filter((file) => file.name === "retry-hot-queue.stl")).toHaveLength(1);
      expect(persisted.queue.filter((job) => job.file === "retry-hot-queue.stl" && job.added === "Hot Drop")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "file.sample_generated" && event.data?.fileId === sample.json().file.id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "hot_drop.handled" && event.data?.fileId === hotDrop.json().file.id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "file.versioned" && event.data?.fileId === "f2")).toHaveLength(1);
      expect(persisted.files.find((file) => file.id === "f2")).toMatchObject({ version: versioned.json().version });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "file-sample-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/files/sample",
        replayCount: 1,
        statusCode: 201
      });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "hot-drop-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/hot-drop",
        replayCount: 1,
        statusCode: 201
      });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "file-version-retry-001")).toMatchObject({
        method: "PATCH",
        path: "/api/files/f2/version",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("downloads stored files and deletes unreferenced files with storage cleanup", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const boundary = "layerpilot-delete-boundary";
      const stl = `solid delete_me
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 10
endloop
endfacet
endsolid delete_me`;
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...auth(token), "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipartPayload({ boundary, filename: "delete-me.stl", content: stl, fields: { material: "PLA", folder: "QC Uploads" } })
      });
      expect(uploaded.statusCode).toBe(201);
      const storagePath = uploaded.json().storagePath;

      const downloaded = await app.inject({ method: "GET", url: `/api/files/${uploaded.json().id}/download`, headers: auth(token) });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.headers["content-disposition"]).toContain("delete-me.stl");
      expect(downloaded.body).toContain("solid delete_me");

      const persistedAfterDownload = JSON.parse(await readFile(dbPath, "utf8"));
      const downloadEvents = persistedAfterDownload.events.filter((event) => event.type === "file.downloaded" && event.data?.fileId === uploaded.json().id);
      expect(downloadEvents).toHaveLength(1);
      expect(downloadEvents[0].data).toMatchObject({
        workspaceId: "ws-default",
        fileId: uploaded.json().id,
        fileName: "delete-me.stl",
        fileType: "STL",
        storageBacked: true,
        fallbackManifest: false
      });
      expect(JSON.stringify(downloadEvents[0])).not.toContain("solid delete_me");
      expect(JSON.stringify(downloadEvents[0])).not.toContain(storagePath);

      const blocked = await app.inject({ method: "DELETE", url: "/api/files/f1", headers: auth(token) });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json().references.parts.length).toBeGreaterThan(0);

      const deleted = await app.inject({ method: "DELETE", url: `/api/files/${uploaded.json().id}`, headers: auth(token) });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ ok: true, removedStorage: true });
      await expect(access(storagePath)).rejects.toThrow();

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.some((file) => file.id === uploaded.json().id)).toBe(false);
      expect(persisted.events.some((event) => event.type === "file.deleted" && event.data.fileId === uploaded.json().id)).toBe(true);
    });
  });

  it("builds safe file previews with G-code toolpath summaries", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const boundary = "layerpilot-preview-boundary";
      const gcode = [
        ";TIME:5400",
        "G1 X0 Y0 Z0.2 E0",
        "G1 X20 Y0 E1.2",
        "G1 X20 Y20 E2.4",
        "G1 X0 Y20 E3.6",
        "G1 X0 Y0 E4.8",
        "G1 Z0.4",
        "G1 X25 Y25 E5.8",
        "; customer secret note should not be copied as source"
      ].join("\n");
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...auth(token), "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipartPayload({ boundary, filename: "preview-job.gcode", content: gcode, fields: { material: "PLA", folder: "Production" } })
      });
      expect(uploaded.statusCode).toBe(201);
      const storagePath = uploaded.json().storagePath;

      const preview = await app.inject({ method: "GET", url: `/api/files/${uploaded.json().id}/preview`, headers: auth(token) });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({
        type: "GCODE",
        summary: expect.objectContaining({ printTime: "1h 30m", sliced: true }),
        visualization: expect.objectContaining({
          kind: "toolpath",
          lineCount: expect.any(Number),
          extrusionMoves: expect.any(Number),
          sample: expect.arrayContaining([expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) })])
        })
      });
      expect(preview.json().visualization.layers.length).toBeGreaterThan(0);
      expect(JSON.stringify(preview.json())).not.toContain("customer secret note");

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const previewEvents = persisted.events.filter((event) => event.type === "file.previewed" && event.data?.fileId === uploaded.json().id);
      expect(previewEvents).toHaveLength(1);
      expect(previewEvents[0].data).toMatchObject({
        workspaceId: "ws-default",
        fileId: uploaded.json().id,
        fileName: "preview-job.gcode",
        fileType: "GCODE",
        storageBacked: true,
        bytes: Buffer.byteLength(gcode),
        previewKind: "toolpath"
      });
      expect(JSON.stringify(previewEvents[0])).not.toContain("customer secret note");
      expect(JSON.stringify(previewEvents[0])).not.toContain(storagePath);
    });
  });

  it("stores uploaded files in an S3-compatible object store when configured", async () => {
    const objectStorageAdapter = createFakeS3Storage();
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const boundary = "layerpilot-s3-boundary";
      const stl = `solid s3_store
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 30 0 0
vertex 0 30 12
endloop
endfacet
endsolid s3_store`;
      const uploaded = await app.inject({
        method: "POST",
        url: "/api/files/upload",
        headers: { ...auth(token), "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: multipartPayload({ boundary, filename: "s3-store.stl", content: stl, fields: { material: "PLA", folder: "Object Storage" } })
      });
      expect(uploaded.statusCode).toBe(201);
      expect(uploaded.json()).toMatchObject({ name: "s3-store.stl", storageProvider: "s3" });
      expect(uploaded.json().storagePath).toMatch(/^s3:\/\/layerpilot-test\/lab\/uploads\//);
      expect(objectStorageAdapter.objects.has(uploaded.json().storageKey)).toBe(true);

      const readiness = await app.inject({ method: "GET", url: "/api/readiness" });
      expect(readiness.statusCode).toBe(200);
      expect(readiness.json().checks.find((check) => check.name === "storage")).toMatchObject({ ok: true, detail: "s3://layerpilot-test/lab" });

      const downloaded = await app.inject({ method: "GET", url: `/api/files/${uploaded.json().id}/download`, headers: auth(token) });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.headers["content-disposition"]).toContain("s3-store.stl");
      expect(downloaded.body).toContain("solid s3_store");

      const exported = await app.inject({ method: "GET", url: "/api/admin/export?includeFiles=true", headers: auth(token) });
      expect(exported.statusCode).toBe(200);
      const payload = exported.json().filePayloads.find((item) => item.fileId === uploaded.json().id);
      expect(payload).toMatchObject({ originalPath: uploaded.json().storageKey, size: Buffer.byteLength(stl) });

      const deleted = await app.inject({ method: "DELETE", url: `/api/files/${uploaded.json().id}`, headers: auth(token) });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toMatchObject({ ok: true, removedStorage: true });
      expect(objectStorageAdapter.objects.has(uploaded.json().storageKey)).toBe(false);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.some((file) => file.id === uploaded.json().id)).toBe(false);
    }, { objectStorageAdapter });
  });

  it("runs backend slicer jobs, stores G-code output, and updates file metadata", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const sliced = await app.inject({
        method: "POST",
        url: "/api/slicer/jobs",
        headers: auth(token),
        payload: { fileId: "f2", printerId: "p1", material: "PETG", layerHeight: "0.16", infill: 22, supports: true }
      });
      expect(sliced.statusCode).toBe(201);
      expect(sliced.json().job).toMatchObject({ fileId: "f2", printerId: "p1", status: "complete", engine: "internal", profileId: "prof-2", profile: "0.20mm Production" });
      expect(sliced.json().file).toMatchObject({ id: "f2", type: "GCODE", sliced: true, status: "sliced", material: "PETG", layerHeight: "0.16" });
      expect(sliced.json().file.storagePath).toMatch(/\.gcode$/);
      const gcode = await readFile(sliced.json().file.storagePath, "utf8");
      expect(gcode).toContain("Generated by 3DSTU FarmFlow internal slicer adapter");
      expect(gcode).toContain("Profile: 0.20mm Production");
      expect(gcode).toContain("Material: PETG");

      const listed = await app.inject({ method: "GET", url: "/api/slicer/jobs", headers: auth(token) });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()[0]).toMatchObject({ id: sliced.json().job.id, status: "complete" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.slicerJobs.some((job) => job.id === sliced.json().job.id && job.outputPath)).toBe(true);
      expect(persisted.files.find((file) => file.id === "f2")).toMatchObject({ type: "GCODE", sliced: true, status: "sliced" });
      expect(persisted.events.some((event) => event.type === "slicer.completed" && event.data.slicerJobId === sliced.json().job.id)).toBe(true);
    });
  });

  it("replays idempotent slicer job retries without duplicate artifacts or version increments", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const payload = { fileId: "f2", printerId: "p1", material: "PETG", layerHeight: "0.16", infill: 22, supports: true };
      const headers = { ...auth(token), "idempotency-key": "slicer-job-retry-001" };

      const first = await app.inject({ method: "POST", url: "/api/slicer/jobs", headers, payload });
      expect(first.statusCode).toBe(201);
      const replay = await app.inject({ method: "POST", url: "/api/slicer/jobs", headers, payload });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json().job.id).toBe(first.json().job.id);
      expect(replay.json().job.outputPath).toBe(first.json().job.outputPath);
      expect(replay.json().file.version).toBe(first.json().file.version);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/slicer/jobs",
        headers,
        payload: { ...payload, infill: 35 }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.slicerJobs.filter((job) => job.fileId === "f2")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "slicer.completed" && event.data?.fileId === "f2")).toHaveLength(1);
      expect(persisted.files.find((file) => file.id === "f2")).toMatchObject({ version: 3, storagePath: first.json().file.storagePath });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "slicer-job-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/slicer/jobs",
        replayCount: 1,
        statusCode: 201
      });
    });
  });

  it("replays idempotent quick file-slice retries without duplicate slicer events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "file-slice-retry-001" };

      const first = await app.inject({ method: "PATCH", url: "/api/files/f3/slice", headers });
      expect(first.statusCode).toBe(200);
      const replay = await app.inject({ method: "PATCH", url: "/api/files/f3/slice", headers });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json().version).toBe(first.json().version);
      expect(replay.json().storagePath).toBe(first.json().storagePath);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.slicerJobs.filter((job) => job.fileId === "f3")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "file.sliced" && event.data?.fileId === "f3")).toHaveLength(1);
      expect(persisted.files.find((file) => file.id === "f3")).toMatchObject({ version: 2, storagePath: first.json().storagePath });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "file-slice-retry-001")).toMatchObject({
        method: "PATCH",
        path: "/api/files/f3/slice",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("schedules queue jobs and updates derived todos", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const scheduled = await app.inject({ method: "PATCH", url: "/api/queue/q2/schedule", headers: auth(token), payload: { printerId: "p2", scheduledStart: "13:00" } });
      expect(scheduled.statusCode).toBe(200);
      expect(scheduled.json().job).toMatchObject({ id: "q2", printerId: "p2", stage: "scheduled", reservedSpoolId: "s2", reservedGrams: 42 });
      expect(scheduled.json().materialReservation).toMatchObject({ spoolId: "s2", grams: 42, status: "reserved" });
      expect(scheduled.json().warnings).toEqual(expect.arrayContaining(["Material conflict", "Due date risk"]));

      const todos = await app.inject({ method: "GET", url: "/api/todos", headers: auth(token) });
      expect(todos.statusCode).toBe(200);
      expect(todos.json().some((todo) => todo.id === "q2-schedule")).toBe(false);
      expect(todos.json().some((todo) => todo.id === "q2-material")).toBe(true);
      expect(todos.json().some((todo) => todo.kind === "slicing")).toBe(true);

      const diagnostics = await app.inject({ method: "GET", url: "/api/schedule/diagnostics", headers: auth(token) });
      expect(diagnostics.statusCode).toBe(200);
      expect(diagnostics.json().lanes.some((lane) => lane.jobs.some((job) => job.jobId === "q2" && job.warnings.includes("Material conflict")))).toBe(true);

      const completed = await app.inject({ method: "PATCH", url: "/api/queue/q2/status", headers: auth(token), payload: { status: "complete" } });
      expect(completed.statusCode).toBe(200);
      expect(completed.json().materialChange).toMatchObject({ spoolId: "s2", grams: 42, remaining: 276 });
      expect(completed.json().job.materialReservation).toMatchObject({ spoolId: "s2", grams: 42, status: "consumed" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.find((spool) => spool.id === "s2")).toMatchObject({ remaining: 276, reserved: 0 });
      expect(persisted.events.some((event) => event.type === "queue.status" && event.data.materialChange?.spoolId === "s2")).toBe(true);
    });
  });

  it("auto schedules queued work by material, volume, due risk, and load", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const result = await app.inject({
        method: "POST",
        url: "/api/schedule/auto",
        headers: auth(token),
        payload: { includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 480 }
      });
      expect(result.statusCode).toBe(200);
      expect(result.json().scheduled).toEqual(expect.arrayContaining([
        expect.objectContaining({ jobId: "q2", printerId: "p3", scheduledStart: "08:45" })
      ]));
      expect(result.json().scheduled.find((item) => item.jobId === "q2").warnings).toEqual(expect.arrayContaining(["Printer busy", "Due date risk"]));
      expect(result.json().scheduled.find((item) => item.jobId === "q2").warnings).not.toContain("Material conflict");
      expect(result.json().jobs.find((job) => job.id === "q2")).toMatchObject({ stage: "scheduled", printerId: "p3", reservedSpoolId: "s2", reservedGrams: 42 });
      expect(result.json().todos.some((todo) => todo.id === "q2-schedule")).toBe(false);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === "q2")).toMatchObject({ stage: "scheduled", printerId: "p3", scheduledStart: "08:45" });
      expect(persisted.spools.find((spool) => spool.id === "s2")).toMatchObject({ reserved: 42 });
    });
  });

  it("replays idempotent scheduler writes without duplicating scheduling events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "schedule-auto-retry-001" };
      const payload = { includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 480 };
      const first = await app.inject({ method: "POST", url: "/api/schedule/auto", headers, payload });
      const replay = await app.inject({ method: "POST", url: "/api/schedule/auto", headers, payload });
      const conflict = await app.inject({ method: "POST", url: "/api/schedule/auto", headers, payload: { ...payload, startMinute: 540 } });
      expect(first.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });
      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "queue.auto_scheduled")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "schedule-auto-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/schedule/auto",
        statusCode: 200,
        replayCount: 1
      });
    });

    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(token),
        payload: { fileId: "f2", file: "Batch PETG retry.3mf", material: "PETG", color: "Orange", due: "Today 17:00", dimensions: [80, 60, 30], time: "1h 20m", cost: 28 }
      });
      expect(created.statusCode).toBe(201);
      const headers = { ...auth(token), "idempotency-key": "schedule-optimize-retry-001" };
      const payload = { strategy: "material-color", includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 };
      const first = await app.inject({ method: "POST", url: "/api/schedule/optimize", headers, payload });
      const replay = await app.inject({ method: "POST", url: "/api/schedule/optimize", headers, payload });
      expect(first.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());
      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "queue.optimized" && event.data?.strategy === "material-color")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "schedule-optimize-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/schedule/optimize",
        statusCode: 200,
        replayCount: 1
      });
    });

    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "schedule-constraint-retry-001" };
      const payload = { objective: "changeover-min", includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 };
      const first = await app.inject({ method: "POST", url: "/api/schedule/constraint", headers, payload });
      const replay = await app.inject({ method: "POST", url: "/api/schedule/constraint", headers, payload });
      expect(first.statusCode).toBe(200);
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());
      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "queue.constraint_scheduled" && event.data?.objective === "changeover-min")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "schedule-constraint-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/schedule/constraint",
        statusCode: 200,
        replayCount: 1
      });
    });
  });

  it("optimizes schedules by material/color batches and load balance", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const jobs = [
        { fileId: "f2", file: "Batch PETG orange A.3mf", material: "PETG", color: "Orange", due: "Today 17:00", dimensions: [80, 60, 30], time: "1h 20m", cost: 28 },
        { fileId: "f2", file: "Batch PETG orange B.3mf", material: "PETG", color: "Orange", due: "Today 17:30", dimensions: [70, 60, 30], time: "1h 10m", cost: 24 },
        { fileId: "f3", file: "PLA classroom tray.3mf", material: "PLA", color: "Black", due: "Tomorrow 09:00", dimensions: [120, 80, 20], time: "2h 00m", cost: 35 }
      ];
      for (const job of jobs) {
        const created = await app.inject({ method: "POST", url: "/api/queue", headers: auth(token), payload: job });
        expect(created.statusCode).toBe(201);
      }

      const materialColor = await app.inject({
        method: "POST",
        url: "/api/schedule/optimize",
        headers: auth(token),
        payload: { strategy: "material-color", includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 }
      });
      expect(materialColor.statusCode).toBe(200);
      expect(materialColor.json()).toMatchObject({ strategy: "material-color" });
      expect(materialColor.json().scheduled.length).toBeGreaterThanOrEqual(3);
      expect(materialColor.json().scheduled.filter((job) => job.material === "PETG" && job.color === "Orange").length).toBeGreaterThanOrEqual(2);

      const loadBalance = await app.inject({
        method: "POST",
        url: "/api/schedule/optimize",
        headers: auth(token),
        payload: { strategy: "load-balance", includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 9 * 60 }
      });
      expect(loadBalance.statusCode).toBe(200);
      expect(loadBalance.json()).toMatchObject({ strategy: "load-balance" });
      expect(loadBalance.json().diagnostics.lanes.length).toBeGreaterThan(0);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.some((job) => job.optimizationStrategy === "load-balance" && job.scheduledStart)).toBe(true);
      expect(persisted.events.some((event) => event.type === "queue.optimized" && event.data.strategy === "material-color")).toBe(true);
      expect(persisted.events.some((event) => event.type === "queue.optimized" && event.data.strategy === "load-balance")).toBe(true);
    });
  });

  it("solves constraint schedules and keeps dry runs side-effect free", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const jobs = [
        { fileId: "f2", file: "Urgent PETG bracket.3mf", material: "PETG", color: "Orange", due: "Today 15:00", dimensions: [85, 60, 35], time: "1h 05m", cost: 31, priority: "Rush" },
        { fileId: "f3", file: "Classroom PLA tray.stl", material: "PLA", color: "Black", due: "Tomorrow 09:00", dimensions: [150, 90, 18], time: "1h 40m", cost: 34, priority: "Normal" }
      ];
      for (const job of jobs) {
        const created = await app.inject({ method: "POST", url: "/api/queue", headers: auth(token), payload: job });
        expect(created.statusCode).toBe(201);
      }

      const dryRun = await app.inject({
        method: "POST",
        url: "/api/schedule/constraint",
        headers: auth(token),
        payload: { objective: "due-risk", dryRun: true, includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 }
      });
      expect(dryRun.statusCode).toBe(200);
      expect(dryRun.json().solver).toMatchObject({ engine: "javascript-lp-solver", objective: "due-risk", feasible: true });
      expect(dryRun.json().scheduled.length).toBeGreaterThanOrEqual(3);
      expect(dryRun.json().scheduled.every((item) => !item.warnings.includes("Material conflict") && !item.warnings.includes("Size mismatch"))).toBe(true);
      let persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === "q2")).toMatchObject({ stage: "needs scheduling" });
      expect(persisted.events.some((event) => event.type === "queue.constraint_scheduled")).toBe(false);

      const committed = await app.inject({
        method: "POST",
        url: "/api/schedule/constraint",
        headers: auth(token),
        payload: { objective: "changeover-min", includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 }
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toMatchObject({ strategy: "constraint-changeover-min", dryRun: false });
      expect(committed.json().solver).toMatchObject({ objective: "changeover-min", feasible: true });
      expect(committed.json().jobs.length).toBe(committed.json().scheduled.length);

      persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === "q2")).toMatchObject({ stage: "scheduled", solverObjective: "changeover-min" });
      expect(persisted.queue.some((job) => job.optimizationStrategy === "constraint-changeover-min" && job.scheduledStart)).toBe(true);
      expect(persisted.events.some((event) => event.type === "queue.constraint_scheduled" && event.data.objective === "changeover-min")).toBe(true);
    });
  });

  it("creates queue jobs and persists status and priority updates", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(token),
        payload: {
          fileId: "f2",
          file: "Camera mount.3mf",
          material: "PETG",
          dimensions: [92, 68, 56],
          time: "1h 42m",
          cost: 38
        }
      });
      expect(created.statusCode).toBe(201);
      const jobId = created.json().job.id;
      expect(created.json().job).toMatchObject({ file: "Camera mount.3mf", status: "queued", priority: "Normal" });

      const priority = await app.inject({ method: "PATCH", url: `/api/queue/${jobId}/priority`, headers: auth(token), payload: { priority: "Rush" } });
      expect(priority.statusCode).toBe(200);
      expect(priority.json().job).toMatchObject({ id: jobId, priority: "Rush" });

      const status = await app.inject({ method: "PATCH", url: `/api/queue/${jobId}/status`, headers: auth(token), payload: { status: "complete" } });
      expect(status.statusCode).toBe(200);
      expect(status.json().job).toMatchObject({ id: jobId, status: "complete", stage: "post processing" });
      expect(status.json().todos.some((todo) => todo.id === `${jobId}-post`)).toBe(true);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.some((job) => job.id === jobId && job.status === "complete" && job.priority === "Rush")).toBe(true);
    });
  });

  it("dry-runs and commits queue matching into active production slots", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const queued = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(token),
        payload: { fileId: "f2", file: "Queue match fixture.3mf", material: "Resin", color: "Gray", due: "Today 17:00", dimensions: [90, 60, 40], time: "1h 15m", cost: 31, priority: "Rush" }
      });
      expect(queued.statusCode).toBe(201);
      const jobId = queued.json().job.id;

      const dryRun = await app.inject({
        method: "POST",
        url: "/api/queue/match",
        headers: auth(token),
        payload: { dryRun: true, maxActiveSlots: 3, respectMaterial: true, respectBuildVolume: true }
      });
      expect(dryRun.statusCode).toBe(200);
      expect(dryRun.json()).toMatchObject({ dryRun: true });
      expect(dryRun.json().matches.some((match) => match.jobId === jobId)).toBe(true);

      let persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === jobId)).toMatchObject({ status: "queued" });

      const committed = await app.inject({
        method: "POST",
        url: "/api/queue/match",
        headers: auth(token),
        payload: { dryRun: false, maxActiveSlots: 3, respectMaterial: true, respectBuildVolume: true }
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toMatchObject({ dryRun: false });
      expect(committed.json().matches.length).toBeGreaterThan(0);
      expect(committed.json().jobs.some((job) => job.status === "printing" && job.stage === "printing")).toBe(true);

      persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const started = persisted.queue.find((job) => job.id === jobId);
      expect(started).toMatchObject({ status: "printing", stage: "printing" });
      expect(persisted.printers.find((printer) => printer.id === started.printerId)).toMatchObject({ status: "printing", job: started.file });
      expect(persisted.events.some((event) => event.type === "queue.matched")).toBe(true);
    });
  });

  it("replays idempotent queue matching commits without duplicating assignment events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const queued = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(token),
        payload: {
          fileId: "f2",
          file: "Queue match retry fixture.3mf",
          material: "Resin",
          color: "Gray",
          due: "Today 18:00",
          dimensions: [90, 60, 40],
          time: "1h 20m",
          cost: 34,
          priority: "Rush"
        }
      });
      expect(queued.statusCode).toBe(201);
      const jobId = queued.json().job.id;
      const headers = { ...auth(token), "idempotency-key": "queue-match-retry-001" };
      const payload = { dryRun: false, maxActiveSlots: 3, respectMaterial: true, respectBuildVolume: true };

      const committed = await app.inject({ method: "POST", url: "/api/queue/match", headers, payload });
      expect(committed.statusCode).toBe(200);
      expect(committed.json().matches.some((match) => match.jobId === jobId)).toBe(true);

      const replay = await app.inject({ method: "POST", url: "/api/queue/match", headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json().matches).toEqual(committed.json().matches);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/queue/match",
        headers,
        payload: { ...payload, maxActiveSlots: 1 }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === jobId)).toMatchObject({ status: "printing", stage: "printing" });
      expect(persisted.events.filter((event) => event.type === "queue.matched")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "queue-match-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/queue/match",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("executes printer actions through persisted API state transitions", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const state = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      const idlePrinter = state.json().printers.find((printer) => printer.status === "idle");
      expect(idlePrinter).toBeTruthy();

      const queued = await app.inject({
        method: "POST",
        url: "/api/queue",
        headers: auth(token),
        payload: {
          fileId: "f2",
          file: "Action transition fixture.3mf",
          printerId: idlePrinter.id,
          material: idlePrinter.compatibleMaterials.includes("Resin") ? "Resin" : "PLA",
          color: "Any",
          due: "Tomorrow 15:00",
          dimensions: [80, 60, 30],
          stage: "scheduled",
          time: "1h 05m",
          cost: 24
        }
      });
      expect(queued.statusCode).toBe(201);

      const start = await app.inject({ method: "POST", url: "/api/actions", headers: auth(token), payload: { printerId: idlePrinter.id, action: "start" } });
      expect(start.statusCode).toBe(200);
      expect(start.json().printer).toMatchObject({ id: idlePrinter.id, status: "printing", job: "Action transition fixture.3mf" });
      expect(start.json().job).toMatchObject({ id: queued.json().job.id, status: "printing", stage: "printing" });

      const pause = await app.inject({ method: "POST", url: "/api/actions", headers: auth(token), payload: { printerId: idlePrinter.id, action: "pause" } });
      expect(pause.statusCode).toBe(200);
      expect(pause.json().printer).toMatchObject({ id: idlePrinter.id, status: "paused" });
      expect(pause.json().job).toMatchObject({ id: queued.json().job.id, status: "paused", stage: "printing" });

      const cancel = await app.inject({ method: "POST", url: "/api/actions", headers: auth(token), payload: { printerId: idlePrinter.id, action: "cancel" } });
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().printer).toMatchObject({ id: idlePrinter.id, status: "idle", progress: 0 });
      expect(cancel.json().job).toMatchObject({ id: queued.json().job.id, status: "cancelled", stage: "blocked" });

      const preheat = await app.inject({ method: "POST", url: "/api/actions", headers: auth(token), payload: { printerId: idlePrinter.id, action: "preheat", targetNozzle: 230, targetBed: 70 } });
      expect(preheat.statusCode).toBe(200);
      expect(preheat.json().printer).toMatchObject({ id: idlePrinter.id, targetNozzle: 230, targetBed: 70 });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === queued.json().job.id)).toMatchObject({ status: "cancelled", stage: "blocked" });
      expect(persisted.printers.find((printer) => printer.id === idlePrinter.id)).toMatchObject({ status: "idle", targetNozzle: 230, targetBed: 70 });
      expect(persisted.events.some((event) => event.type === "printer.action")).toBe(true);
      expect(persisted.events.some((event) => event.type === "mock.action")).toBe(false);
    });
  });

  it("replays idempotent printer actions without sending duplicate bridge commands", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const printer = db.data.printers.find((item) => item.id === "p2");
      printer.status = "printing";
      printer.job = "Bridge retry fixture.gcode";
      printer.progress = 44;
      db.data.queue.push({
        id: "action-retry-job",
        workspaceId: "ws-default",
        fileId: "f2",
        file: "Bridge retry fixture.gcode",
        printerId: printer.id,
        printer: printer.name,
        material: "Resin",
        color: "Any",
        due: "Today 17:00",
        dimensions: [80, 60, 30],
        status: "printing",
        stage: "printing",
        priority: "Normal",
        time: "1h 05m",
        cost: 24
      });
      db.data.bridges.push({
        id: "bridge-action-retry",
        workspaceId: "ws-default",
        printerId: printer.id,
        kind: "octoprint",
        name: "Action Retry Octo",
        baseUrl: "http://octopi.action.test",
        apiKey: "secret",
        enabled: true,
        lastStatus: "connected"
      });
      await db.write();

      const originalFetch = global.fetch;
      const commandCalls = [];
      global.fetch = async (url, init = {}) => {
        commandCalls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
        return { ok: true, status: 204, text: async () => "" };
      };
      try {
        const token = await login(app);
        const headers = { ...auth(token), "idempotency-key": "printer-action-retry-001" };
        const payload = { printerId: printer.id, action: "pause" };

        const first = await app.inject({ method: "POST", url: "/api/actions", headers, payload });
        expect(first.statusCode).toBe(200);
        expect(first.json().printer).toMatchObject({ id: printer.id, status: "paused" });
        expect(first.json().job).toMatchObject({ id: "action-retry-job", status: "paused", stage: "printing" });

        const replay = await app.inject({ method: "POST", url: "/api/actions", headers, payload });
        expect(replay.statusCode).toBe(200);
        expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replay.json()).toEqual(first.json());
        expect(commandCalls).toHaveLength(1);
        expect(commandCalls[0]).toMatchObject({
          url: "http://octopi.action.test/api/job",
          body: { command: "pause", action: "pause" }
        });

        const conflict = await app.inject({
          method: "POST",
          url: "/api/actions",
          headers,
          payload: { printerId: printer.id, action: "resume" }
        });
        expect(conflict.statusCode).toBe(409);
        expect(commandCalls).toHaveLength(1);

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.events.filter((event) => event.type === "printer.action" && event.data?.action === "pause" && event.data?.bridgeId === "bridge-action-retry")).toHaveLength(1);
        expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "printer-action-retry-001")).toMatchObject({
          method: "POST",
          path: "/api/actions",
          replayCount: 1,
          statusCode: 200
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("replays idempotent bridge diagnostics and syncs without duplicate hardware polling", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      const hardwareCalls = [];
      global.fetch = async (url) => {
        hardwareCalls.push(String(url));
        if (String(url).endsWith("/api/printer")) return { ok: true, status: 200, text: async () => JSON.stringify({ state: { text: "Operational" }, temperature: { tool0: { actual: 27, target: 0 }, bed: { actual: 24, target: 0 } } }) };
        if (String(url).endsWith("/api/job")) return { ok: true, status: 200, text: async () => JSON.stringify({ progress: { completion: 0 }, job: { file: { display: "" } } }) };
        return { ok: false, status: 404, text: async () => "{}" };
      };
      try {
        const token = await login(app);
        const saved = await app.inject({
          method: "POST",
          url: "/api/bridges",
          headers: auth(token),
          payload: { printerId: "p2", kind: "octoprint", name: "Retry Safe Octo", baseUrl: "http://octopi.retry.test", apiKey: "secret", enabled: true }
        });
        expect(saved.statusCode).toBe(201);
        const bridgeId = saved.json().id;

        const testHeaders = { ...auth(token), "idempotency-key": "bridge-test-retry-001" };
        const firstTest = await app.inject({ method: "POST", url: `/api/bridges/${bridgeId}/test`, headers: testHeaders, payload: { mode: "diagnostic" } });
        expect(firstTest.statusCode).toBe(200);
        expect(firstTest.json()).toMatchObject({ ok: true, printer: expect.objectContaining({ id: "p2", status: "idle", nozzle: 27, bed: 24 }) });

        const replayTest = await app.inject({ method: "POST", url: `/api/bridges/${bridgeId}/test`, headers: testHeaders, payload: { mode: "diagnostic" } });
        expect(replayTest.statusCode).toBe(200);
        expect(replayTest.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replayTest.json()).toEqual(firstTest.json());
        expect(hardwareCalls).toHaveLength(2);

        const conflictTest = await app.inject({ method: "POST", url: `/api/bridges/${bridgeId}/test`, headers: testHeaders, payload: { mode: "changed" } });
        expect(conflictTest.statusCode).toBe(409);
        expect(hardwareCalls).toHaveLength(2);

        const syncHeaders = { ...auth(token), "idempotency-key": "bridge-sync-retry-001" };
        const firstSync = await app.inject({ method: "POST", url: "/api/bridges/sync", headers: syncHeaders });
        expect(firstSync.statusCode).toBe(200);
        expect(firstSync.json().synced).toEqual(expect.arrayContaining([expect.objectContaining({ bridgeId, printerId: "p2", status: "idle" })]));

        const replaySync = await app.inject({ method: "POST", url: "/api/bridges/sync", headers: syncHeaders });
        expect(replaySync.statusCode).toBe(200);
        expect(replaySync.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replaySync.json()).toEqual(firstSync.json());
        expect(hardwareCalls).toHaveLength(4);

        const printerSyncHeaders = { ...auth(token), "idempotency-key": "printer-sync-retry-001" };
        const firstPrinterSync = await app.inject({ method: "POST", url: "/api/printers/p2/sync", headers: printerSyncHeaders });
        expect(firstPrinterSync.statusCode).toBe(200);
        expect(firstPrinterSync.json()).toMatchObject({ printer: expect.objectContaining({ id: "p2", status: "idle" }) });

        const replayPrinterSync = await app.inject({ method: "POST", url: "/api/printers/p2/sync", headers: printerSyncHeaders });
        expect(replayPrinterSync.statusCode).toBe(200);
        expect(replayPrinterSync.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replayPrinterSync.json()).toEqual(firstPrinterSync.json());
        expect(hardwareCalls).toHaveLength(6);

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.events.filter((event) => event.type === "bridge.connected" && event.data?.bridgeId === bridgeId)).toHaveLength(1);
        expect(persisted.events.filter((event) => event.type === "bridge.poll" && event.data?.synced?.some((item) => item.bridgeId === bridgeId))).toHaveLength(1);
        expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "bridge-test-retry-001")).toMatchObject({
          method: "POST",
          path: `/api/bridges/${bridgeId}/test`,
          replayCount: 1,
          statusCode: 200
        });
        expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "bridge-sync-retry-001")).toMatchObject({
          method: "POST",
          path: "/api/bridges/sync",
          replayCount: 1,
          statusCode: 200
        });
        expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "printer-sync-retry-001")).toMatchObject({
          method: "POST",
          path: "/api/printers/p2/sync",
          replayCount: 1,
          statusCode: 200
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("persists inventory, maintenance, and order operations", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const spool = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(token),
        payload: { material: "PLA", color: "#0ea5e9", brand: "Demo", remaining: 500, weight: 1000, location: "Rack QC", dry: true, nfc: "LP-QC" }
      });
      expect(spool.statusCode).toBe(201);
      expect(spool.json()).toMatchObject({ material: "PLA", remaining: 500, dry: true });

      const usage = await app.inject({ method: "PATCH", url: `/api/spools/${spool.json().id}/usage`, headers: auth(token), payload: { grams: 75 } });
      expect(usage.statusCode).toBe(200);
      expect(usage.json()).toMatchObject({ id: spool.json().id, remaining: 425 });

      const dry = await app.inject({ method: "PATCH", url: `/api/spools/${spool.json().id}`, headers: auth(token), payload: { dry: false } });
      expect(dry.statusCode).toBe(200);
      expect(dry.json()).toMatchObject({ id: spool.json().id, dry: false });

      const labels = await app.inject({
        method: "POST",
        url: "/api/spools/labels",
        headers: auth(token),
        payload: { ids: [spool.json().id] }
      });
      expect(labels.statusCode).toBe(200);
      expect(labels.json()).toMatchObject({ count: 1 });
      expect(labels.json().csv).toContain("LP-QC");
      expect(labels.json().html).toContain("3DSTU FarmFlow spool labels");

      const scanned = await app.inject({
        method: "POST",
        url: "/api/spools/scan",
        headers: auth(token),
        payload: { code: "LP-QC", grams: 20, location: "Printer Bay" }
      });
      expect(scanned.statusCode).toBe(200);
      expect(scanned.json()).toMatchObject({ matchedBy: "nfc", usageLogged: 20, spool: { id: spool.json().id, remaining: 405, location: "Printer Bay" } });

      await app.inject({ method: "PATCH", url: `/api/spools/${spool.json().id}/usage`, headers: auth(token), payload: { grams: 260 } });
      const reorderPlan = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests/reorderPlan",
        headers: auth(token),
        payload: { thresholdGrams: 250, targetGrams: 1000, quantity: 2, supplier: "QC Supplier" }
      });
      expect(reorderPlan.statusCode).toBe(200);
      expect(reorderPlan.json().created).toHaveLength(1);
      expect(reorderPlan.json().created[0]).toMatchObject({ spoolId: spool.json().id, material: "PLA", quantity: 2, supplier: "QC Supplier", status: "open" });

      const ordered = await app.inject({ method: "PATCH", url: `/api/purchaseRequests/${reorderPlan.json().created[0].id}`, headers: auth(token), payload: { status: "ordered" } });
      expect(ordered.statusCode).toBe(200);
      expect(ordered.json()).toMatchObject({ status: "ordered" });

      const received = await app.inject({
        method: "POST",
        url: `/api/purchaseRequests/${ordered.json().id}/receive`,
        headers: auth(token),
        payload: { location: "Rack Receiving QC", nfcPrefix: "LP-QC-PLA" }
      });
      expect(received.statusCode).toBe(200);
      expect(received.json().spools).toHaveLength(2);
      expect(received.json().request).toMatchObject({ status: "received", receivedSpoolIds: received.json().spools.map((item) => item.id) });
      expect(received.json().inventory.some((item) => item.purchaseRequestId === ordered.json().id && item.location === "Rack Receiving QC")).toBe(true);

      const maintenance = await app.inject({
        method: "POST",
        url: "/api/maintenance",
        headers: auth(token),
        payload: { title: "Rail clean", printer: "Forge A1", status: "scheduled", due: "Friday", progress: "0/3", severity: "High" }
      });
      expect(maintenance.statusCode).toBe(201);

      const completed = await app.inject({ method: "PATCH", url: `/api/maintenance/${maintenance.json().id}`, headers: auth(token), payload: { status: "done", progress: "Complete" } });
      expect(completed.statusCode).toBe(200);
      expect(completed.json()).toMatchObject({ status: "done", progress: "Complete" });

      const template = await app.inject({
        method: "POST",
        url: "/api/maintenance/templates",
        headers: auth(token),
        payload: { title: "QC motion service", printerModel: "FDM fleet", intervalDays: 45, tasks: ["Inspect belts", "Lubricate rails"], severity: "Medium" }
      });
      expect(template.statusCode).toBe(201);
      expect(template.json().template).toMatchObject({ title: "QC motion service", intervalDays: 45 });

      const report = await app.inject({
        method: "POST",
        url: "/api/maintenance/reports",
        headers: auth(token),
        payload: { title: "QC layer shift", printer: "Forge A1", description: "Layer shift on batch job", severity: "High", createJob: true }
      });
      expect(report.statusCode).toBe(201);
      expect(report.json().report).toMatchObject({ title: "QC layer shift", status: "open", linkedJobId: report.json().job.id });
      expect(report.json().job).toMatchObject({ title: "QC layer shift", printer: "Forge A1", severity: "High", reportId: report.json().report.id });

      const order = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: auth(token),
        payload: { source: "Shopify", customer: "QC Customer", items: ["DUCT-KIT-BLK x1"], status: "received", due: "Jun 20", value: 680 }
      });
      expect(order.statusCode).toBe(201);
      expect(order.json()).toMatchObject({ customer: "QC Customer", status: "received" });

      const shipped = await app.inject({ method: "PATCH", url: `/api/orders/${order.json().id}/status`, headers: auth(token), payload: { status: "shipped" } });
      expect(shipped.statusCode).toBe(200);
      expect(shipped.json()).toMatchObject({ id: order.json().id, status: "shipped" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.find((item) => item.id === spool.json().id)).toMatchObject({ remaining: 145, dry: false, location: "Printer Bay" });
      expect(persisted.events.some((event) => event.type === "spool.labels_generated")).toBe(true);
      expect(persisted.events.some((event) => event.type === "spool.scanned_usage")).toBe(true);
      expect(persisted.events.some((event) => event.type === "purchase_request.received")).toBe(true);
      const spoolCreatedEvent = persisted.events.find((event) => event.type === "spool.created" && event.data?.spoolId === spool.json().id);
      expect(spoolCreatedEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          actorEmail: "demo@layerpilot.test",
          actorRole: "Admin",
          spoolId: spool.json().id,
          material: "PLA",
          location: "Rack QC"
        }
      });
      const spoolUpdatedEvent = persisted.events.find((event) => event.type === "spool.updated" && event.data?.spoolId === spool.json().id);
      expect(spoolUpdatedEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          actorEmail: "demo@layerpilot.test",
          actorRole: "Admin",
          spoolId: spool.json().id,
          remaining: 425,
          dry: false
        }
      });
      expect(persisted.maintenance.find((item) => item.id === maintenance.json().id)).toMatchObject({ status: "done" });
      expect(persisted.maintenanceTemplates.find((item) => item.id === template.json().template.id)).toMatchObject({ title: "QC motion service" });
      expect(persisted.maintenanceReports.find((item) => item.id === report.json().report.id)).toMatchObject({ linkedJobId: report.json().job.id });
      expect(persisted.events.some((event) => event.type === "maintenance_report.created")).toBe(true);
      const maintenanceCreatedEvent = persisted.events.find((event) => event.type === "maintenance.created" && event.data?.maintenanceId === maintenance.json().id);
      expect(maintenanceCreatedEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          actorEmail: "demo@layerpilot.test",
          actorRole: "Admin",
          maintenanceId: maintenance.json().id,
          printer: "Forge A1",
          status: "scheduled",
          severity: "High"
        }
      });
      const maintenanceUpdatedEvent = persisted.events.find((event) => event.type === "maintenance.updated" && event.data?.maintenanceId === maintenance.json().id);
      expect(maintenanceUpdatedEvent).toMatchObject({
        workspaceId: "ws-default",
        data: {
          workspaceId: "ws-default",
          actorEmail: "demo@layerpilot.test",
          actorRole: "Admin",
          maintenanceId: maintenance.json().id,
          status: "done",
          progress: "Complete"
        }
      });
      expect(persisted.orders.find((item) => item.id === order.json().id)).toMatchObject({ status: "shipped" });
    });
  });

  it("replays idempotent spool label exports without duplicating inventory audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const spool = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(token),
        payload: { material: "PLA", color: "#22c55e", brand: "Label Retry", remaining: 640, weight: 1000, location: "Rack Label", dry: true, nfc: "LP-LABEL-RETRY" }
      });
      expect(spool.statusCode).toBe(201);

      const headers = { ...auth(token), "idempotency-key": "spool-labels-retry-001" };
      const payload = { ids: [spool.json().id] };
      const first = await app.inject({ method: "POST", url: "/api/spools/labels", headers, payload });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ count: 1 });
      expect(first.json().csv).toContain("LP-LABEL-RETRY");

      const replay = await app.inject({ method: "POST", url: "/api/spools/labels", headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/spools/labels",
        headers,
        payload: { ids: [spool.json().id], includeEmpty: true }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "spool.labels_generated" && event.data?.spoolIds?.includes(spool.json().id))).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "spool-labels-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/spools/labels",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent spool metadata updates without duplicate inventory audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const spool = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(token),
        payload: { material: "PETG", color: "#14b8a6", brand: "Metadata Retry", remaining: 700, weight: 1000, location: "Rack Old", dry: true, nfc: "LP-SPOOL-PATCH-RETRY" }
      });
      expect(spool.statusCode).toBe(201);

      const headers = { ...auth(token), "idempotency-key": "spool-patch-retry-001" };
      const payload = { location: "Rack Retry", dry: false, remaining: 680 };
      const first = await app.inject({ method: "PATCH", url: `/api/spools/${spool.json().id}`, headers, payload });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ id: spool.json().id, location: "Rack Retry", dry: false, remaining: 680 });

      const replay = await app.inject({ method: "PATCH", url: `/api/spools/${spool.json().id}`, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: `/api/spools/${spool.json().id}`,
        headers,
        payload: { ...payload, remaining: 650 }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "spool.updated" && event.message.includes("Metadata Retry"))).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "spool-patch-retry-001")).toMatchObject({
        method: "PATCH",
        path: `/api/spools/${spool.json().id}`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent maintenance job updates without duplicate maintenance audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const maintenance = await app.inject({
        method: "POST",
        url: "/api/maintenance",
        headers: auth(token),
        payload: { title: "Retry nozzle service", printer: "Forge Retry", status: "scheduled", due: "Monday", progress: "0/2", severity: "Medium" }
      });
      expect(maintenance.statusCode).toBe(201);

      const headers = { ...auth(token), "idempotency-key": "maintenance-patch-retry-001" };
      const payload = { status: "in progress", progress: "1/2" };
      const first = await app.inject({ method: "PATCH", url: `/api/maintenance/${maintenance.json().id}`, headers, payload });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ id: maintenance.json().id, status: "in progress", progress: "1/2" });

      const replay = await app.inject({ method: "PATCH", url: `/api/maintenance/${maintenance.json().id}`, headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: `/api/maintenance/${maintenance.json().id}`,
        headers,
        payload: { ...payload, progress: "2/2" }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "maintenance.updated" && event.message.includes("Retry nozzle service"))).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "maintenance-patch-retry-001")).toMatchObject({
        method: "PATCH",
        path: `/api/maintenance/${maintenance.json().id}`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent purchase reorder plans without creating duplicate requests", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const spool = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(token),
        payload: { material: "PETG", color: "#f97316", brand: "Retry", remaining: 120, weight: 1000, location: "Rack Retry", dry: true, nfc: "LP-REORDER" }
      });
      expect(spool.statusCode).toBe(201);
      const headers = { ...auth(token), "idempotency-key": "purchase-reorder-retry-001" };
      const payload = { thresholdGrams: 250, targetGrams: 1200, quantity: 3, supplier: "Retry Supplier" };

      const planned = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests/reorderPlan",
        headers,
        payload
      });
      expect(planned.statusCode).toBe(200);
      expect(planned.json().created).toHaveLength(1);

      const replay = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests/reorderPlan",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(planned.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests/reorderPlan",
        headers,
        payload: { ...payload, quantity: 1 }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.purchaseRequests.filter((request) => request.spoolId === spool.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "purchase_request.reorder_plan")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "purchase-reorder-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/purchaseRequests/reorderPlan",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent purchase request writes without duplicate records or update events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const createHeaders = { ...auth(token), "idempotency-key": "purchase-request-create-retry-001" };
      const createPayload = { material: "ASA", color: "Black", brand: "Retry", quantity: 2, targetGrams: 1000, supplier: "Retry Supplier", status: "open", due: "Friday" };

      const created = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests",
        headers: createHeaders,
        payload: createPayload
      });
      expect(created.statusCode).toBe(201);

      const createReplay = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests",
        headers: createHeaders,
        payload: createPayload
      });
      expect(createReplay.statusCode).toBe(201);
      expect(createReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(createReplay.json()).toEqual(created.json());

      const createConflict = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests",
        headers: createHeaders,
        payload: { ...createPayload, quantity: 3 }
      });
      expect(createConflict.statusCode).toBe(409);

      const updateHeaders = { ...auth(token), "idempotency-key": "purchase-request-update-retry-001" };
      const updatePayload = { status: "ordered", due: "Next week" };
      const updated = await app.inject({
        method: "PATCH",
        url: `/api/purchaseRequests/${created.json().id}`,
        headers: updateHeaders,
        payload: updatePayload
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject(updatePayload);

      const updateReplay = await app.inject({
        method: "PATCH",
        url: `/api/purchaseRequests/${created.json().id}`,
        headers: updateHeaders,
        payload: updatePayload
      });
      expect(updateReplay.statusCode).toBe(200);
      expect(updateReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(updateReplay.json()).toEqual(updated.json());

      const updateConflict = await app.inject({
        method: "PATCH",
        url: `/api/purchaseRequests/${created.json().id}`,
        headers: updateHeaders,
        payload: { status: "cancelled" }
      });
      expect(updateConflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.purchaseRequests.filter((request) => request.supplier === "Retry Supplier")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "purchase_request.created" && event.data?.purchaseRequestId === created.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "purchase_request.updated" && event.data?.purchaseRequestId === created.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "purchase-request-create-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/purchaseRequests",
        replayCount: 1,
        statusCode: 201
      });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "purchase-request-update-retry-001")).toMatchObject({
        method: "PATCH",
        path: `/api/purchaseRequests/${created.json().id}`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent spool creation without adding duplicate inventory", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "spool-create-retry-001" };
      const payload = { material: "PLA", color: "#22c55e", brand: "Retry", remaining: 750, weight: 1000, location: "Rack Retry", dry: true, nfc: "LP-SPOOL-RETRY" };

      const created = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers,
        payload
      });
      expect(created.statusCode).toBe(201);

      const replay = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(created.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers,
        payload: { ...payload, nfc: "LP-SPOOL-RETRY-CHANGED" }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.filter((spool) => spool.nfc === "LP-SPOOL-RETRY")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "spool.created" && event.message.includes("Retry"))).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "spool-create-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/spools",
        replayCount: 1,
        statusCode: 201
      });
    });
  });

  it("replays idempotent spool usage writes without double-consuming filament", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const spool = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(token),
        payload: { material: "PETG", color: "#0ea5e9", brand: "Retry", remaining: 600, weight: 1000, location: "Rack Usage", dry: true, nfc: "LP-USAGE-RETRY" }
      });
      expect(spool.statusCode).toBe(201);
      const headers = { ...auth(token), "idempotency-key": "spool-usage-retry-001" };
      const payload = { grams: 80 };

      const usage = await app.inject({
        method: "PATCH",
        url: `/api/spools/${spool.json().id}/usage`,
        headers,
        payload
      });
      expect(usage.statusCode).toBe(200);
      expect(usage.json()).toMatchObject({ remaining: 520 });

      const replay = await app.inject({
        method: "PATCH",
        url: `/api/spools/${spool.json().id}/usage`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(usage.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: `/api/spools/${spool.json().id}/usage`,
        headers,
        payload: { grams: 120 }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.find((item) => item.id === spool.json().id)).toMatchObject({ remaining: 520 });
      expect(persisted.events.filter((event) => event.type === "spool.usage" && event.data?.spoolId === spool.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "spool-usage-retry-001")).toMatchObject({
        method: "PATCH",
        path: `/api/spools/${spool.json().id}/usage`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent spool scan usage without double-consuming filament", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const spool = await app.inject({
        method: "POST",
        url: "/api/spools",
        headers: auth(token),
        payload: { material: "ASA", color: "Black", brand: "Retry", remaining: 900, weight: 1000, location: "Rack Scan", dry: true, nfc: "LP-SCAN-RETRY" }
      });
      expect(spool.statusCode).toBe(201);
      const headers = { ...auth(token), "idempotency-key": "spool-scan-retry-001" };
      const payload = { code: "LP-SCAN-RETRY", grams: 150, location: "Printer Bay Retry" };

      const scanned = await app.inject({
        method: "POST",
        url: "/api/spools/scan",
        headers,
        payload
      });
      expect(scanned.statusCode).toBe(200);
      expect(scanned.json()).toMatchObject({ usageLogged: 150, spool: { id: spool.json().id, remaining: 750, location: "Printer Bay Retry" } });

      const replay = await app.inject({
        method: "POST",
        url: "/api/spools/scan",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(scanned.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/spools/scan",
        headers,
        payload: { ...payload, grams: 50 }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.find((item) => item.id === spool.json().id)).toMatchObject({ remaining: 750, location: "Printer Bay Retry" });
      expect(persisted.events.filter((event) => event.type === "spool.scanned_usage" && event.data?.spoolId === spool.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "spool-scan-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/spools/scan",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent purchase receives without creating duplicate spools", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/purchaseRequests",
        headers: auth(token),
        payload: { material: "ASA", color: "Black", brand: "Retry", quantity: 2, targetGrams: 1000, supplier: "Retry Supplier", status: "ordered", due: "This week" }
      });
      expect(created.statusCode).toBe(201);
      const headers = { ...auth(token), "idempotency-key": "purchase-receive-retry-001" };
      const payload = { location: "Rack Receive Retry", nfcPrefix: "LP-ASA-RETRY" };

      const received = await app.inject({
        method: "POST",
        url: `/api/purchaseRequests/${created.json().id}/receive`,
        headers,
        payload
      });
      expect(received.statusCode).toBe(200);
      expect(received.json().spools).toHaveLength(2);

      const replay = await app.inject({
        method: "POST",
        url: `/api/purchaseRequests/${created.json().id}/receive`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(received.json());

      const conflict = await app.inject({
        method: "POST",
        url: `/api/purchaseRequests/${created.json().id}/receive`,
        headers,
        payload: { ...payload, location: "Different Rack" }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.filter((spool) => spool.purchaseRequestId === created.json().id)).toHaveLength(2);
      expect(persisted.purchaseRequests.find((request) => request.id === created.json().id)).toMatchObject({
        status: "received",
        receivedSpoolIds: received.json().spools.map((spool) => spool.id)
      });
      expect(persisted.events.filter((event) => event.type === "purchase_request.received" && event.data?.purchaseRequestId === created.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "purchase-receive-retry-001")).toMatchObject({
        method: "POST",
        path: `/api/purchaseRequests/${created.json().id}/receive`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent maintenance job creation without adding duplicate jobs", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "maintenance-job-retry-001" };
      const payload = { title: "Retry rail service", printer: "Forge R1", status: "scheduled", due: "Monday", progress: "0/3", severity: "High" };

      const created = await app.inject({
        method: "POST",
        url: "/api/maintenance",
        headers,
        payload
      });
      expect(created.statusCode).toBe(201);

      const replay = await app.inject({
        method: "POST",
        url: "/api/maintenance",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(created.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/maintenance",
        headers,
        payload: { ...payload, printer: "Forge R2" }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.maintenance.filter((item) => item.title === "Retry rail service")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "maintenance.created" && event.message.includes("Retry rail service"))).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "maintenance-job-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/maintenance",
        statusCode: 201,
        replayCount: 1
      });
    });
  });

  it("replays idempotent maintenance template saves without duplicate update events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "maintenance-template-retry-001" };
      const payload = { title: "Retry motion service", printerModel: "FDM fleet", intervalDays: 30, tasks: ["Inspect belts", "Lubricate rails"], severity: "Medium" };

      const created = await app.inject({
        method: "POST",
        url: "/api/maintenance/templates",
        headers,
        payload
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ created: true, template: { title: "Retry motion service" } });

      const replay = await app.inject({
        method: "POST",
        url: "/api/maintenance/templates",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(created.json());

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.maintenanceTemplates.filter((item) => item.title === "Retry motion service")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "maintenance_template.created" && event.message.includes("Retry motion service"))).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "maintenance_template.updated" && event.message.includes("Retry motion service"))).toHaveLength(0);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "maintenance-template-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/maintenance/templates",
        statusCode: 201,
        replayCount: 1
      });
    });
  });

  it("replays idempotent maintenance reports without duplicate linked jobs", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "maintenance-report-retry-001" };
      const payload = { title: "Retry hotend clog", printer: "Forge R3", description: "No extrusion during startup", severity: "High", createJob: true };

      const reported = await app.inject({
        method: "POST",
        url: "/api/maintenance/reports",
        headers,
        payload
      });
      expect(reported.statusCode).toBe(201);
      expect(reported.json().report).toMatchObject({ title: "Retry hotend clog", linkedJobId: reported.json().job.id });

      const replay = await app.inject({
        method: "POST",
        url: "/api/maintenance/reports",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(reported.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/maintenance/reports",
        headers,
        payload: { ...payload, createJob: false }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.maintenanceReports.filter((item) => item.title === "Retry hotend clog")).toHaveLength(1);
      expect(persisted.maintenance.filter((item) => item.title === "Retry hotend clog")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "maintenance_report.created" && event.message.includes("Retry hotend clog"))).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "maintenance-report-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/maintenance/reports",
        statusCode: 201,
        replayCount: 1
      });
    });
  });

  it("persists catalog records and generates order jobs from SKU-linked parts", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const token = await login(app);
      const part = await app.inject({
        method: "POST",
        url: "/api/parts",
        headers: auth(token),
        payload: { name: "QC linked bracket", fileId: "f2", material: "Any PETG", process: "0.16mm Detail", plates: 1, variants: ["Orange"], status: "ready" }
      });
      expect(part.statusCode).toBe(201);
      expect(part.json()).toMatchObject({ name: "QC linked bracket", fileId: "f2", material: "Any PETG" });

      const badSku = await app.inject({
        method: "POST",
        url: "/api/skus",
        headers: auth(token),
        payload: { sku: "BAD-PART", title: "Bad SKU", parts: ["Missing part"], price: 10, stock: 1, channel: "Manual" }
      });
      expect(badSku.statusCode).toBe(400);

      const sku = await app.inject({
        method: "POST",
        url: "/api/skus",
        headers: auth(token),
        payload: { sku: "QC-BRACKET", title: "QC Bracket", parts: ["QC linked bracket"], variants: ["Orange"], price: 180, stock: 3, channel: "Manual" }
      });
      expect(sku.statusCode).toBe(201);
      db.data.parts.push({ id: "other-workspace-part", workspaceId: "ws-other", name: "Other workspace part", fileId: "f2", material: "PLA", process: "0.2mm", plates: 1, variants: [], status: "ready" });
      db.data.skus.push({ id: "other-workspace-sku", workspaceId: "ws-other", sku: "OTHER-TENANT", title: "Other Tenant SKU", parts: ["Other workspace part"], variants: [], price: 99, stock: 1, channel: "Manual" });

      const materialMap = await app.inject({ method: "POST", url: "/api/catalog/material-map", headers: auth(token), payload: { apply: true } });
      expect(materialMap.statusCode).toBe(200);
      expect(materialMap.json()).toMatchObject({ applied: true });
      expect(materialMap.json().changed).toBeGreaterThanOrEqual(1);
      expect(materialMap.json().mappings).toEqual(expect.arrayContaining([
        expect.objectContaining({ alias: "Any PETG", canonical: "PETG", status: "alias" })
      ]));
      expect(materialMap.json().parts.find((item) => item.id === part.json().id)).toMatchObject({ material: "PETG" });

      const catalogExport = await app.inject({ method: "GET", url: "/api/catalog/export", headers: auth(token) });
      expect(catalogExport.statusCode).toBe(200);
      expect(catalogExport.json().rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          sku: "QC-BRACKET",
          title: "QC Bracket",
          materials: "PETG",
          fileIds: "f2",
          estimatedGrams: expect.any(Number)
        })
      ]));
      expect(catalogExport.json().csv).toContain('"QC-BRACKET"');
      expect(catalogExport.json().csv).toContain('"QC linked bracket"');
      expect(catalogExport.json().csv).not.toContain("OTHER-TENANT");
      expect(catalogExport.json().rows.some((row) => row.sku === "OTHER-TENANT")).toBe(false);
      const catalogExportEvent = db.data.events.find((event) => event.type === "catalog.exported");
      expect(catalogExportEvent).toMatchObject({
        workspaceId: "ws-default",
        data: expect.objectContaining({
          workspaceId: "ws-default",
          rows: catalogExport.json().rows.length,
          skus: expect.any(Number),
          parts: expect.any(Number),
          files: expect.any(Number)
        })
      });
      expect(catalogExportEvent.data).toMatchObject({ actorEmail: "demo@layerpilot.test", actorType: "user" });
      expect(JSON.stringify(catalogExportEvent.data)).not.toContain("QC-BRACKET");

      const order = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: auth(token),
        payload: { source: "Manual", customer: "Catalog Customer", items: ["QC-BRACKET x2"], status: "received", due: "Tomorrow 12:00", value: 360 }
      });
      expect(order.statusCode).toBe(201);

      const planned = await app.inject({
        method: "POST",
        url: `/api/orders/${order.json().id}/generate-jobs`,
        headers: auth(token),
        payload: { dryRun: true }
      });
      expect(planned.statusCode).toBe(200);
      expect(planned.json()).toMatchObject({ dryRun: true, duplicateBlocked: false });
      expect(planned.json().jobs).toHaveLength(2);
      expect(planned.json().stockChanges).toEqual([expect.objectContaining({ sku: "QC-BRACKET", before: 3, after: 1, quantity: 2 })]);

      let persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.skus.find((item) => item.sku === "QC-BRACKET")).toMatchObject({ stock: 3 });
      expect(persisted.queue.filter((item) => item.sourceOrderId === order.json().id)).toHaveLength(0);

      const generated = await app.inject({ method: "POST", url: `/api/orders/${order.json().id}/generate-jobs`, headers: auth(token) });
      expect(generated.statusCode).toBe(200);
      expect(generated.json().jobs).toHaveLength(2);
      expect(generated.json().jobs[0]).toMatchObject({ fileId: "f2", material: "PETG", stage: "needs slicing", sourceSku: "QC-BRACKET" });
      expect(generated.json().order).toMatchObject({ id: order.json().id, status: "queued" });
      expect(generated.json().skus.find((item) => item.sku === "QC-BRACKET")).toMatchObject({ stock: 1 });

      const duplicate = await app.inject({ method: "POST", url: `/api/orders/${order.json().id}/generate-jobs`, headers: auth(token) });
      expect(duplicate.statusCode).toBe(200);
      expect(duplicate.json()).toMatchObject({ duplicateBlocked: true });
      expect(duplicate.json().jobs).toHaveLength(0);
      expect(duplicate.json().existingJobs).toHaveLength(2);

      persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.parts.some((item) => item.name === "QC linked bracket")).toBe(true);
      expect(persisted.parts.find((item) => item.name === "QC linked bracket")).toMatchObject({ material: "PETG" });
      expect(persisted.events.some((event) => event.type === "catalog.material_mapped")).toBe(true);
      expect(persisted.skus.find((item) => item.sku === "QC-BRACKET")).toMatchObject({ stock: 1 });
      expect(persisted.queue.filter((item) => item.sourceOrderId === order.json().id)).toHaveLength(2);
    });
  });

  it("replays idempotent catalog configuration writes without duplicate setup records", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const partHeaders = { ...auth(token), "idempotency-key": "catalog-part-retry-001" };
      const partPayload = { name: "Retry setup bracket", fileId: "f2", material: "PETG", process: "0.20mm Production", plates: 1, variants: ["Black"], status: "ready" };

      const part = await app.inject({ method: "POST", url: "/api/parts", headers: partHeaders, payload: partPayload });
      expect(part.statusCode).toBe(201);
      const partReplay = await app.inject({ method: "POST", url: "/api/parts", headers: partHeaders, payload: partPayload });
      expect(partReplay.statusCode).toBe(201);
      expect(partReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(partReplay.json()).toEqual(part.json());

      const skuHeaders = { ...auth(token), "idempotency-key": "catalog-sku-retry-001" };
      const skuPayload = { sku: "RETRY-BRACKET", title: "Retry Bracket", parts: ["Retry setup bracket"], variants: ["Black"], price: 42, stock: 8, channel: "Manual" };
      const sku = await app.inject({ method: "POST", url: "/api/skus", headers: skuHeaders, payload: skuPayload });
      expect(sku.statusCode).toBe(201);
      const skuReplay = await app.inject({ method: "POST", url: "/api/skus", headers: skuHeaders, payload: skuPayload });
      expect(skuReplay.statusCode).toBe(201);
      expect(skuReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(skuReplay.json()).toEqual(sku.json());

      const templateHeaders = { ...auth(token), "idempotency-key": "production-template-create-retry-001" };
      const templatePayload = { name: "Retry replenishment recipe", sku: "RETRY-BRACKET", fileId: "f1", material: "PETG", color: "Black", priority: "High", printerId: "p1", dueOffsetDays: 2, quantity: 2, time: "1h 45m", cost: 24, notes: "Retry safe setup" };
      const template = await app.inject({ method: "POST", url: "/api/productionTemplates", headers: templateHeaders, payload: templatePayload });
      expect(template.statusCode).toBe(201);
      const templateReplay = await app.inject({ method: "POST", url: "/api/productionTemplates", headers: templateHeaders, payload: templatePayload });
      expect(templateReplay.statusCode).toBe(201);
      expect(templateReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(templateReplay.json()).toEqual(template.json());

      const templatePatchHeaders = { ...auth(token), "idempotency-key": "production-template-update-retry-001" };
      const templatePatchPayload = { priority: "Rush", quantity: 4, notes: "Retry safe update" };
      const templateUpdated = await app.inject({ method: "PATCH", url: `/api/productionTemplates/${template.json().id}`, headers: templatePatchHeaders, payload: templatePatchPayload });
      expect(templateUpdated.statusCode).toBe(200);
      const templateUpdatedReplay = await app.inject({ method: "PATCH", url: `/api/productionTemplates/${template.json().id}`, headers: templatePatchHeaders, payload: templatePatchPayload });
      expect(templateUpdatedReplay.statusCode).toBe(200);
      expect(templateUpdatedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(templateUpdatedReplay.json()).toEqual(templateUpdated.json());

      const conflict = await app.inject({ method: "POST", url: "/api/skus", headers: skuHeaders, payload: { ...skuPayload, price: 45 } });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.parts.filter((item) => item.name === "Retry setup bracket")).toHaveLength(1);
      expect(persisted.skus.filter((item) => item.sku === "RETRY-BRACKET")).toHaveLength(1);
      expect(persisted.productionTemplates.filter((item) => item.name === "Retry replenishment recipe")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "part.created" && event.data?.partId === part.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "sku.created" && event.data?.skuId === sku.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "production_template.created" && event.data?.templateId === template.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "production_template.updated" && event.data?.templateId === template.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "catalog-part-retry-001")).toMatchObject({ method: "POST", path: "/api/parts", replayCount: 1, statusCode: 201 });
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "production-template-update-retry-001")).toMatchObject({ method: "PATCH", path: `/api/productionTemplates/${template.json().id}`, replayCount: 1, statusCode: 200 });
    });
  });

  it("cancels generated order work and releases reserved material", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const order = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: auth(token),
        payload: { source: "Manual", customer: "Lifecycle Customer", items: ["CAM-MOUNT-ORG x1"], status: "received", due: "Tomorrow 17:00", value: 420 }
      });
      expect(order.statusCode).toBe(201);

      const generated = await app.inject({ method: "POST", url: `/api/orders/${order.json().id}/generate-jobs`, headers: auth(token) });
      expect(generated.statusCode).toBe(200);
      const jobId = generated.json().jobs[0].id;

      const scheduled = await app.inject({
        method: "PATCH",
        url: `/api/queue/${jobId}/schedule`,
        headers: auth(token),
        payload: { printerId: "p3", scheduledStart: "14:00" }
      });
      expect(scheduled.statusCode).toBe(200);
      expect(scheduled.json().job).toMatchObject({ id: jobId, status: "queued", stage: "needs slicing", reservedSpoolId: "s2" });
      expect(scheduled.json().spools.find((item) => item.id === "s2")).toMatchObject({ reserved: expect.any(Number) });

      const cancelled = await app.inject({ method: "PATCH", url: `/api/orders/${order.json().id}/status`, headers: auth(token), payload: { status: "cancelled" } });
      expect(cancelled.statusCode).toBe(200);
      expect(cancelled.json().order).toMatchObject({ id: order.json().id, status: "cancelled" });
      expect(cancelled.json().jobs).toEqual([expect.objectContaining({ id: jobId, status: "cancelled", stage: "blocked" })]);
      expect(cancelled.json().materialChanges).toEqual([expect.objectContaining({ spoolId: "s2" })]);
      expect(cancelled.json().spools.find((item) => item.id === "s2")).toMatchObject({ reserved: 0, reservations: [] });

      const duplicate = await app.inject({ method: "POST", url: `/api/orders/${order.json().id}/generate-jobs`, headers: auth(token) });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ error: "Cannot generate jobs for a terminal order" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.orders.find((item) => item.id === order.json().id)).toMatchObject({ status: "cancelled" });
      expect(persisted.queue.find((item) => item.id === jobId)).toMatchObject({ status: "cancelled", stage: "blocked" });
      expect(persisted.spools.find((item) => item.id === "s2")).toMatchObject({ reserved: 0, reservations: [] });
      expect(persisted.events.some((event) => event.type === "order.status" && event.data?.status === "cancelled")).toBe(true);
    });
  });

  it("accepts public quote requests and converts accepted quotes into orders", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Public Customer",
          email: "customer@example.com",
          company: "Customer Lab",
          project: "ASA fixture batch",
          material: "ASA",
          quantity: 6,
          due: "2026-07-08",
          budget: 780,
          notes: "Matte black finish preferred",
          fileName: "fixture-batch.3mf"
        }
      });
      expect(quote.statusCode).toBe(201);
      expect(quote.json()).toMatchObject({ ok: true, quoteRequest: { status: "new", project: "ASA fixture batch" } });
      expect(quote.json().quoteRequest.accessToken).toEqual(expect.any(String));

      const protectedList = await app.inject({ method: "GET", url: "/api/quoteRequests" });
      expect(protectedList.statusCode).toBe(401);

      const token = await login(app);
      const id = quote.json().quoteRequest.id;
      const quoted = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers: auth(token),
        payload: { status: "quoted", priority: "High", quotedValue: 720, validUntil: "2026-07-15", internalNote: "Use ASA process profile" }
      });
      expect(quoted.statusCode).toBe(200);
      expect(quoted.json()).toMatchObject({ status: "quoted", priority: "High", quotedValue: 720, validUntil: "2026-07-15" });

      const listedQuotes = await app.inject({ method: "GET", url: "/api/quoteRequests", headers: auth(token) });
      expect(listedQuotes.statusCode).toBe(200);
      const listedQuote = listedQuotes.json().find((item) => item.id === id);
      expect(listedQuote).toMatchObject({ id, hasCustomerAccessToken: true });
      expect(listedQuote.customerAccessToken).toBeUndefined();
      expect(JSON.stringify(listedQuotes.json())).not.toContain(quote.json().quoteRequest.accessToken);

      const state = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(state.statusCode).toBe(200);
      const stateQuote = state.json().quoteRequests.find((item) => item.id === id);
      expect(stateQuote).toMatchObject({ id, hasCustomerAccessToken: true });
      expect(stateQuote.customerAccessToken).toBeUndefined();
      expect(JSON.stringify(state.json())).not.toContain(quote.json().quoteRequest.accessToken);

      const exported = await app.inject({ method: "GET", url: "/api/admin/export", headers: auth(token) });
      expect(exported.statusCode).toBe(200);
      const exportedQuote = exported.json().data.quoteRequests.find((item) => item.id === id);
      expect(exportedQuote).toMatchObject({ id, hasCustomerAccessToken: true });
      expect(exportedQuote.customerAccessToken).toBeUndefined();
      expect(JSON.stringify(exported.json())).not.toContain(quote.json().quoteRequest.accessToken);

      const portalLink = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/customer-link`,
        headers: { ...auth(token), host: "farm-saas.3dstu.com", "x-forwarded-proto": "https" }
      });
      expect(portalLink.statusCode).toBe(200);
      expect(portalLink.json().url).toContain("https://farm-saas.3dstu.com/?");
      expect(portalLink.json().url).toContain(`quoteId=${id}`);
      expect(portalLink.json().accessToken).toBe(quote.json().quoteRequest.accessToken);
      const portalUrl = new URL(portalLink.json().url);
      expect(portalUrl.searchParams.get("quoteToken")).toBe(quote.json().quoteRequest.accessToken);

      const blockedStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=wrong-token` });
      expect(blockedStatus.statusCode).toBe(404);

      const publicStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=${quote.json().quoteRequest.accessToken}` });
      expect(publicStatus.statusCode).toBe(200);
      expect(publicStatus.json().quoteRequest).toMatchObject({ id, status: "quoted", quotedValue: 720, validUntil: "2026-07-15", orderId: "" });

      const rotatedLink = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/customer-link`,
        headers: auth(token),
        payload: { rotate: true }
      });
      expect(rotatedLink.statusCode).toBe(200);
      expect(rotatedLink.json().accessToken).not.toBe(quote.json().quoteRequest.accessToken);
      const oldTokenStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=${quote.json().quoteRequest.accessToken}` });
      expect(oldTokenStatus.statusCode).toBe(404);
      const rotatedStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=${rotatedLink.json().accessToken}` });
      expect(rotatedStatus.statusCode).toBe(200);

      const converted = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/convert-order`,
        headers: auth(token),
        payload: { due: "2026-07-10" }
      });
      expect(converted.statusCode).toBe(201);
      expect(converted.json().order).toMatchObject({ externalId: id, customer: "Public Customer / Customer Lab", items: ["ASA fixture batch x6"], status: "received", due: "2026-07-10", value: 720, quoteRequestId: id });
      expect(converted.json().job).toBe(null);
      expect(converted.json().quoteRequest).toMatchObject({ status: "converted", orderId: converted.json().order.id });

      const duplicate = await app.inject({ method: "POST", url: `/api/quoteRequests/${id}/convert-order`, headers: auth(token) });
      expect(duplicate.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({ status: "converted", orderId: converted.json().order.id });
      expect(persisted.orders.find((item) => item.id === converted.json().order.id)).toMatchObject({ quoteRequestId: id });
      expect(persisted.events.some((event) => event.type === "quote_request.converted")).toBe(true);
    });
  });

  it("replays idempotent quote conversions without creating duplicate orders", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Retry Quote Buyer",
          email: "retry-quote@example.com",
          company: "Retry Studio",
          project: "Nylon latch batch",
          material: "Nylon",
          quantity: 4,
          due: "2026-07-22",
          budget: 360,
          notes: "Retry conversion test",
          fileName: "nylon-latch.3mf"
        }
      });
      expect(quote.statusCode).toBe(201);
      const id = quote.json().quoteRequest.id;
      const headers = { ...auth(token), "idempotency-key": "quote-convert-retry-001" };
      const payload = { due: "2026-07-25", value: 390 };

      const converted = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/convert-order`,
        headers,
        payload
      });
      expect(converted.statusCode).toBe(201);

      const replay = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/convert-order`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(converted.json());

      const conflict = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/convert-order`,
        headers,
        payload: { ...payload, value: 410 }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.orders.filter((order) => order.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({ status: "converted", orderId: converted.json().order.id });
      expect(persisted.events.filter((event) => event.type === "quote_request.converted" && event.data?.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "quote-convert-retry-001")).toMatchObject({
        method: "POST",
        path: `/api/quoteRequests/${id}/convert-order`,
        replayCount: 1,
        statusCode: 201
      });
    });
  });

  it("replays idempotent quote request updates without duplicating audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Retry Update Buyer",
          email: "retry-update@example.com",
          company: "Quote Update Studio",
          project: "Quote update retry",
          material: "PETG",
          quantity: 6,
          due: "2026-08-16",
          budget: 640,
          notes: "Operator quote update retry"
        }
      });
      expect(quote.statusCode).toBe(201);
      const id = quote.json().quoteRequest.id;
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "quote-update-retry-001" };
      const payload = { status: "quoted", priority: "High", quotedValue: 625, validUntil: "2026-08-30", internalNote: "Retry-safe update" };

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers,
        payload
      });
      expect(updated.statusCode).toBe(200);

      const replay = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(updated.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers,
        payload: { ...payload, quotedValue: 650 }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({
        status: "quoted",
        quotedValue: 625,
        reviewedBy: "demo@layerpilot.test"
      });
      expect(persisted.events.filter((event) => event.type === "quote_request.updated" && event.data?.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "quote-update-retry-001")).toMatchObject({
        method: "PATCH",
        path: `/api/quoteRequests/${id}`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("replays idempotent quote portal link rotations without invalidating the original response", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Retry Link Buyer",
          email: "retry-link@example.com",
          company: "Portal Link Studio",
          project: "Customer portal link retry",
          material: "ASA",
          quantity: 5,
          due: "2026-08-12",
          budget: 450,
          notes: "Portal link rotation retry"
        }
      });
      expect(quote.statusCode).toBe(201);
      const { id, accessToken: originalToken } = quote.json().quoteRequest;
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "quote-link-rotate-retry-001" };
      const payload = { rotate: true };

      const rotated = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/customer-link`,
        headers,
        payload
      });
      expect(rotated.statusCode).toBe(200);
      expect(rotated.json().accessToken).not.toBe(originalToken);

      const replay = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/customer-link`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(rotated.json());

      const conflict = await app.inject({
        method: "POST",
        url: `/api/quoteRequests/${id}/customer-link`,
        headers,
        payload: { rotate: false }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const oldTokenStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=${originalToken}` });
      expect(oldTokenStatus.statusCode).toBe(404);
      const rotatedStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=${rotated.json().accessToken}` });
      expect(rotatedStatus.statusCode).toBe(200);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({
        customerAccessToken: rotated.json().accessToken,
        portalLinkGeneratedBy: "demo@layerpilot.test"
      });
      expect(persisted.events.filter((event) => event.type === "quote_request.portal_link_rotated" && event.data?.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "quote-link-rotate-retry-001")).toMatchObject({
        method: "POST",
        path: `/api/quoteRequests/${id}/customer-link`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("lets customers accept quoted requests through the public quote portal", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Portal Buyer",
          email: "buyer@example.com",
          company: "Buyer Studio",
          project: "PETG jig run",
          material: "PETG",
          quantity: 3,
          due: "2026-07-18",
          budget: 300,
          notes: "Approve from public portal"
        }
      });
      expect(quote.statusCode).toBe(201);
      const { id, accessToken } = quote.json().quoteRequest;
      const token = await login(app);
      const quoted = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers: auth(token),
        payload: { status: "quoted", quotedValue: 255, priority: "Normal" }
      });
      expect(quoted.statusCode).toBe(200);

      const accepted = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        payload: { token: accessToken, decision: "accepted", note: "Customer approved" }
      });
      expect(accepted.statusCode).toBe(201);
      expect(accepted.json().quoteRequest).toMatchObject({ id, status: "converted", quotedValue: 255, customerDecision: "accepted" });
      expect(accepted.json().order).toMatchObject({ status: "received", value: 255, due: "2026-07-18" });
      expect(accepted.json().job).toBe(null);

      const duplicate = await app.inject({ method: "POST", url: `/api/public/quoteRequests/${id}/decision`, payload: { token: accessToken, decision: "accepted" } });
      expect(duplicate.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({ status: "converted", orderId: accepted.json().order.id, customerDecisionNote: "Customer approved" });
      expect(persisted.orders.find((item) => item.id === accepted.json().order.id)).toMatchObject({ quoteRequestId: id, value: 255 });
      expect(persisted.events.some((event) => event.type === "quote_request.customer_accepted")).toBe(true);
      expect(persisted.events.some((event) => event.type === "quote_request.converted" && event.data.orderId === accepted.json().order.id)).toBe(true);
    });
  });

  it("replays idempotent public quote approvals without creating duplicate orders", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Retry Portal Buyer",
          email: "retry-portal@example.com",
          company: "Portal Studio",
          project: "Carbon fiber quote approval",
          material: "Nylon-CF",
          quantity: 2,
          due: "2026-08-06",
          budget: 520,
          notes: "Customer approval retry"
        }
      });
      expect(quote.statusCode).toBe(201);
      const { id, accessToken } = quote.json().quoteRequest;
      const token = await login(app);
      const quoted = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers: auth(token),
        payload: { status: "quoted", quotedValue: 500, validUntil: "2026-08-15" }
      });
      expect(quoted.statusCode).toBe(200);
      const headers = { "idempotency-key": "public-quote-decision-001" };
      const payload = { token: accessToken, decision: "accepted", note: "Customer approved with retry" };

      const accepted = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        headers,
        payload
      });
      expect(accepted.statusCode).toBe(201);

      const replay = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(accepted.json());

      const conflict = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        headers,
        payload: { ...payload, note: "Different approval note" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.orders.filter((order) => order.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({ status: "converted", orderId: accepted.json().order.id, customerDecisionNote: "Customer approved with retry" });
      expect(persisted.events.filter((event) => event.type === "quote_request.customer_accepted" && event.data?.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "quote_request.converted" && event.data?.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "public-quote-decision-001")).toMatchObject({
        actorId: `public:quote-decision:${id}`,
        method: "POST",
        path: `/api/public/quoteRequests/${id}/decision`,
        replayCount: 1,
        statusCode: 201
      });
    });
  });

  it("replays idempotent public quote revision requests without duplicating audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Retry Revision Buyer",
          email: "retry-revision@example.com",
          company: "Revision Studio",
          project: "Quote revision retry",
          material: "PETG",
          quantity: 4,
          due: "2026-08-08",
          budget: 300,
          notes: "Customer revision retry"
        }
      });
      expect(quote.statusCode).toBe(201);
      const { id, accessToken } = quote.json().quoteRequest;
      const token = await login(app);
      const quoted = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers: auth(token),
        payload: { status: "quoted", quotedValue: 275, validUntil: "2026-08-20" }
      });
      expect(quoted.statusCode).toBe(200);
      const headers = { "idempotency-key": "public-quote-revision-001" };
      const payload = { token: accessToken, decision: "revision", note: "Please quote ASA instead" };

      const revision = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        headers,
        payload
      });
      expect(revision.statusCode).toBe(200);

      const replay = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(revision.json());

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({
        status: "reviewing",
        customerDecision: "revision",
        customerDecisionNote: "Please quote ASA instead"
      });
      expect(persisted.events.filter((event) => event.type === "quote_request.revision_requested" && event.data?.quoteRequestId === id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "public-quote-revision-001")).toMatchObject({
        actorId: `public:quote-decision:${id}`,
        method: "POST",
        path: `/api/public/quoteRequests/${id}/decision`,
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("blocks customer approval after a quote expires", async () => {
    await withApp(async ({ app }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Expired Buyer",
          email: "expired@example.com",
          project: "Expired quote check",
          material: "PLA",
          quantity: 1,
          due: "2026-07-20",
          budget: 90,
          notes: "Should require a fresh quote"
        }
      });
      expect(quote.statusCode).toBe(201);
      const { id, accessToken } = quote.json().quoteRequest;
      const token = await login(app);
      const quoted = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers: auth(token),
        payload: { status: "quoted", quotedValue: 88, validUntil: "2000-01-01" }
      });
      expect(quoted.statusCode).toBe(200);

      const accepted = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        payload: { token: accessToken, decision: "accepted" }
      });
      expect(accepted.statusCode).toBe(409);
      expect(accepted.json()).toMatchObject({ error: "Quote request has expired", validUntil: "2000-01-01" });
    });
  });

  it("lets customers request quote changes without converting the order", async () => {
    await withApp(async ({ app, dbPath }) => {
      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        payload: {
          customer: "Revision Buyer",
          email: "revision@example.com",
          project: "Fixture revision",
          material: "PETG",
          quantity: 2,
          due: "2026-07-24",
          budget: 140,
          notes: "Needs operator review"
        }
      });
      expect(quote.statusCode).toBe(201);
      const { id, accessToken } = quote.json().quoteRequest;
      const token = await login(app);
      const quoted = await app.inject({
        method: "PATCH",
        url: `/api/quoteRequests/${id}`,
        headers: auth(token),
        payload: { status: "quoted", quotedValue: 128, validUntil: "2026-08-01" }
      });
      expect(quoted.statusCode).toBe(200);

      const revision = await app.inject({
        method: "POST",
        url: `/api/public/quoteRequests/${id}/decision`,
        payload: { token: accessToken, decision: "revision", note: "Please quote a black PETG version instead." }
      });
      expect(revision.statusCode).toBe(200);
      expect(revision.json().quoteRequest).toMatchObject({ id, status: "reviewing", customerDecision: "revision", customerDecisionNote: "Please quote a black PETG version instead.", orderId: "" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.find((item) => item.id === id)).toMatchObject({ status: "reviewing", customerDecision: "revision" });
      expect(persisted.orders.some((order) => order.quoteRequestId === id)).toBe(false);
      expect(persisted.events.some((event) => event.type === "quote_request.revision_requested" && event.data.quoteRequestId === id)).toBe(true);
    });
  });

  it("stores uploaded model files from public quote requests", async () => {
    await withApp(async ({ app, dbPath }) => {
      const boundary = "----layerpilot-quote-upload";
      const stl = "solid quote\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 40 0 0\nvertex 0 30 8\nendloop\nendfacet\nendsolid quote\n";
      const field = (name, value) => `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
      const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="quote-bracket.stl"\r\nContent-Type: model/stl\r\n\r\n`;
      const body = Buffer.concat([
        Buffer.from(field("customer", "Upload Customer")),
        Buffer.from(field("email", "upload@example.com")),
        Buffer.from(field("company", "Upload Lab")),
        Buffer.from(field("project", "Uploaded bracket")),
        Buffer.from(field("material", "PETG")),
        Buffer.from(field("quantity", "2")),
        Buffer.from(field("due", "2026-08-01")),
        Buffer.from(field("budget", "160")),
        Buffer.from(field("notes", "Please quote from attached STL")),
        Buffer.from(fileHeader),
        Buffer.from(stl),
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ]);

      const quote = await app.inject({
        method: "POST",
        url: "/api/public/quoteRequests",
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body
      });
      expect(quote.statusCode).toBe(201);
      expect(quote.json().quoteRequest).toMatchObject({ project: "Uploaded bracket", fileName: "quote-bracket.stl" });
      expect(quote.json().quoteRequest.fileId).toBeTruthy();

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      const storedQuote = persisted.quoteRequests.find((item) => item.id === quote.json().quoteRequest.id);
      const storedFile = persisted.files.find((item) => item.id === storedQuote.fileId);
      expect(storedQuote).toMatchObject({ fileName: "quote-bracket.stl", fileType: "STL", fileSize: expect.stringMatching(/B|KB/) });
      expect(storedFile).toMatchObject({ name: "quote-bracket.stl", material: "PETG", folder: "Customer Quotes", quoteRequestId: storedQuote.id, status: "uploaded" });
      expect(persisted.fileFolders.find((item) => item.name === "Customer Quotes")).toMatchObject({ purpose: "quote-intake", fileCount: 1 });
      expect(persisted.events.some((event) => event.type === "quote_request.created" && event.data.fileId === storedFile.id)).toBe(true);

      const token = await login(app);
      const blockedDelete = await app.inject({ method: "DELETE", url: `/api/files/${storedFile.id}`, headers: auth(token) });
      expect(blockedDelete.statusCode).toBe(409);
      expect(blockedDelete.json().references.quoteRequests).toEqual([{ id: storedQuote.id, project: "Uploaded bracket", status: "new" }]);

      const converted = await app.inject({ method: "POST", url: `/api/quoteRequests/${storedQuote.id}/convert-order`, headers: auth(token), payload: { due: "2026-08-02" } });
      expect(converted.statusCode).toBe(201);
      expect(converted.json().order).toMatchObject({ externalId: storedQuote.id, status: "queued", quoteRequestId: storedQuote.id, due: "2026-08-02" });
      expect(converted.json().job).toMatchObject({ fileId: storedFile.id, sourceOrderId: converted.json().order.id, sourceQuoteRequestId: storedQuote.id, material: "PETG", stage: "needs slicing" });
      expect(converted.json().queue.some((job) => job.id === converted.json().job.id)).toBe(true);
      expect(converted.json().todos.length).toBeGreaterThan(0);

      const queueProtectedDelete = await app.inject({ method: "DELETE", url: `/api/files/${storedFile.id}`, headers: auth(token) });
      expect(queueProtectedDelete.statusCode).toBe(409);
      expect(queueProtectedDelete.json().references.activeQueue).toEqual([expect.objectContaining({ id: converted.json().job.id, status: "queued" })]);
    });
  });

  it("creates reusable production templates and runs them into queue jobs", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/productionTemplates",
        headers: auth(token),
        payload: { name: "QC replenishment recipe", sku: "QC-BRACKET", fileId: "f1", material: "PLA", color: "Black", priority: "High", printerId: "p1", dueOffsetDays: 3, quantity: 2, time: "2h 15m", cost: 44, notes: "Run before weekend pickup" }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ name: "QC replenishment recipe", fileId: "f1", quantity: 2, runCount: 0 });

      const dryRun = await app.inject({ method: "POST", url: `/api/productionTemplates/${created.json().id}/run`, headers: auth(token), payload: { dryRun: true, quantity: 1 } });
      expect(dryRun.statusCode).toBe(200);
      expect(dryRun.json()).toMatchObject({ dryRun: true, jobs: [expect.objectContaining({ sourceTemplateId: created.json().id, fileId: "f1", priority: "High" })] });

      const committed = await app.inject({ method: "POST", url: `/api/productionTemplates/${created.json().id}/run`, headers: auth(token), payload: { quantity: 3, due: "2026-07-01" } });
      expect(committed.statusCode).toBe(200);
      expect(committed.json().jobs).toHaveLength(3);
      expect(committed.json().jobs[0]).toMatchObject({ sourceTemplateId: created.json().id, due: "2026-07-01", added: "Template: QC replenishment recipe" });
      expect(committed.json().queue.filter((job) => job.sourceTemplateId === created.json().id)).toHaveLength(3);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.productionTemplates.find((item) => item.id === created.json().id)).toMatchObject({ runCount: 3 });
      expect(persisted.events.some((event) => event.type === "production_template.run")).toBe(true);
    });
  });

  it("generates stored parametric nameplate STL files and linked parts", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const generated = await app.inject({
        method: "POST",
        url: "/api/parametric/nameplate",
        headers: auth(token),
        payload: { text: "QC Badge", width: 96, height: 36, thickness: 3, material: "PLA", feature: "magnet pockets", createPart: true }
      });
      expect(generated.statusCode).toBe(201);
      expect(generated.json().file).toMatchObject({ type: "STL", material: "PLA", folder: "Parametric / Nameplates", dimensions: [96, 36, 3] });
      expect(generated.json().part).toMatchObject({ fileId: generated.json().file.id, material: "PLA", status: "ready" });
      expect(generated.json().estimates.grams).toBeGreaterThan(0);
      expect(generated.json().stlBytes).toBeGreaterThan(100);

      const stl = await readFile(generated.json().file.storagePath, "utf8");
      expect(stl).toContain("solid layerpilot_nameplate_qc-badge");
      expect(stl).toContain("facet normal");

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.find((file) => file.id === generated.json().file.id)).toMatchObject({ storagePath: generated.json().file.storagePath, status: "uploaded" });
      expect(persisted.parts.find((part) => part.id === generated.json().part.id)).toMatchObject({ fileId: generated.json().file.id });
      expect(persisted.events.some((event) => event.type === "parametric.generated")).toBe(true);
    });
  });

  it("replays idempotent parametric nameplates without duplicate files or parts", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "parametric-nameplate-retry-001" };
      const payload = { text: "Retry Badge", width: 96, height: 36, thickness: 3, material: "PETG", feature: "magnet pockets", createPart: true };

      const generated = await app.inject({
        method: "POST",
        url: "/api/parametric/nameplate",
        headers,
        payload
      });
      expect(generated.statusCode).toBe(201);
      const replay = await app.inject({
        method: "POST",
        url: "/api/parametric/nameplate",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(generated.json());

      const conflict = await app.inject({
        method: "POST",
        url: "/api/parametric/nameplate",
        headers,
        payload: { ...payload, text: "Changed Badge" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.files.filter((item) => item.parametric?.generator === "nameplate-box-stl" && item.thumbnail === "Retry Badge")).toHaveLength(1);
      expect(persisted.parts.filter((item) => item.name === "Parametric nameplate - Retry Badge")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "parametric.generated" && event.data?.fileId === generated.json().file.id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "parametric-nameplate-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/parametric/nameplate",
        replayCount: 1,
        statusCode: 201
      });
    });
  });

  it("imports and manages slicer profiles through the API", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: auth(token),
        payload: { name: "QC 0.20 Production", kind: "Process", target: "FDM fleet", source: "Manual", settings: { layer_height: 0.2, infill: 18 } }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ name: "QC 0.20 Production", kind: "Process", settings: { layer_height: 0.2 } });

      const duplicate = await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: auth(token),
        payload: { name: "QC 0.20 Production", kind: "Process", target: "FDM fleet", source: "Manual" }
      });
      expect(duplicate.statusCode).toBe(409);

      const orcaProfile = [
        "[printer]",
        "name = QC Voron 300",
        "printer_model = Voron",
        "bed_shape = 0x0,300x0,300x300,0x300",
        "",
        "[filament]",
        "name = QC PETG Orange",
        "filament_type = PETG",
        "temperature = 245"
      ].join("\n");
      const imported = await app.inject({
        method: "POST",
        url: "/api/profiles/import",
        headers: auth(token),
        payload: { source: "Orca import", content: orcaProfile }
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().imported).toHaveLength(2);
      expect(imported.json().imported).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "QC Voron 300", kind: "Machine", source: "Orca import" }),
        expect.objectContaining({ name: "QC PETG Orange", kind: "Filament", source: "Orca import" })
      ]));

      const jsonImport = await app.inject({
        method: "POST",
        url: "/api/profiles/import",
        headers: auth(token),
        payload: { source: "Bambu sync", profiles: [{ name: "Bambu PLA Fast", kind: "Filament", target: "A1 fleet", source: "Bambu sync", settings: { filament_type: "PLA" } }] }
      });
      expect(jsonImport.statusCode).toBe(200);
      expect(jsonImport.json().imported[0]).toMatchObject({ name: "Bambu PLA Fast", kind: "Filament", target: "A1 fleet" });

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/profiles/${created.json().id}`,
        headers: auth(token),
        payload: { target: "Production farm", settings: { layer_height: 0.2, infill: 22 } }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: created.json().id, target: "Production farm", settings: { infill: 22 } });

      const defaulted = await app.inject({ method: "PATCH", url: `/api/profiles/${created.json().id}/default`, headers: auth(token) });
      expect(defaulted.statusCode).toBe(200);
      expect(defaulted.json().profileDefaults).toMatchObject({ Process: created.json().id });

      const policy = await app.inject({
        method: "PATCH",
        url: "/api/profile-policy",
        headers: auth(token),
        payload: { dueWindowHours: 6, warnBeforeFallback: false }
      });
      expect(policy.statusCode).toBe(200);
      expect(policy.json()).toMatchObject({ materialCompatibility: true, dueWindowHours: 6, warnBeforeFallback: false });

      const archived = await app.inject({ method: "DELETE", url: `/api/profiles/${created.json().id}`, headers: auth(token) });
      expect(archived.statusCode).toBe(200);
      expect(archived.json()).toMatchObject({ ok: true, profile: { id: created.json().id } });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.profiles.some((profile) => profile.name === "QC Voron 300" && profile.kind === "Machine")).toBe(true);
      expect(persisted.profiles.some((profile) => profile.id === created.json().id)).toBe(false);
      expect(persisted.profileDefaults.Process).toBe("");
      expect(persisted.profileMatchingPolicy).toMatchObject({ dueWindowHours: 6, warnBeforeFallback: false });
      expect(persisted.events.some((event) => event.type === "profile.imported")).toBe(true);
      expect(persisted.events.some((event) => event.type === "profile.default_set")).toBe(true);
      expect(persisted.events.some((event) => event.type === "profile.policy_updated")).toBe(true);
      expect(persisted.events.some((event) => event.type === "profile.archived")).toBe(true);
    });
  });

  it("replays idempotent profile configuration writes without duplicate profile events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const createHeaders = { ...auth(token), "idempotency-key": "profile-create-retry-001" };
      const createPayload = { name: "Retry 0.20 Process", kind: "Process", target: "FDM fleet", source: "Manual", settings: { layer_height: 0.2, infill: 20 } };
      const created = await app.inject({ method: "POST", url: "/api/profiles", headers: createHeaders, payload: createPayload });
      expect(created.statusCode).toBe(201);
      const createdReplay = await app.inject({ method: "POST", url: "/api/profiles", headers: createHeaders, payload: createPayload });
      expect(createdReplay.statusCode).toBe(201);
      expect(createdReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(createdReplay.json()).toEqual(created.json());

      const importHeaders = { ...auth(token), "idempotency-key": "profile-import-retry-001" };
      const importPayload = {
        source: "Orca import",
        content: ["[printer]", "name = Retry Voron 300", "printer_model = Voron", "", "[filament]", "name = Retry PETG Black", "filament_type = PETG"].join("\n")
      };
      const imported = await app.inject({ method: "POST", url: "/api/profiles/import", headers: importHeaders, payload: importPayload });
      expect(imported.statusCode).toBe(200);
      const importedReplay = await app.inject({ method: "POST", url: "/api/profiles/import", headers: importHeaders, payload: importPayload });
      expect(importedReplay.statusCode).toBe(200);
      expect(importedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(importedReplay.json()).toEqual(imported.json());

      const updateHeaders = { ...auth(token), "idempotency-key": "profile-update-retry-001" };
      const updatePayload = { target: "Production farm", settings: { layer_height: 0.2, infill: 24 } };
      const updated = await app.inject({ method: "PATCH", url: `/api/profiles/${created.json().id}`, headers: updateHeaders, payload: updatePayload });
      expect(updated.statusCode).toBe(200);
      const updatedReplay = await app.inject({ method: "PATCH", url: `/api/profiles/${created.json().id}`, headers: updateHeaders, payload: updatePayload });
      expect(updatedReplay.statusCode).toBe(200);
      expect(updatedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(updatedReplay.json()).toEqual(updated.json());

      const defaultHeaders = { ...auth(token), "idempotency-key": "profile-default-retry-001" };
      const defaulted = await app.inject({ method: "PATCH", url: `/api/profiles/${created.json().id}/default`, headers: defaultHeaders });
      expect(defaulted.statusCode).toBe(200);
      const defaultedReplay = await app.inject({ method: "PATCH", url: `/api/profiles/${created.json().id}/default`, headers: defaultHeaders });
      expect(defaultedReplay.statusCode).toBe(200);
      expect(defaultedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(defaultedReplay.json()).toEqual(defaulted.json());

      const policyHeaders = { ...auth(token), "idempotency-key": "profile-policy-retry-001" };
      const policyPayload = { dueWindowHours: 8, warnBeforeFallback: false };
      const policy = await app.inject({ method: "PATCH", url: "/api/profile-policy", headers: policyHeaders, payload: policyPayload });
      expect(policy.statusCode).toBe(200);
      const policyReplay = await app.inject({ method: "PATCH", url: "/api/profile-policy", headers: policyHeaders, payload: policyPayload });
      expect(policyReplay.statusCode).toBe(200);
      expect(policyReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(policyReplay.json()).toEqual(policy.json());

      const archiveHeaders = { ...auth(token), "idempotency-key": "profile-archive-retry-001" };
      const archived = await app.inject({ method: "DELETE", url: `/api/profiles/${created.json().id}`, headers: archiveHeaders });
      expect(archived.statusCode).toBe(200);
      const archivedReplay = await app.inject({ method: "DELETE", url: `/api/profiles/${created.json().id}`, headers: archiveHeaders });
      expect(archivedReplay.statusCode).toBe(200);
      expect(archivedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(archivedReplay.json()).toEqual(archived.json());

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.profiles.filter((profile) => profile.name === "Retry Voron 300" && profile.kind === "Machine")).toHaveLength(1);
      expect(persisted.profiles.filter((profile) => profile.name === "Retry PETG Black" && profile.kind === "Filament")).toHaveLength(1);
      expect(persisted.profiles.some((profile) => profile.id === created.json().id)).toBe(false);
      expect(persisted.events.filter((event) => event.type === "profile.created" && event.data?.profileId === created.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "profile.imported" && event.data?.source === "Orca import")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "profile.updated" && event.data?.profileId === created.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "profile.default_set" && event.data?.profileId === created.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "profile.policy_updated")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "profile.archived" && event.data?.profileId === created.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "profile-archive-retry-001")).toMatchObject({ method: "DELETE", path: `/api/profiles/${created.json().id}`, replayCount: 1, statusCode: 200 });
    });
  });

  it("imports commerce connector JSON feeds and skips duplicate external orders", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          orders: [
            {
              id: "SP-9001",
              customer: { name: "Feed Customer" },
              line_items: [{ sku: "DUCT-KIT-BLK", quantity: 2 }],
              due_at: "Tomorrow 15:00",
              total_price: "1360"
            }
          ]
        })
      });
      try {
        const token = await login(app);
        const connector = await app.inject({
          method: "POST",
          url: "/api/commerceConnectors",
          headers: auth(token),
          payload: { name: "QC Shopify feed", source: "Shopify", url: "https://commerce.test/orders.json", token: "secret-token", enabled: true }
        });
        expect(connector.statusCode).toBe(201);
        expect(connector.json()).toMatchObject({ name: "QC Shopify feed", hasToken: true });
        expect(connector.json().token).toBeUndefined();

        const imported = await app.inject({ method: "POST", url: `/api/commerceConnectors/${connector.json().id}/import`, headers: auth(token) });
        expect(imported.statusCode).toBe(200);
        expect(imported.json().created).toHaveLength(1);
        expect(imported.json().created[0]).toMatchObject({ source: "Shopify", externalId: "SP-9001", customer: "Feed Customer", items: ["DUCT-KIT-BLK x2"], value: 1360 });

        const duplicate = await app.inject({ method: "POST", url: `/api/commerceConnectors/${connector.json().id}/import`, headers: auth(token) });
        expect(duplicate.statusCode).toBe(200);
        expect(duplicate.json().created).toHaveLength(0);
        expect(duplicate.json().skipped[0]).toMatchObject({ reason: "Duplicate order", externalId: "SP-9001" });

        const connectors = await app.inject({ method: "GET", url: "/api/commerceConnectors", headers: auth(token) });
        const savedConnector = connectors.json().find((item) => item.id === connector.json().id);
        expect(savedConnector.token).toBeUndefined();
        expect(savedConnector).toMatchObject({ hasToken: true, lastStatus: "imported" });

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.orders.filter((item) => item.externalId === "SP-9001")).toHaveLength(1);
        expect(persisted.commerceImports).toHaveLength(2);
        expect(persisted.commerceConnectors.find((item) => item.id === connector.json().id)).toMatchObject({ token: "secret-token" });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("replays idempotent commerce connector imports without refetching the feed", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            orders: [
              {
                id: "SP-RETRY-1",
                customer: { name: "Retry Feed Customer" },
                line_items: [{ sku: "RETRY-BRACKET", quantity: 1 }],
                due_at: "Tomorrow 16:00",
                total_price: "240"
              }
            ]
          })
        };
      };
      try {
        const token = await login(app);
        const connector = await app.inject({
          method: "POST",
          url: "/api/commerceConnectors",
          headers: auth(token),
          payload: { name: "Retry Shopify feed", source: "Shopify", url: "https://commerce.test/retry.json", enabled: true }
        });
        expect(connector.statusCode).toBe(201);
        const headers = { ...auth(token), "idempotency-key": "commerce-feed-retry-001" };

        const imported = await app.inject({ method: "POST", url: `/api/commerceConnectors/${connector.json().id}/import`, headers });
        expect(imported.statusCode).toBe(200);
        expect(imported.json().created).toHaveLength(1);

        const replay = await app.inject({ method: "POST", url: `/api/commerceConnectors/${connector.json().id}/import`, headers });
        expect(replay.statusCode).toBe(200);
        expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replay.json()).toEqual(imported.json());
        expect(fetchCount).toBe(1);

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.orders.filter((item) => item.externalId === "SP-RETRY-1")).toHaveLength(1);
        expect(persisted.commerceImports).toHaveLength(1);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("replays idempotent commerce connector tests without refetching the feed", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      let fetchCount = 0;
      global.fetch = async () => {
        fetchCount += 1;
        return {
          ok: true,
          status: 204,
          text: async () => ""
        };
      };
      try {
        const token = await login(app);
        const connector = await app.inject({
          method: "POST",
          url: "/api/commerceConnectors",
          headers: auth(token),
          payload: { name: "Retry test feed", source: "Generic", url: "https://commerce.test/test-feed.json", token: "test-token-secret", enabled: true }
        });
        expect(connector.statusCode).toBe(201);
        const headers = { ...auth(token), "idempotency-key": "commerce-test-retry-001" };

        const tested = await app.inject({ method: "POST", url: `/api/commerceConnectors/${connector.json().id}/test`, headers });
        expect(tested.statusCode).toBe(200);
        expect(tested.json()).toMatchObject({ ok: true, statusCode: 204 });
        expect(tested.json().connector).toMatchObject({ id: connector.json().id, lastStatus: "connected", hasToken: true });
        expect(JSON.stringify(tested.json())).not.toContain("test-token-secret");

        const replay = await app.inject({ method: "POST", url: `/api/commerceConnectors/${connector.json().id}/test`, headers });
        expect(replay.statusCode).toBe(200);
        expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replay.json()).toEqual(tested.json());
        expect(fetchCount).toBe(1);

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.commerceConnectors.find((item) => item.id === connector.json().id)).toMatchObject({ lastStatus: "connected", lastStatusCode: 204, token: "test-token-secret" });
        expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "commerce-test-retry-001")).toMatchObject({
          method: "POST",
          path: `/api/commerceConnectors/${connector.json().id}/test`,
          replayCount: 1,
          statusCode: 200
        });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("imports commerce CSV rows into orders", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const csv = "externalId,customer,items,due,value\nCSV-1001,CSV Customer,QC-BRACKET x1,Today 17:00,180";
      const imported = await app.inject({
        method: "POST",
        url: "/api/commerce/import-csv",
        headers: auth(token),
        payload: { source: "Generic", csv }
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().created).toHaveLength(1);
      expect(imported.json().created[0]).toMatchObject({ source: "Manual", externalId: "CSV-1001", customer: "CSV Customer", items: ["QC-BRACKET x1"] });
      expect(imported.json().importRun).toMatchObject({ source: "Generic", created: 1, skipped: 0 });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.orders.some((order) => order.externalId === "CSV-1001")).toBe(true);
      expect(persisted.commerceImports[0]).toMatchObject({ connectorName: "CSV import", created: 1 });
    });
  });

  it("replays idempotent commerce CSV imports without adding duplicate import runs", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const csv = "externalId,customer,items,due,value\nCSV-RETRY-1,CSV Retry Customer,QC-RETRY x1,Today 18:00,220";
      const headers = { ...auth(token), "idempotency-key": "commerce-csv-retry-001" };

      const imported = await app.inject({
        method: "POST",
        url: "/api/commerce/import-csv",
        headers,
        payload: { source: "Generic", csv }
      });
      expect(imported.statusCode).toBe(200);
      expect(imported.json().created).toHaveLength(1);

      const replay = await app.inject({
        method: "POST",
        url: "/api/commerce/import-csv",
        headers,
        payload: { source: "Generic", csv }
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(imported.json());

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.orders.filter((order) => order.externalId === "CSV-RETRY-1")).toHaveLength(1);
      expect(persisted.commerceImports.filter((run) => run.connectorName === "CSV import")).toHaveLength(1);
    });
  });

  it("creates webhooks, delivers matching events, and stores delivery logs", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      const calls = [];
      global.fetch = async (url, init) => {
        calls.push({ url: String(url), init, body: JSON.parse(init.body) });
        return { ok: true, status: 202, text: async () => "accepted" };
      };
      try {
        const token = await login(app);
        const hook = await app.inject({
          method: "POST",
          url: "/api/webhooks",
          headers: auth(token),
          payload: { name: "QC automation", url: "https://automation.test/layerpilot", events: ["order.status"], enabled: true }
        });
        expect(hook.statusCode).toBe(201);
        expect(hook.json()).toMatchObject({ name: "QC automation", lastStatus: "not sent" });

        const order = await app.inject({
          method: "POST",
          url: "/api/orders",
          headers: auth(token),
          payload: { source: "Manual", customer: "Webhook Customer", items: ["DUCT-KIT-BLK x1"], status: "received", due: "Jun 22", value: 680 }
        });
        expect(order.statusCode).toBe(201);

        const shipped = await app.inject({ method: "PATCH", url: `/api/orders/${order.json().id}/status`, headers: auth(token), payload: { status: "shipped" } });
        expect(shipped.statusCode).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://automation.test/layerpilot");
        expect(calls[0].body.event).toMatchObject({ type: "order.status", message: `${order.json().id} -> shipped` });

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.webhooks.find((item) => item.id === hook.json().id)).toMatchObject({ lastStatus: "delivered", lastStatusCode: 202 });
        expect(persisted.webhookDeliveries[0]).toMatchObject({ webhookId: hook.json().id, eventType: "order.status", status: "delivered", statusCode: 202 });

        const testDelivery = await app.inject({ method: "POST", url: `/api/webhooks/${hook.json().id}/test`, headers: auth(token), payload: {} });
        expect(testDelivery.statusCode).toBe(200);
        expect(testDelivery.json().delivery).toMatchObject({ eventType: "webhook.test", status: "delivered" });
        expect(calls).toHaveLength(2);
        const persistedAfterTest = JSON.parse(await readFile(dbPath, "utf8"));
        const testEvent = persistedAfterTest.events.find((event) => event.type === "webhook.test" && event.data?.webhookId === hook.json().id);
        expect(testEvent).toMatchObject({
          workspaceId: "ws-default",
          data: {
            workspaceId: "ws-default",
            webhookId: hook.json().id,
            actorEmail: "demo@layerpilot.test",
            actorType: "user"
          }
        });
        expect(JSON.stringify(testEvent)).not.toContain("https://automation.test/layerpilot");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("creates notification channels, delivers matching production events, and hides tokens", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      const calls = [];
      global.fetch = async (url, init) => {
        calls.push({ url: String(url), init, body: JSON.parse(init.body) });
        return { ok: true, status: 200, text: async () => "ok" };
      };
      try {
        const token = await login(app);
        const channel = await app.inject({
          method: "POST",
          url: "/api/notificationChannels",
          headers: auth(token),
          payload: { name: "QC Slack", type: "slack", url: "https://hooks.slack.test/qc", token: "secret-token", events: ["order.status"], enabled: true, recipients: [] }
        });
        expect(channel.statusCode).toBe(201);
        expect(channel.json()).toMatchObject({ name: "QC Slack", type: "slack", hasToken: true });
        expect(channel.json().token).toBeUndefined();

        const order = await app.inject({
          method: "POST",
          url: "/api/orders",
          headers: auth(token),
          payload: { source: "Manual", customer: "Notify Customer", items: ["DUCT-KIT-BLK x1"], status: "received", due: "Jun 23", value: 680 }
        });
        expect(order.statusCode).toBe(201);

        const shipped = await app.inject({ method: "PATCH", url: `/api/orders/${order.json().id}/status`, headers: auth(token), payload: { status: "shipped" } });
        expect(shipped.statusCode).toBe(200);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://hooks.slack.test/qc");
        expect(calls[0].init.headers.authorization).toBe("Bearer secret-token");
        expect(calls[0].body.text).toContain("order.status");

        const testDelivery = await app.inject({ method: "POST", url: `/api/notificationChannels/${channel.json().id}/test`, headers: auth(token) });
        expect(testDelivery.statusCode).toBe(200);
        expect(testDelivery.json().channel.token).toBeUndefined();
        expect(testDelivery.json().delivery).toMatchObject({ eventType: "notification.test", status: "delivered" });
        expect(calls).toHaveLength(2);

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.notificationChannels.find((item) => item.id === channel.json().id)).toMatchObject({ token: "secret-token", lastStatus: "delivered" });
        expect(persisted.notificationDeliveries.some((item) => item.channelId === channel.json().id && item.eventType === "order.status" && item.status === "delivered")).toBe(true);
        const testEvent = persisted.events.find((event) => event.type === "notification.test" && event.data?.channelId === channel.json().id);
        expect(testEvent).toMatchObject({
          workspaceId: "ws-default",
          data: {
            workspaceId: "ws-default",
            channelId: channel.json().id,
            actorEmail: "demo@layerpilot.test",
            actorType: "user"
          }
        });
        expect(JSON.stringify(testEvent)).not.toContain("https://hooks.slack.test/qc");
        expect(JSON.stringify(testEvent)).not.toContain("secret-token");

        const channels = await app.inject({ method: "GET", url: "/api/notificationChannels", headers: auth(token) });
        expect(channels.json().some((item) => item.token)).toBe(false);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("replays idempotent integration test deliveries without duplicate outbound calls", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      const calls = [];
      global.fetch = async (url, init) => {
        calls.push({ url: String(url), init, body: JSON.parse(init.body) });
        return { ok: true, status: 202, text: async () => "accepted" };
      };
      try {
        const token = await login(app);
        const hook = await app.inject({
          method: "POST",
          url: "/api/webhooks",
          headers: auth(token),
          payload: { name: "Retry webhook", url: "https://automation.test/retry-webhook", events: ["order.status"], enabled: true }
        });
        expect(hook.statusCode).toBe(201);

        const webhookHeaders = { ...auth(token), "idempotency-key": "webhook-test-retry-001" };
        const firstWebhookTest = await app.inject({
          method: "POST",
          url: `/api/webhooks/${hook.json().id}/test`,
          headers: webhookHeaders,
          payload: {}
        });
        expect(firstWebhookTest.statusCode).toBe(200);

        const replayWebhookTest = await app.inject({
          method: "POST",
          url: `/api/webhooks/${hook.json().id}/test`,
          headers: webhookHeaders,
          payload: {}
        });
        expect(replayWebhookTest.statusCode).toBe(200);
        expect(replayWebhookTest.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replayWebhookTest.json()).toEqual(firstWebhookTest.json());

        const channel = await app.inject({
          method: "POST",
          url: "/api/notificationChannels",
          headers: auth(token),
          payload: { name: "Retry notification", type: "slack", url: "https://hooks.slack.test/retry", token: "secret-token", events: ["order.status"], enabled: true, recipients: [] }
        });
        expect(channel.statusCode).toBe(201);

        const notificationHeaders = { ...auth(token), "idempotency-key": "notification-test-retry-001" };
        const firstNotificationTest = await app.inject({
          method: "POST",
          url: `/api/notificationChannels/${channel.json().id}/test`,
          headers: notificationHeaders,
          payload: {}
        });
        expect(firstNotificationTest.statusCode).toBe(200);

        const replayNotificationTest = await app.inject({
          method: "POST",
          url: `/api/notificationChannels/${channel.json().id}/test`,
          headers: notificationHeaders,
          payload: {}
        });
        expect(replayNotificationTest.statusCode).toBe(200);
        expect(replayNotificationTest.headers["x-layerpilot-idempotent-replay"]).toBe("true");
        expect(replayNotificationTest.json()).toEqual(firstNotificationTest.json());

        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(calls.map((call) => call.url)).toEqual(["https://automation.test/retry-webhook", "https://hooks.slack.test/retry"]);
        expect(persisted.events.filter((event) => event.type === "webhook.test")).toHaveLength(1);
        expect(persisted.events.filter((event) => event.type === "notification.test")).toHaveLength(1);
        expect(persisted.webhookDeliveries.filter((delivery) => delivery.webhookId === hook.json().id && delivery.eventType === "webhook.test")).toHaveLength(1);
        expect(persisted.notificationDeliveries.filter((delivery) => delivery.channelId === channel.json().id && delivery.eventType === "notification.test")).toHaveLength(1);

        const conflict = await app.inject({
          method: "POST",
          url: `/api/webhooks/${hook.json().id}/test`,
          headers: webhookHeaders,
          payload: { note: "different payload" }
        });
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("updates printer status with enum validation", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      const invalid = await app.inject({ method: "PATCH", url: "/api/printers/p2/status", headers: auth(token), payload: { status: "available" } });
      expect(invalid.statusCode).toBe(400);

      const updated = await app.inject({ method: "PATCH", url: "/api/printers/p2/status", headers: auth(token), payload: { status: "maintenance", progress: 0, job: null } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: "p2", status: "maintenance", progress: 0 });
    });
  });

  it("replays idempotent direct printer status updates without duplicate audit events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "printer-status-retry-001" };
      const payload = { status: "maintenance", progress: 0, job: null };

      const updated = await app.inject({ method: "PATCH", url: "/api/printers/p2/status", headers, payload });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ id: "p2", status: "maintenance", progress: 0 });

      const replay = await app.inject({ method: "PATCH", url: "/api/printers/p2/status", headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(updated.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: "/api/printers/p2/status",
        headers,
        payload: { status: "offline", progress: 0, job: null }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.events.filter((event) => event.type === "printer.status" && event.data?.printerId === "p2" && event.data?.status === "maintenance")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "printer-status-retry-001")).toMatchObject({
        method: "PATCH",
        path: "/api/printers/p2/status",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("persists actions on generated todos", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const listed = await app.inject({ method: "GET", url: "/api/todos", headers: auth(token) });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().length).toBeGreaterThan(0);
      const todo = listed.json()[0];

      const claimed = await app.inject({
        method: "POST",
        url: `/api/todos/${todo.id}/action`,
        headers: auth(token),
        payload: { action: "claim", owner: "QC Lead", note: "Taking this before lunch" }
      });
      expect(claimed.statusCode).toBe(200);
      expect(claimed.json().todo).toMatchObject({ id: todo.id, status: "claimed", owner: "QC Lead" });

      const completed = await app.inject({
        method: "POST",
        url: `/api/todos/${todo.id}/action`,
        headers: auth(token),
        payload: { action: "complete", note: "Resolved during QC" }
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json().todo).toBeNull();
      expect(completed.json().todos.some((item) => item.id === todo.id)).toBe(false);

      const reopened = await app.inject({
        method: "POST",
        url: `/api/todos/${todo.id}/action`,
        headers: auth(token),
        payload: { action: "reopen", note: "Need another pass" }
      });
      expect(reopened.statusCode).toBe(200);
      expect(reopened.json().todo).toMatchObject({ id: todo.id, status: "open" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.todoActions.filter((action) => action.todoId === todo.id)).toHaveLength(3);
      expect(persisted.events.some((event) => event.type === "todo.claim")).toBe(true);
      expect(persisted.events.some((event) => event.type === "todo.complete")).toBe(true);
      expect(persisted.events.some((event) => event.type === "todo.reopen")).toBe(true);
    });
  });

  it("replays idempotent todo actions without duplicating operator records", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const listed = await app.inject({ method: "GET", url: "/api/todos", headers: auth(token) });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().length).toBeGreaterThan(0);
      const todo = listed.json()[0];
      const headers = { ...auth(token), "idempotency-key": "todo-action-retry-001" };
      const payload = { action: "claim", owner: "QC Lead", note: "Taking this before lunch" };

      const first = await app.inject({
        method: "POST",
        url: `/api/todos/${todo.id}/action`,
        headers,
        payload
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().todo).toMatchObject({ id: todo.id, status: "claimed", owner: "QC Lead" });

      const replay = await app.inject({
        method: "POST",
        url: `/api/todos/${todo.id}/action`,
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({
        method: "POST",
        url: `/api/todos/${todo.id}/action`,
        headers,
        payload: { ...payload, note: "Different operator note" }
      });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.todoActions.filter((action) => action.todoId === todo.id && action.action === "claim")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "todo.claim" && event.data?.todoId === todo.id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "todo-action-retry-001")).toMatchObject({
        method: "POST",
        path: `/api/todos/${todo.id}/action`,
        replayCount: 1
      });
    });
  });

  it("creates and updates printer capability records", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const created = await app.inject({
        method: "POST",
        url: "/api/printers",
        headers: auth(token),
        payload: {
          name: "QC CoreXY",
          model: "CoreXY 500",
          location: "QC Farm",
          status: "idle",
          connection: "Klipper / Moonraker",
          filament: "ASA White",
          compatibleMaterials: ["ASA", "PETG"],
          buildVolume: [500, 500, 500],
          camera: "Setup pending"
        }
      });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ name: "QC CoreXY", status: "idle", connection: "Klipper / Moonraker", compatibleMaterials: ["ASA", "PETG"], buildVolume: [500, 500, 500] });

      const duplicate = await app.inject({ method: "POST", url: "/api/printers", headers: auth(token), payload: { name: "QC CoreXY" } });
      expect(duplicate.statusCode).toBe(409);

      const updated = await app.inject({
        method: "PATCH",
        url: `/api/printers/${created.json().id}`,
        headers: auth(token),
        payload: { compatibleMaterials: ["PLA", "PETG", "TPU"], buildVolume: [350, 350, 420], filament: "PETG Black" }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ compatibleMaterials: ["PLA", "PETG", "TPU"], buildVolume: [350, 350, 420], filament: "PETG Black" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.printers.find((printer) => printer.id === created.json().id)).toMatchObject({ name: "QC CoreXY", buildVolume: [350, 350, 420], filament: "PETG Black" });
      expect(persisted.events.some((event) => event.type === "printer.created" && event.data.printerId === created.json().id)).toBe(true);
    });
  });

  it("replays idempotent printer capability writes without duplicate printer events", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const createHeaders = { ...auth(token), "idempotency-key": "printer-create-retry-001" };
      const createPayload = {
        name: "Retry CoreXY",
        model: "CoreXY 400",
        location: "Retry Farm",
        status: "idle",
        connection: "Klipper / Moonraker",
        filament: "PETG Black",
        compatibleMaterials: ["PLA", "PETG"],
        buildVolume: [400, 400, 400],
        camera: "Setup pending"
      };
      const created = await app.inject({ method: "POST", url: "/api/printers", headers: createHeaders, payload: createPayload });
      expect(created.statusCode).toBe(201);
      const createdReplay = await app.inject({ method: "POST", url: "/api/printers", headers: createHeaders, payload: createPayload });
      expect(createdReplay.statusCode).toBe(201);
      expect(createdReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(createdReplay.json()).toEqual(created.json());

      const updateHeaders = { ...auth(token), "idempotency-key": "printer-update-retry-001" };
      const updatePayload = { compatibleMaterials: ["PLA", "PETG", "ASA"], buildVolume: [420, 420, 440], filament: "ASA Black" };
      const updated = await app.inject({ method: "PATCH", url: `/api/printers/${created.json().id}`, headers: updateHeaders, payload: updatePayload });
      expect(updated.statusCode).toBe(200);
      const updatedReplay = await app.inject({ method: "PATCH", url: `/api/printers/${created.json().id}`, headers: updateHeaders, payload: updatePayload });
      expect(updatedReplay.statusCode).toBe(200);
      expect(updatedReplay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(updatedReplay.json()).toEqual(updated.json());

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.printers.filter((printer) => printer.name === "Retry CoreXY")).toHaveLength(1);
      expect(persisted.printers.find((printer) => printer.id === created.json().id)).toMatchObject({ filament: "ASA Black", buildVolume: [420, 420, 440] });
      expect(persisted.events.filter((event) => event.type === "printer.created" && event.data?.printerId === created.json().id)).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "printer.updated" && event.data?.printerId === created.json().id)).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "printer-update-retry-001")).toMatchObject({ method: "PATCH", path: `/api/printers/${created.json().id}`, replayCount: 1, statusCode: 200 });
    });
  });

  it("advances production telemetry and generates completion todos", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const tick = await app.inject({ method: "POST", url: "/api/telemetry/tick", headers: auth(token), payload: { increment: 100 } });
      expect(tick.statusCode).toBe(200);
      expect(tick.json()).toMatchObject({ changed: true });
      expect(tick.json().completedJobs.some((job) => job.id === "q1" && job.status === "complete")).toBe(true);
      expect(tick.json().todos.some((todo) => todo.id === "q1-post")).toBe(true);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.printers.find((printer) => printer.id === "p1")).toMatchObject({ status: "idle", progress: 0 });
      expect(persisted.queue.find((job) => job.id === "q1")).toMatchObject({ status: "complete", stage: "post processing" });
      expect(persisted.events.some((event) => event.type === "print.completed" && event.data.jobId === "q1")).toBe(true);
    });
  });

  it("replays idempotent telemetry ticks without double advancing progress", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      const headers = { ...auth(token), "idempotency-key": "telemetry-tick-retry-001" };
      const payload = { increment: 10 };

      const first = await app.inject({ method: "POST", url: "/api/telemetry/tick", headers, payload });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ changed: true });
      const afterFirst = JSON.parse(await readFile(dbPath, "utf8"));
      expect(afterFirst.printers.find((printer) => printer.id === "p1")).toMatchObject({ status: "printing", progress: 72 });
      expect(afterFirst.queue.find((job) => job.id === "q1")).toMatchObject({ status: "printing", stage: "printing" });

      const replay = await app.inject({ method: "POST", url: "/api/telemetry/tick", headers, payload });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({ method: "POST", url: "/api/telemetry/tick", headers, payload: { increment: 20 } });
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toMatchObject({ error: "Idempotency key already used with a different request" });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.printers.find((printer) => printer.id === "p1")).toMatchObject({ status: "printing", progress: 72 });
      expect(persisted.queue.find((job) => job.id === "q1")).toMatchObject({ status: "printing", stage: "printing" });
      expect(persisted.events.filter((event) => event.type === "print.completed" && event.data?.jobId === "q1")).toHaveLength(0);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "telemetry-tick-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/telemetry/tick",
        replayCount: 1,
        statusCode: 200
      });
    });
  });

  it("builds analytics, print history, reprints completed jobs, and exports backups", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      await app.inject({ method: "POST", url: "/api/telemetry/tick", headers: auth(token), payload: { increment: 100 } });

      const analytics = await app.inject({ method: "GET", url: "/api/analytics", headers: auth(token) });
      expect(analytics.statusCode).toBe(200);
      expect(analytics.json()).toMatchObject({ completed: 1, successRate: 100 });
      expect(analytics.json().jobs).toBeGreaterThanOrEqual(3);
      expect(analytics.json().materialMix).toMatchObject({ PLA: expect.any(Number) });
      expect(analytics.json().printerLoad.some((printer) => printer.printerId === "p1")).toBe(true);

      const history = await app.inject({ method: "GET", url: "/api/history", headers: auth(token) });
      expect(history.statusCode).toBe(200);
      expect(history.json().some((job) => job.id === "q1" && job.status === "complete")).toBe(true);

      const annotated = await app.inject({
        method: "PATCH",
        url: "/api/history/q1",
        headers: auth(token),
        payload: {
          note: "QC passed after dimensional check",
          issueTag: "Dimensional variance",
          issueSeverity: "Medium",
          failureReason: "Corner lifted 0.2mm",
          failureCategory: "Adhesion",
          rootCause: "Front-left bed corner was cool",
          correctiveAction: "Clean plate and raise first-layer bed target",
          wasteGrams: 24,
          wasteSpoolId: "s1",
          deductWasteFromInventory: true
        }
      });
      expect(annotated.statusCode).toBe(200);
      expect(annotated.json().historyRecord).toMatchObject({
        id: "q1",
        note: "Corner lifted 0.2mm",
        issueTag: "Dimensional variance",
        issueSeverity: "Medium",
        failureReason: "Corner lifted 0.2mm",
        failureCategory: "Adhesion",
        rootCause: "Front-left bed corner was cool",
        correctiveAction: "Clean plate and raise first-layer bed target",
        wasteGrams: 24,
        wasteCost: 0.2,
        wasteSpoolId: "s1"
      });
      expect(annotated.json().wasteInventory).toMatchObject({ spoolId: "s1", before: 742, after: 718, grams: 24 });
      expect(annotated.json().analytics).toMatchObject({ wasteGrams: 24, wasteCost: 0.2, failureCategories: { Adhesion: 1 } });
      expect(annotated.json().analytics.printerReliability.find((printer) => printer.printerId === "p1")).toMatchObject({ wasteGrams: 24, wasteCost: 0.2 });

      const reprint = await app.inject({
        method: "POST",
        url: "/api/history/q1/reprint",
        headers: auth(token),
        payload: { due: "Tomorrow 09:00", priority: "High", printerId: "p2" }
      });
      expect(reprint.statusCode).toBe(201);
      expect(reprint.json().job).toMatchObject({ sourceJobId: "q1", status: "queued", priority: "High", printerId: "p2", due: "Tomorrow 09:00" });
      expect(reprint.json().todos.some((todo) => todo.id === `${reprint.json().job.id}-schedule`)).toBe(true);

      const exported = await app.inject({ method: "GET", url: "/api/admin/export", headers: auth(token) });
      expect(exported.statusCode).toBe(200);
      expect(exported.headers["content-disposition"]).toContain("layerpilot-export");
      expect(exported.json()).toMatchObject({ service: "3DSTU FarmFlow", analytics: expect.any(Object), history: expect.any(Array) });
      expect(exported.json().data.sessions).toBeUndefined();
      expect(exported.json().data.users.some((user) => "passwordHash" in user)).toBe(false);

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Export key", scopes: ["admin:export"], enabled: true }
      });
      const exportedByKey = await app.inject({ method: "GET", url: "/api/admin/export", headers: auth(apiKey.json().secret) });
      expect(exportedByKey.statusCode).toBe(200);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.some((job) => job.sourceJobId === "q1" && job.status === "queued")).toBe(true);
      expect(persisted.queue.find((job) => job.id === "q1")).toMatchObject({ note: "QC passed after dimensional check", issueTag: "Dimensional variance", issueSeverity: "Medium", failureReason: "Corner lifted 0.2mm", failureCategory: "Adhesion", wasteGrams: 24, wasteCost: 0.2, wasteSpoolId: "s1" });
      expect(persisted.spools.find((spool) => spool.id === "s1")).toMatchObject({ remaining: 718 });
      expect(persisted.queue.find((job) => job.sourceJobId === "q1")).not.toHaveProperty("wasteGrams");
      expect(persisted.events.some((event) => event.type === "history.annotated" && event.data.jobId === "q1")).toBe(true);
      expect(persisted.events.some((event) => event.type === "queue.reprint")).toBe(true);
      expect(persisted.events.some((event) => event.type === "admin.export")).toBe(true);
    });
  });

  it("replays idempotent history reprints without creating duplicate queue jobs", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      await app.inject({ method: "POST", url: "/api/telemetry/tick", headers: auth(token), payload: { increment: 100 } });

      const headers = { ...auth(token), "idempotency-key": "history-reprint-retry-001" };
      const payload = { due: "Tomorrow 09:00", priority: "High", printerId: "p2" };
      const first = await app.inject({
        method: "POST",
        url: "/api/history/q1/reprint",
        headers,
        payload
      });
      expect(first.statusCode).toBe(201);
      const firstJobId = first.json().job.id;

      const replay = await app.inject({
        method: "POST",
        url: "/api/history/q1/reprint",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(201);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json().job.id).toBe(firstJobId);
      expect(replay.json().todos.some((todo) => todo.id === `${firstJobId}-schedule`)).toBe(true);

      const conflict = await app.inject({
        method: "POST",
        url: "/api/history/q1/reprint",
        headers,
        payload: { ...payload, printerId: "p1" }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.filter((job) => job.sourceJobId === "q1")).toHaveLength(1);
      expect(persisted.events.filter((event) => event.type === "queue.reprint" && event.data.sourceJobId === "q1")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "history-reprint-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/history/q1/reprint",
        statusCode: 201,
        replayCount: 1
      });
    });
  });

  it("replays idempotent history annotations without double-deducting waste inventory", async () => {
    await withApp(async ({ app, dbPath }) => {
      const token = await login(app);
      await app.inject({ method: "POST", url: "/api/telemetry/tick", headers: auth(token), payload: { increment: 100 } });

      const headers = { ...auth(token), "idempotency-key": "history-annotation-retry-001" };
      const payload = {
        note: "Retry-safe waste deduction",
        issueTag: "Retry validation",
        issueSeverity: "High",
        failureReason: "Support scar",
        failureCategory: "Surface finish",
        wasteGrams: 24,
        wasteSpoolId: "s1",
        deductWasteFromInventory: true
      };
      const first = await app.inject({
        method: "PATCH",
        url: "/api/history/q1",
        headers,
        payload
      });
      expect(first.statusCode).toBe(200);
      expect(first.json().wasteInventory).toMatchObject({ spoolId: "s1", before: 742, after: 718, grams: 24 });

      const replay = await app.inject({
        method: "PATCH",
        url: "/api/history/q1",
        headers,
        payload
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replay.json()).toEqual(first.json());

      const conflict = await app.inject({
        method: "PATCH",
        url: "/api/history/q1",
        headers,
        payload: { ...payload, wasteGrams: 30 }
      });
      expect(conflict.statusCode).toBe(409);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.spools.find((spool) => spool.id === "s1")).toMatchObject({ remaining: 718 });
      expect(persisted.queue.find((job) => job.id === "q1")).toMatchObject({ wasteInventoryDeductedGrams: 24, wasteSpoolId: "s1" });
      expect(persisted.events.filter((event) => event.type === "history.annotated" && event.data?.jobId === "q1")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "history-annotation-retry-001")).toMatchObject({
        method: "PATCH",
        path: "/api/history/q1",
        statusCode: 200,
        replayCount: 1
      });
    });
  });

  it("previews and commits sanitized workspace restores", async () => {
    await withApp(async ({ app, db, dbPath }) => {
      const token = await login(app);
      const exported = await app.inject({ method: "GET", url: "/api/admin/export", headers: auth(token) });
      expect(exported.statusCode).toBe(200);
      const backup = exported.json();
      backup.data.printers[0].name = "Restored Forge";
      backup.data.users = [{ id: "restored-user", name: "Restored Admin", email: "restored@example.com", role: "Admin", location: "HQ", lastSeen: "Never" }];
      backup.data.apiKeys = [{ id: "restored-key", name: "Restored automation", prefix: "lp_live_restored", scopes: ["queue:write"], enabled: true }];
      backup.data.files[0].storagePath = "C:\\old-layerpilot\\storage\\missing.gcode";

      const preview = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(token),
        payload: { backup, dryRun: true }
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json()).toMatchObject({ dryRun: true, printers: backup.data.printers.length, storagePathsStripped: 1 });
      expect(preview.json().warnings).toEqual(expect.arrayContaining([
        expect.stringContaining("restored@example.com"),
        expect.stringContaining("API key Restored automation"),
        expect.stringContaining("demo@layerpilot.test")
      ]));
      expect(db.data.printers[0].name).not.toBe("Restored Forge");

      const restoreKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Restore drill automation", scopes: ["admin:restore"], enabled: true }
      });
      expect(restoreKey.statusCode).toBe(201);
      const apiKeyPreview = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(restoreKey.json().secret),
        payload: { backup, dryRun: true }
      });
      expect(apiKeyPreview.statusCode).toBe(200);
      expect(apiKeyPreview.json()).toMatchObject({ dryRun: true, printers: backup.data.printers.length, storagePathsStripped: 1 });
      const apiKeyCommitDenied = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(restoreKey.json().secret),
        payload: { backup, dryRun: false, confirm: "RESTORE" }
      });
      expect(apiKeyCommitDenied.statusCode).toBe(403);
      expect(apiKeyCommitDenied.json()).toMatchObject({ error: "Restore commit requires a user session" });
      expect(db.data.printers[0].name).not.toBe("Restored Forge");

      const exportOnlyKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "Export only restore denial", scopes: ["admin:export"], enabled: true }
      });
      const deniedByScope = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(exportOnlyKey.json().secret),
        payload: { backup, dryRun: true }
      });
      expect(deniedByScope.statusCode).toBe(403);

      const missingConfirm = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(token),
        payload: { backup, dryRun: false }
      });
      expect(missingConfirm.statusCode).toBe(409);

      const restoreCommitPayload = { backup, dryRun: false, confirm: "RESTORE" };
      const restoreCommitHeaders = { ...auth(token), "idempotency-key": "restore-commit-retry-001" };
      const committed = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: restoreCommitHeaders,
        payload: restoreCommitPayload
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toMatchObject({ dryRun: false, restored: true, printers: backup.data.printers.length, storagePathsStripped: 1 });

      const oldTokenLocked = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(oldTokenLocked.statusCode).toBe(401);

      const replayedCommit = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: restoreCommitHeaders,
        payload: restoreCommitPayload
      });
      expect(replayedCommit.statusCode).toBe(200);
      expect(replayedCommit.headers["x-layerpilot-idempotent-replay"]).toBe("true");
      expect(replayedCommit.json()).toEqual(committed.json());

      const freshToken = await login(app);
      const state = await app.inject({ method: "GET", url: "/api/state", headers: auth(freshToken) });
      expect(state.statusCode).toBe(200);
      expect(state.json().printers[0].name).toBe("Restored Forge");
      expect(state.json().users.map((user) => user.email)).toEqual(expect.arrayContaining(["restored@example.com", "demo@layerpilot.test"]));
      expect(state.json().users.some((user) => "passwordHash" in user)).toBe(false);
      expect(state.json().apiKeys.find((key) => key.id === "restored-key")).toMatchObject({ enabled: false, hasSecret: true });
      expect(state.json().files[0]).toMatchObject({ status: "needs file re-upload", restoreNote: expect.any(String) });
      expect(state.json().files[0].storagePath).toBeUndefined();

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.sessions).toHaveLength(1);
      expect(persisted.printers[0].name).toBe("Restored Forge");
      expect(persisted.users.find((user) => user.email === "restored@example.com")).toMatchObject({ passwordResetRequired: true });
      expect(persisted.apiKeys.find((key) => key.id === "restored-key")).toMatchObject({ enabled: false });
      expect(persisted.events.filter((event) => event.type === "admin.restore")).toHaveLength(1);
      expect(persisted.dataMeta.idempotencyKeys.find((record) => record.key === "restore-commit-retry-001")).toMatchObject({
        method: "POST",
        path: "/api/admin/restore",
        statusCode: 200,
        replayCount: 1
      });
    });
  });

  it("exports and restores stored model bytes when full backup mode is requested", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      const sample = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: auth(token),
        payload: { name: "Full Backup Bracket", material: "PETG", folder: "Backups" }
      });
      expect(sample.statusCode).toBe(201);
      const sampleFile = sample.json().file;
      await access(sampleFile.storagePath);

      const exported = await app.inject({ method: "GET", url: "/api/admin/export?includeFiles=true", headers: auth(token) });
      expect(exported.statusCode).toBe(200);
      const backup = exported.json();
      expect(backup.storage).toMatchObject({ included: true, count: expect.any(Number), bytes: expect.any(Number) });
      const payload = backup.filePayloads.find((item) => item.fileId === sampleFile.id);
      expect(payload).toMatchObject({ name: sampleFile.name, type: "STL", size: expect.any(Number) });
      expect(Buffer.from(payload.bytesBase64, "base64").toString("utf8")).toContain("solid layerpilot_sample_full-backup-bracket");

      await rm(sampleFile.storagePath, { force: true });
      backup.data.printers[0].name = "Full Backup Restore Forge";
      const committed = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(token),
        payload: { backup, dryRun: false, confirm: "RESTORE" }
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json().filePayloadsRestored).toBeGreaterThanOrEqual(1);

      const freshToken = await login(app);
      const state = await app.inject({ method: "GET", url: "/api/state", headers: auth(freshToken) });
      expect(state.statusCode).toBe(200);
      expect(state.json().printers[0].name).toBe("Full Backup Restore Forge");
      const restoredFile = state.json().files.find((item) => item.id === sampleFile.id);
      expect(restoredFile).toMatchObject({ id: sampleFile.id, status: "uploaded" });
      expect(restoredFile.restoreNote).toBeUndefined();
      await access(restoredFile.storagePath);

      const downloaded = await app.inject({ method: "GET", url: `/api/files/${sampleFile.id}/download`, headers: auth(freshToken) });
      expect(downloaded.statusCode).toBe(200);
      expect(downloaded.body).toContain("solid layerpilot_sample_full-backup-bracket");
    });
  });

  it("reports missing file payload coverage during restore preview", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      const sample = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: auth(token),
        payload: { name: "Partial Backup Bracket", material: "PETG", folder: "Backups" }
      });
      expect(sample.statusCode).toBe(201);
      const sampleFile = sample.json().file;

      const exported = await app.inject({ method: "GET", url: "/api/admin/export?includeFiles=true", headers: auth(token) });
      expect(exported.statusCode).toBe(200);
      const backup = exported.json();
      backup.filePayloads = backup.filePayloads.filter((payload) => payload.fileId !== sampleFile.id);

      const preview = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(token),
        payload: { backup, dryRun: true }
      });
      expect(preview.statusCode).toBe(200);
      expect(preview.json().filePayloadCoverage).toMatchObject({
        complete: false,
        expected: expect.any(Number),
        included: expect.any(Number),
        missing: expect.arrayContaining([expect.objectContaining({ fileId: sampleFile.id, name: sampleFile.name })])
      });
      expect(preview.json().filePayloadCoverage.expected).toBeGreaterThan(preview.json().filePayloadCoverage.included);
      expect(preview.json().warnings).toEqual(expect.arrayContaining([expect.stringContaining("missing file payloads")]));
    });
  });

  it("blocks full backup exports when stored file payloads are missing", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      const sample = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: auth(token),
        payload: { name: "Missing Payload Bracket", material: "PETG", folder: "Backups" }
      });
      expect(sample.statusCode).toBe(201);
      await rm(sample.json().file.storagePath, { force: true });

      const blocked = await app.inject({ method: "GET", url: "/api/admin/export?includeFiles=true", headers: auth(token) });
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toMatchObject({
        error: "Full backup export is missing stored file payloads",
        storage: {
          included: false,
          missing: expect.arrayContaining([expect.objectContaining({ fileId: sample.json().file.id, name: sample.json().file.name })])
        }
      });
      expect(blocked.json().storage.missing[0].reason).toBeTruthy();

      const partial = await app.inject({ method: "GET", url: "/api/admin/export?includeFiles=true&allowMissingFiles=true", headers: auth(token) });
      expect(partial.statusCode).toBe(200);
      expect(partial.json().storage).toMatchObject({
        included: true,
        missing: expect.arrayContaining([expect.objectContaining({ fileId: sample.json().file.id })])
      });
      expect(partial.json().filePayloads.some((payload) => payload.fileId === sample.json().file.id)).toBe(false);

      const audit = await app.inject({ method: "GET", url: "/api/audit?type=admin.export", headers: auth(token) });
      expect(audit.statusCode).toBe(200);
      expect(audit.json().events.find((event) => event.data?.blocked === true && event.data?.missingFiles === 1)).toMatchObject({
        data: expect.objectContaining({ blocked: true, includeFiles: true })
      });
    });
  });

  it("rejects full backup exports that exceed the configured byte limit", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      const sample = await app.inject({
        method: "POST",
        url: "/api/files/sample",
        headers: auth(token),
        payload: { name: "Oversized Backup Bracket", material: "PETG", folder: "Backups" }
      });
      expect(sample.statusCode).toBe(201);

      const limited = await app.inject({ method: "GET", url: "/api/admin/export?includeFiles=true&maxBytes=1", headers: auth(token) });
      expect(limited.statusCode).toBe(413);
      expect(limited.json()).toMatchObject({
        error: "Full backup export exceeds the configured byte limit",
        storage: {
          included: false,
          limitBytes: 1,
          oversized: true,
          count: expect.any(Number),
          bytes: expect.any(Number)
        }
      });
      expect(limited.json().storage.bytes).toBeGreaterThan(1);
      expect(limited.json().storage.files[0]).toMatchObject({ fileId: sample.json().file.id, size: expect.any(Number) });

      const audit = await app.inject({ method: "GET", url: "/api/audit?type=admin.export", headers: auth(token) });
      expect(audit.statusCode).toBe(200);
      expect(audit.json().events.find((event) => event.data?.includeFiles === true)).toMatchObject({
        data: expect.objectContaining({ blocked: true, limitBytes: 1 })
      });
    });
  });

  it("stores bridge configs without exposing api keys and syncs printer status", async () => {
    await withApp(async ({ app, dbPath }) => {
      const originalFetch = global.fetch;
      global.fetch = async (url) => {
        if (String(url).endsWith("/api/printer")) return { ok: true, status: 200, text: async () => JSON.stringify({ state: { text: "Operational" }, temperature: { tool0: { actual: 24, target: 0 }, bed: { actual: 22, target: 0 } } }) };
        if (String(url).endsWith("/api/job")) return { ok: true, status: 200, text: async () => JSON.stringify({ progress: { completion: 0 }, job: { file: { display: "" } } }) };
        return { ok: false, status: 404, text: async () => "{}" };
      };
      try {
        const token = await login(app);
        const saved = await app.inject({
          method: "POST",
          url: "/api/bridges",
          headers: auth(token),
          payload: { printerId: "p2", kind: "octoprint", name: "Resin Bay Octo", baseUrl: "http://octopi.local/", apiKey: "secret", enabled: true }
        });
        expect(saved.statusCode).toBe(201);
        expect(saved.json()).toMatchObject({ printerId: "p2", kind: "octoprint", hasApiKey: true });
        expect(saved.json().apiKey).toBeUndefined();

        const tested = await app.inject({ method: "POST", url: `/api/bridges/${saved.json().id}/test`, headers: auth(token) });
        expect(tested.statusCode).toBe(200);
        expect(tested.json()).toMatchObject({
          ok: true,
          diagnostic: expect.objectContaining({
            ok: true,
            latencyMs: expect.any(Number),
            checks: expect.arrayContaining([expect.objectContaining({ name: "Status endpoint", status: "passed" })])
          })
        });
        expect(tested.json().printer).toMatchObject({ id: "p2", status: "idle", nozzle: 24, bed: 22 });
        expect(tested.json().bridge.apiKey).toBeUndefined();
        expect(JSON.stringify(tested.json())).not.toContain("secret");

        const syncAll = await app.inject({ method: "POST", url: "/api/bridges/sync", headers: auth(token) });
        expect(syncAll.statusCode).toBe(200);
        expect(syncAll.json().synced).toEqual(expect.arrayContaining([expect.objectContaining({ bridgeId: saved.json().id, printerId: "p2", status: "idle" })]));
        expect(syncAll.json().bridges.some((bridge) => bridge.apiKey)).toBe(false);
        expect(syncAll.json().printers.find((printer) => printer.id === "p2")).toMatchObject({ status: "idle", nozzle: 24, bed: 22 });

        const bridges = await app.inject({ method: "GET", url: "/api/bridges", headers: auth(token) });
        expect(bridges.json().some((bridge) => bridge.apiKey)).toBe(false);
        const persisted = JSON.parse(await readFile(dbPath, "utf8"));
        expect(persisted.events.some((event) => event.type === "bridge.poll")).toBe(true);
        expect(persisted.bridges.find((bridge) => bridge.id === saved.json().id).lastDiagnostics.ok).toBe(true);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  it("marks file slicing results through the API", async () => {
    await withApp(async ({ app }) => {
      const token = await login(app);
      const sliced = await app.inject({ method: "PATCH", url: "/api/files/f2/slice", headers: auth(token) });
      expect(sliced.statusCode).toBe(200);
      expect(sliced.json()).toMatchObject({ id: "f2", type: "GCODE", sliced: true, status: "sliced" });
    });
  });

  it("enforces role-based write permissions", async () => {
    await withApp(async ({ app, db }) => {
      db.data.users.push({
        id: "viewer",
        name: "Read Only",
        email: "viewer@layerpilot.test",
        role: "Viewer",
        location: "HQ",
        lastSeen: "Never",
        passwordHash: db.data.users.find((user) => user.email === "demo@layerpilot.test").passwordHash
      });
      await db.write();
      const token = await login(app, "viewer@layerpilot.test", "layerpilot");
      const denied = await app.inject({ method: "PATCH", url: "/api/printers/p2/status", headers: auth(token), payload: { status: "maintenance" } });
      expect(denied.statusCode).toBe(403);
    });
  });
});
