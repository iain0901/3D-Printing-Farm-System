import { access, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

        const tokenMetrics = await app.inject({ method: "GET", url: "/api/metrics?metricsToken=metrics-secret" });
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
      });
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
    await withApp(async ({ app }) => {
      const bad = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "wrong-password" } });
      expect(bad.statusCode).toBe(401);

      const token = await login(app, "owner@layerpilot.test", "layerpilot");
      const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: auth(token) });
      expect(me.statusCode).toBe(200);
      expect(me.json().user).toMatchObject({ email: "owner@layerpilot.test", role: "Owner" });
      expect(me.json().user.passwordHash).toBeUndefined();

      const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: auth(token) });
      expect(logout.statusCode).toBe(200);

      const locked = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(locked.statusCode).toBe(401);
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
      expect(persisted.events.some((event) => event.type === "auth.password_changed")).toBe(true);
      expect(persisted.events.some((event) => event.type === "user.password_reset")).toBe(true);
      expect(persisted.users.find((user) => user.email === "password.qc@layerpilot.test")).toMatchObject({ passwordResetRequired: true });
    });
  });

  it("enables TOTP two-factor auth, challenges login, and consumes recovery codes", async () => {
    await withApp(async ({ app, dbPath }) => {
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
      expect(persisted.events.some((event) => event.type === "auth.2fa_enabled")).toBe(true);
      expect(persisted.events.some((event) => event.type === "auth.2fa_verified")).toBe(true);
      expect(persisted.events.some((event) => event.type === "auth.2fa_disabled")).toBe(true);
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
        payload: { organizationName: "QC Print Farm", defaultLocation: "QC Bay", currency: "TWD", restrictApiByIp: true, hotDropMode: "Auto-Queue" }
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ organizationName: "QC Print Farm", defaultLocation: "QC Bay", currency: "TWD", restrictApiByIp: true, hotDropMode: "Auto-Queue" });

      const invalidMode = await app.inject({
        method: "PATCH",
        url: "/api/workspaceSettings",
        headers: auth(token),
        payload: { hotDropMode: "Fire and forget" }
      });
      expect(invalidMode.statusCode).toBe(400);

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "No settings key", scopes: ["queue:write"], enabled: true }
      });
      const denied = await app.inject({ method: "PATCH", url: "/api/workspaceSettings", headers: auth(apiKey.json().secret), payload: { organizationName: "Bad" } });
      expect(denied.statusCode).toBe(403);

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaceSettings).toMatchObject({ organizationName: "QC Print Farm", defaultLocation: "QC Bay", currency: "TWD", restrictApiByIp: true, hotDropMode: "Auto-Queue" });
      expect(persisted.events.some((event) => event.type === "settings.updated")).toBe(true);
    });
  });

  it("tracks onboarding readiness and generates redacted support snapshots", async () => {
    await withApp(async ({ app, dbPath }) => {
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

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.workspaceSettings.onboarding.backup).toMatchObject({ status: "complete", note: "Export verified by owner" });
      expect(persisted.events.some((event) => event.type === "support.snapshot")).toBe(true);
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

      db.data.events.unshift(
        { id: "old-queue-event", type: "queue.status", message: "Old queue event", data: {}, at: "2020-01-01T00:00:00.000Z" },
        { id: "old-admin-event", type: "admin.restore", message: "Old restore event", data: {}, at: "2020-01-01T00:00:00.000Z" }
      );
      await db.write();

      const run = await app.inject({ method: "POST", url: "/api/admin/audit-retention/run", headers: auth(token) });
      expect(run.statusCode).toBe(200);
      expect(run.json().retention).toMatchObject({ enabled: true, days: 30, pruned: 1 });
      expect(db.data.events.some((event) => event.id === "old-queue-event")).toBe(false);
      expect(db.data.events.some((event) => event.id === "old-admin-event")).toBe(true);
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
          headers: auth(token),
          payload: { returnUrl: "http://127.0.0.1:8797/settings", planId: "farm" }
        });
        expect(portal.statusCode).toBe(200);
        expect(portal.json().session).toMatchObject({ mode: "stripe", provider: "stripe", id: "cs_test_layerpilot", stripePriceId: "price_farm_test" });
        expect(portal.json().session.url).toBe("https://checkout.stripe.test/session");
        expect(calls[0].params).toMatchObject({ mode: "subscription", line_items: [{ price: "price_farm_test", quantity: 1 }] });

        const denied = await app.inject({
          method: "POST",
          url: "/api/billing/webhook/stripe",
          payload: { id: "evt_denied", type: "invoice.paid", data: { object: {} } }
        });
        expect(denied.statusCode).toBe(401);

        const webhook = await app.inject({
          method: "POST",
          url: "/api/billing/webhook/stripe",
          headers: { "x-layerpilot-billing-webhook-secret": "whsec_test" },
          payload: {
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
          }
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
    await withApp(async ({ app }) => {
      const token = await login(app);
      await app.inject({
        method: "PATCH",
        url: "/api/costCatalog",
        headers: auth(token),
        payload: { machineHourlyRate: 42 }
      });

      const audit = await app.inject({ method: "GET", url: "/api/audit?type=cost_catalog.updated&limit=5", headers: auth(token) });
      expect(audit.statusCode).toBe(200);
      expect(audit.json()).toMatchObject({ total: expect.any(Number), returned: 1 });
      expect(audit.json().events[0]).toMatchObject({ type: "cost_catalog.updated", message: "Cost catalog updated" });
      expect(audit.json().events[0].data.costCatalog.machineHourlyRate).toBe(42);

      const searched = await app.inject({ method: "GET", url: "/api/audit?search=Cost%20catalog", headers: auth(token) });
      expect(searched.statusCode).toBe(200);
      expect(searched.json().events.some((event) => event.type === "cost_catalog.updated")).toBe(true);

      const csv = await app.inject({ method: "GET", url: "/api/audit/export?type=cost_catalog.updated&limit=5", headers: auth(token) });
      expect(csv.statusCode).toBe(200);
      expect(csv.headers["content-type"]).toContain("text/csv");
      expect(csv.headers["content-disposition"]).toContain("layerpilot-audit");
      expect(csv.body).toContain("id,type,message,at,data");
      expect(csv.body).toContain("cost_catalog.updated");

      const apiKey = await app.inject({
        method: "POST",
        url: "/api/apiKeys",
        headers: auth(token),
        payload: { name: "No audit export", scopes: ["queue:write"], enabled: true }
      });
      const denied = await app.inject({ method: "GET", url: "/api/audit/export", headers: auth(apiKey.json().secret) });
      expect(denied.statusCode).toBe(403);
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
    await withApp(async ({ app }) => {
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
      expect(persisted.maintenance.find((item) => item.id === maintenance.json().id)).toMatchObject({ status: "done" });
      expect(persisted.maintenanceTemplates.find((item) => item.id === template.json().template.id)).toMatchObject({ title: "QC motion service" });
      expect(persisted.maintenanceReports.find((item) => item.id === report.json().report.id)).toMatchObject({ linkedJobId: report.json().job.id });
      expect(persisted.events.some((event) => event.type === "maintenance_report.created")).toBe(true);
      expect(persisted.orders.find((item) => item.id === order.json().id)).toMatchObject({ status: "shipped" });
    });
  });

  it("persists catalog records and generates order jobs from SKU-linked parts", async () => {
    await withApp(async ({ app, dbPath }) => {
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
        payload: { status: "quoted", priority: "High", quotedValue: 720, internalNote: "Use ASA process profile" }
      });
      expect(quoted.statusCode).toBe(200);
      expect(quoted.json()).toMatchObject({ status: "quoted", priority: "High", quotedValue: 720 });

      const blockedStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=wrong-token` });
      expect(blockedStatus.statusCode).toBe(404);

      const publicStatus = await app.inject({ method: "GET", url: `/api/public/quoteRequests/${id}?token=${quote.json().quoteRequest.accessToken}` });
      expect(publicStatus.statusCode).toBe(200);
      expect(publicStatus.json().quoteRequest).toMatchObject({ id, status: "quoted", quotedValue: 720, orderId: "" });

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

        const channels = await app.inject({ method: "GET", url: "/api/notificationChannels", headers: auth(token) });
        expect(channels.json().some((item) => item.token)).toBe(false);
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

      const committed = await app.inject({
        method: "POST",
        url: "/api/admin/restore",
        headers: auth(token),
        payload: { backup, dryRun: false, confirm: "RESTORE" }
      });
      expect(committed.statusCode).toBe(200);
      expect(committed.json()).toMatchObject({ dryRun: false, restored: true, printers: backup.data.printers.length, storagePathsStripped: 1 });

      const oldTokenLocked = await app.inject({ method: "GET", url: "/api/state", headers: auth(token) });
      expect(oldTokenLocked.statusCode).toBe(401);

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
      expect(persisted.events.some((event) => event.type === "admin.restore")).toBe(true);
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
