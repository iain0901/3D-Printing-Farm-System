import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer, openDatabase } from "./server.mjs";

const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await rm(cleanups.pop(), { recursive: true, force: true });
});

async function createApp() {
  const directory = await mkdtemp(path.join(tmpdir(), "farmflow-cases-"));
  cleanups.push(directory);
  const db = await openDatabase(path.join(directory, "state.json"));
  const app = await buildServer({ db, serveStatic: false });
  return { app, db };
}

async function login(app) {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "demo@layerpilot.test", password: "layerpilot" }
  });
  expect(response.statusCode).toBe(200);
  return { authorization: `Bearer ${response.json().token}` };
}

describe("unified 3DRFM case API", () => {
  it("moves a public no-model case through quote, payment, Orca approval, and FarmFlow production", async () => {
    const { app, db } = await createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/public/cases",
      payload: {
        mode: "agent",
        source: "website",
        hasModel: false,
        customer: { name: "王小姐", email: "buyer@example.com", phone: "0912345678" },
        project: "客製化感測器外殼",
        purpose: "需要依電路板尺寸建立外殼",
        defaults: { material: "PETG", color: "黑色", quantity: 2, quality: "Standard", infill: 20, walls: 3 },
        modeling: { criticalDimensions: "100 x 80 x 30 mm", requirements: "四角螺絲固定" }
      }
    });
    expect(created.statusCode).toBe(201);
    const { case: publicCreated, accessToken } = created.json();
    expect(publicCreated).toMatchObject({ status: "new", mode: "agent", paymentStatus: "unpaid" });
    expect(publicCreated).not.toHaveProperty("publicAccessTokenHash");

    const portal = await app.inject({ method: "GET", url: `/api/public/cases/${publicCreated.id}?token=${encodeURIComponent(accessToken)}` });
    expect(portal.statusCode).toBe(200);
    expect(portal.json().case.caseNo).toMatch(/^Q-\d{8}-\d{3}$/);

    const headers = await login(app);
    const transition = (status) => app.inject({ method: "POST", url: `/api/cases/${publicCreated.id}/transition`, headers, payload: { status } });
    expect((await transition("under_review")).statusCode).toBe(200);

    const quoted = await app.inject({
      method: "POST",
      url: `/api/cases/${publicCreated.id}/quotes`,
      headers,
      payload: { send: true, scope: "建模與 PETG 列印兩件", breakdown: { modeling: 800, material: 180, machineTime: 420, setup: 100, shipping: 60, tax: 78 } }
    });
    expect(quoted.statusCode).toBe(201);
    expect(quoted.json().quoteVersion).toMatchObject({ versionNo: 1, status: "sent", customerTotal: 1638 });

    const accepted = await app.inject({
      method: "POST",
      url: `/api/public/cases/${publicCreated.id}/decision`,
      payload: { token: accessToken, decision: "accepted", note: "確認製作" }
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().case.quote).toMatchObject({ status: "accepted", total: 1638 });

    expect((await transition("awaiting_payment")).statusCode).toBe(200);
    const payment = await app.inject({
      method: "POST",
      url: `/api/cases/${publicCreated.id}/payments`,
      headers,
      payload: { status: "paid", method: "bank_transfer", amount: 1638, reference: "TRANSFER-001" }
    });
    expect(payment.statusCode).toBe(201);
    expect(payment.json().case.status).toBe("paid");
    expect((await transition("production_pending")).statusCode).toBe(200);

    const current = db.data.cases.find((item) => item.id === publicCreated.id);
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/cases/${publicCreated.id}`,
      headers,
      payload: { printerId: "p-01", parts: current.parts.map((part) => ({ id: part.id, readiness: "ready" })) }
    });
    expect(patched.statusCode).toBe(200);

    const sliced = await app.inject({
      method: "POST",
      url: `/api/cases/${publicCreated.id}/slicer-jobs`,
      headers,
      payload: { status: "completed", gcodeFileId: "gcode-1", profileId: "orca-production", estimatedMinutes: 120, estimatedGrams: 80, approve: true }
    });
    expect(sliced.statusCode).toBe(201);
    expect(sliced.json().readiness.allowed).toBe(true);

    const production = await app.inject({ method: "POST", url: `/api/cases/${publicCreated.id}/production-jobs`, headers, payload: {} });
    expect(production.statusCode).toBe(201);
    expect(production.json().case.status).toBe("ready_to_print");
    expect(production.json().jobs).toHaveLength(1);
    expect(db.data.queue.some((job) => job.sourceCaseId === publicCreated.id)).toBe(true);
    expect(db.data.caseStatusHistory.filter((entry) => entry.caseId === publicCreated.id).length).toBeGreaterThanOrEqual(7);
    await app.close();
  });

  it("keeps internal quote breakdown out of the public response", async () => {
    const { app } = await createApp();
    const created = await app.inject({
      method: "POST",
      url: "/api/public/cases",
      payload: {
        mode: "estimate",
        source: "website",
        hasModel: false,
        customer: { name: "測試客戶", email: "privacy@example.com" },
        project: "展示模型",
        purpose: "建立展示用模型",
        defaults: { material: "PLA", color: "白色", quantity: 1 }
      }
    });
    const { case: caseRecord, accessToken } = created.json();
    const headers = await login(app);
    await app.inject({ method: "POST", url: `/api/cases/${caseRecord.id}/transition`, headers, payload: { status: "under_review" } });
    await app.inject({ method: "POST", url: `/api/cases/${caseRecord.id}/quotes`, headers, payload: { send: true, scope: "展示模型一件", breakdown: { material: 100, risk: 50, discount: 20 } } });
    const portal = await app.inject({ method: "GET", url: `/api/public/cases/${caseRecord.id}?token=${accessToken}` });
    expect(portal.json().case.quote).toMatchObject({ total: 130 });
    expect(portal.json().case.quote).not.toHaveProperty("breakdown");
    await app.close();
  });

  it("shows unified cases in the authenticated member centre and lets the owner decide", async () => {
    const { app } = await createApp();
    const email = "member.case@example.com";
    const created = await app.inject({
      method: "POST",
      url: "/api/public/cases",
      payload: {
        mode: "agent",
        source: "website",
        hasModel: false,
        customer: { name: "Member Case", email },
        project: "Portal-visible print",
        purpose: "Member centre integration test",
        defaults: { material: "PLA", color: "Black", quantity: 1 }
      }
    });
    expect(created.statusCode).toBe(201);
    const caseId = created.json().case.id;
    const registration = await app.inject({
      method: "POST",
      url: "/api/customer-auth/register",
      payload: { name: "Member Case", email, password: "member-case-pass-1" }
    });
    expect(registration.statusCode).toBe(201);
    const customerHeaders = { authorization: `Bearer ${registration.json().token}` };
    const list = await app.inject({ method: "GET", url: "/api/customer/cases", headers: customerHeaders });
    expect(list.statusCode).toBe(200);
    expect(list.json().cases).toHaveLength(1);
    expect(list.json().cases[0]).not.toHaveProperty("publicAccessTokenHash");

    const staffHeaders = await login(app);
    expect((await app.inject({ method: "POST", url: `/api/cases/${caseId}/transition`, headers: staffHeaders, payload: { status: "under_review" } })).statusCode).toBe(200);
    expect((await app.inject({
      method: "POST",
      url: `/api/cases/${caseId}/quotes`,
      headers: staffHeaders,
      payload: { send: true, breakdown: { material: 320 } }
    })).statusCode).toBe(201);
    const decision = await app.inject({
      method: "POST",
      url: `/api/customer/cases/${caseId}/decision`,
      headers: customerHeaders,
      payload: { decision: "accepted" }
    });
    expect(decision.statusCode).toBe(200);
    expect(decision.json().case.status).toBe("accepted");
    await app.close();
  });

  it("tracks confirmed scheduling, print attempts, QC, delivery, and after-sales reprint", async () => {
    const { app, db } = await createApp();
    const created = await app.inject({
      method: "POST", url: "/api/public/cases",
      payload: { mode: "agent", source: "website", hasModel: false, customer: { name: "Operations Buyer", email: "operations@example.com" }, project: "Operations workflow", purpose: "Print, QC, delivery", defaults: { material: "PLA", color: "Black", quantity: 1 } }
    });
    const caseId = created.json().case.id;
    const accessToken = created.json().accessToken;
    const headers = await login(app);
    const transition = (status) => app.inject({ method: "POST", url: `/api/cases/${caseId}/transition`, headers, payload: { status } });
    expect((await transition("under_review")).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/cases/${caseId}/quotes`, headers, payload: { send: true, breakdown: { material: 350 } } })).statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/public/cases/${caseId}/decision`, payload: { token: accessToken, decision: "accepted" } })).statusCode).toBe(200);
    expect((await transition("awaiting_payment")).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/cases/${caseId}/payments`, headers, payload: { status: "paid", method: "cash", amount: 350 } })).statusCode).toBe(201);
    expect((await transition("production_pending")).statusCode).toBe(200);
    const storedCase = db.data.cases.find((item) => item.id === caseId);
    expect((await app.inject({ method: "PATCH", url: `/api/cases/${caseId}`, headers, payload: { printerId: "p-01", parts: storedCase.parts.map((part) => ({ id: part.id, readiness: "ready" })) } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/cases/${caseId}/slicer-jobs`, headers, payload: { status: "completed", gcodeFileId: "gcode-1", profileId: "orca-production", approve: true } })).statusCode).toBe(201);
    const production = await app.inject({ method: "POST", url: `/api/cases/${caseId}/production-jobs`, headers, payload: {} });
    expect(production.statusCode).toBe(201);
    const jobId = production.json().jobs[0].id;

    db.data.printers.push({ id: "p-01", workspaceId: "ws-default", status: "idle", compatibleMaterials: ["PLA"] });
    const suggested = await app.inject({ method: "POST", url: `/api/cases/${caseId}/schedule/suggest`, headers, payload: {} });
    expect(suggested.statusCode).toBe(200);
    expect(suggested.json().scheduleSuggestion).toMatchObject({ suggestedPrinterId: "p-01", suggestedBy: "system" });
    expect((await app.inject({ method: "POST", url: `/api/cases/${caseId}/schedule/confirm`, headers, payload: { startAt: suggested.json().scheduleSuggestion.suggestedStartAt, printerId: "p-01" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/cases/${caseId}/print-attempts`, headers, payload: { action: "started", queueJobId: jobId } })).statusCode).toBe(201);
    const printed = await app.inject({ method: "POST", url: `/api/cases/${caseId}/print-attempts`, headers, payload: { action: "completed", queueJobId: jobId } });
    expect(printed.statusCode).toBe(201);
    expect(printed.json().case.status).toBe("quality_check");
    const partId = db.data.cases.find((item) => item.id === caseId).parts[0].id;
    const qc = await app.inject({ method: "POST", url: `/api/cases/${caseId}/quality-checks`, headers, payload: { parts: [{ partId, result: "passed", notes: "Measurements within tolerance" }] } });
    expect(qc.statusCode).toBe(201);
    expect(qc.json().case.status).toBe("ready_for_delivery");
    const delivery = await app.inject({ method: "POST", url: `/api/cases/${caseId}/delivery`, headers, payload: { method: "courier", status: "delivered", carrier: "Local carrier", trackingNumber: "TRACK-001" } });
    expect(delivery.statusCode).toBe(200);
    expect(delivery.json().case.status).toBe("completed");
    const afterSales = await app.inject({ method: "POST", url: `/api/cases/${caseId}/aftersales`, headers, payload: { type: "reprint", description: "Customer requested a replacement", reopenProduction: true } });
    expect(afterSales.statusCode).toBe(201);
    expect(afterSales.json().case.status).toBe("production_pending");
    await app.close();
  });
});
