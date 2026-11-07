import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerMaintenanceAdvisor, forecastFleetMaintenance } from "./maintenance-advisor.mjs";
const apps = [];
afterEach(async () => { while (apps.length) await apps.pop().close(); });
function observation(printerId, day, hours, events, serviced = true) {
  return { printerId, observedAt: `2026-09-${String(day).padStart(2, "0")}T00:00:00.000Z`, totalPrintHours: hours, abnormalEvents: events, serviced };
}
const peers = [observation("b", 1, 0, 0), observation("b", 2, 100, 10), observation("b", 3, 300, 10),
  observation("c", 1, 0, 0), observation("c", 2, 200, 0)];
async function fixture({ result, configured = true } = {}) {
  const app = Fastify(); apps.push(app);
  const database = { data: { printers: ["a", "b", "c"].map((id) => ({ id, model: 'Synthetic-FDM', workspaceId: "w" })), maintenanceAdvisorRecords: [] }, write: vi.fn(async () => {}) };
  app.addHook("preHandler", async (req) => {
    if (req.headers["x-user"]) req.user = { id: req.headers["x-user"], workspaceId: req.headers["x-workspace"] || "w" };
  });
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] }) }));
  await registerMaintenanceAdvisor(app, { database, fetchImpl,
    env: configured ? { OPENAI_API_KEY: "synthetic-test-key" } : {},
    hasPermission: (user) => user.id === "staff",
    scopedData: (data, user) => ({ printers: data.printers.filter((p) => p.workspaceId === user.workspaceId) }),
  });
  const request = (method, path, payload, headers = { "x-user": "staff" }) => app.inject({ method, url: "/api/maintenance/advisor" + path, payload, headers });
  return { app, database, fetchImpl, request };
}
const diagnosisInput = { printerId: "a", consent: true, logs: [{ id: "L1", text: "extrusion warning token=private-fixture" }], photos: [{ id: "P1", image: "data:image/png;base64,ZmFrZQ==" }] };
const diagnosis = { summary: "可能供料不穩", uncertainty: "試印照片無法單獨確診，請人工檢查", findings: [{ hypothesis: "可能供料不穩", logIds: ["L1"], photoIds: ["P1"], nextSteps: ["停機且冷卻後由工程師檢查"] }] };
describe("maintenance advisor: evidence and safety", () => {
  it("requires both logs and photos, permission, workspace and provider; does not perform hardware operations", async () => {
    const f = await fixture({ configured: false });
    expect((await f.request("POST", "/diagnose", diagnosisInput, {})).statusCode).toBe(401);
    expect((await f.request("POST", "/diagnose", diagnosisInput, { "x-user": "viewer" })).statusCode).toBe(403);
    expect((await f.request("POST", "/diagnose", diagnosisInput, { "x-user": "staff", "x-workspace": "other" })).statusCode).toBe(404);
    expect((await f.request("POST", "/diagnose", { ...diagnosisInput, photos: [] })).statusCode).toBe(400);
    expect((await f.request("POST", "/diagnose", diagnosisInput)).statusCode).toBe(503);
    expect(f.fetchImpl).not.toHaveBeenCalled();
    expect(f.database.data.maintenanceAdvisorRecords).toEqual([]);
  });
  it("jointly supplies logs and images, validates evidence, persists redacted report and reloads it", async () => {
    const f = await fixture({ result: diagnosis });
    const response = await f.request("POST", "/diagnose", diagnosisInput);
    expect(response.statusCode, response.body).toBe(200);
    const row = response.json();
    expect(row.diagnosis).toEqual(diagnosis);
    expect(row.logs[0].text).not.toContain("private-fixture");
    expect(row.photos[0]).toHaveProperty("sha256");
    expect(row.photos[0]).not.toHaveProperty("image");
    const body = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    expect(body.input[0].content.some((c) => c.type === "input_image")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("private-fixture");
    expect((await f.request("GET", "/reports")).json()[0].id).toBe(row.id);
    expect((await f.request("GET", "/reports", undefined, { "x-user": "staff", "x-workspace": "other" })).json()).toEqual([]);
    expect(f.database.write).toHaveBeenCalled();
  });
  it("rejects fabricated evidence references without saving a diagnosis", async () => {
    const f = await fixture({ result: { ...diagnosis, findings: [{ ...diagnosis.findings[0], photoIds: ["P999"] }] } });
    expect((await f.request("POST", "/diagnose", diagnosisInput)).statusCode).toBe(502);
    expect(f.database.data.maintenanceAdvisorRecords.every((r) => r.advisorType === "attempt")).toBe(true);
  });
});
describe("empirical fleet maintenance forecasting, not trained AI", () => {
  it('exports only its workspace, archives without deletion and rejects stale export/forecast inputs', async () => {
    const f = await fixture();
    const rows = [...peers, observation('a', 1, 0, 0), observation('a', 2, 40, 0, false)];
    await f.request('POST', '/observations', rows);
    const forecast = (await f.request('POST', '/forecast', { printerId: 'a' })).json();
    const first = (await f.request('GET', '/observations/export')).json();
    expect(first.active).toHaveLength(rows.length);
    expect((await f.request('GET', '/observations/export', undefined, { 'x-user': 'staff', 'x-workspace': 'other' })).json().records).toEqual([]);
    expect((await f.request('POST', '/observations/archive', { activeDigest: first.activeDigest })).statusCode).toBe(400);
    await f.request('POST', '/observations', [observation('a', 3, 50, 1, false)]);
    expect((await f.request('POST', '/observations/archive', { confirm: true, activeDigest: first.activeDigest })).statusCode).toBe(409);
    const latest = (await f.request('GET', '/observations/export')).json();
    expect((await f.request('POST', '/observations/archive', { confirm: true, activeDigest: latest.activeDigest })).json().archivedCount).toBe(rows.length + 1);
    const archived = (await f.request('GET', '/observations/export')).json();
    expect(archived.active).toEqual([]); expect(archived.records).toHaveLength(2);
    expect(archived.records.every(r => r.archivedAt)).toBe(true);
    expect((await f.request('POST', `/reports/${forecast.id}/task`, { confirm: true })).statusCode).toBe(409);
    expect((await f.request('POST', '/forecast', { printerId: 'a' })).json().forecast.status).toBe('insufficient_data');
    expect((await f.request('POST', '/observations', rows)).statusCode).toBe(200);
    expect((await f.request('POST', '/forecast', { printerId: 'a' })).json().forecast.status).toBe('estimate');
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("requires multiple peer printers and complete intervals rather than a fixed timetable", () => {
    const rows = [observation("a", 1, 0, 0), observation("a", 2, 40, 0, false)];
    expect(forecastFleetMaintenance(rows, "a").status).toBe("insufficient_data");
    expect(forecastFleetMaintenance([...rows, ...peers.filter((p) => p.printerId === "b")], "a").status).toBe("insufficient_data");
  });
  it("uses both hours and cross-printer abnormal events; new observations update digest and estimate", () => {
    const start = [observation("a", 1, 0, 0), observation("a", 2, 40, 0, false), ...peers];
    const normal = forecastFleetMaintenance(start, "a");
    expect(normal.remainingHours).toEqual([160, 160]);
    const abnormal = forecastFleetMaintenance([...start, observation("a", 3, 50, 5, false)], "a");
    expect(abnormal.remainingHours).toEqual([50, 50]);
    expect(abnormal.sourceDigest).not.toBe(normal.sourceDigest);
    expect(abnormal.peerCount).toBe(2);
    expect(abnormal.evidence).toHaveLength(3);
  });
  it("persists imported observations and forecasts without creating maintenance tasks", async () => {
    const f = await fixture();
    const rows = [...peers, observation("a", 1, 0, 0), observation("a", 2, 40, 0, false)];
    expect((await f.request("POST", "/observations", rows)).statusCode).toBe(200);
    const report = await f.request("POST", "/forecast", { printerId: "a" });
    expect(report.json().forecast.status).toBe("estimate");
    expect((await f.request("GET", "/reports")).json()).toHaveLength(2);
    expect((await f.request("POST", "/observations", [observation("a", 3, 30, 0, false)])).statusCode).toBe(400);
    expect(f.database.data.maintenance).toBeUndefined();
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("creates a real maintenance task only after explicit confirmation, replays safely and rejects stale forecasts", async () => {
    const f = await fixture();
    await f.request("POST", "/observations", [...peers, observation("a", 1, 0, 0), observation("a", 2, 40, 0, false)]);
    const report = (await f.request("POST", "/forecast", { printerId: "a" })).json();
    expect((await f.request("POST", `/reports/${report.id}/task`, {})).statusCode).toBe(400);
    const created = (await f.request("POST", `/reports/${report.id}/task`, { confirm: true })).json();
    expect(created.replayed).toBe(false);
    expect((await f.request("POST", `/reports/${report.id}/task`, { confirm: true })).json().jobId).toBe(created.jobId);
    expect(f.database.data.maintenance).toHaveLength(1);
    expect(f.database.data.maintenance[0].advisorReportId).toBe(report.id);
    const next = (await f.request("POST", "/forecast", { printerId: "a" })).json();
    await f.request("POST", "/observations", [observation("a", 3, 50, 1, false)]);
    expect((await f.request("POST", `/reports/${next.id}/task`, { confirm: true })).statusCode).toBe(409);
  });
  it("does not use a different printer model as the target maintenance cohort", async () => {
    const f = await fixture();
    await f.request("POST", "/observations", [...peers, observation("a", 1, 0, 0), observation("a", 2, 40, 0, false)]);
    f.database.data.printers.find((p) => p.id === "c").model = "Other-machine";
    expect((await f.request("POST", "/forecast", { printerId: "a" })).json().forecast.status).toBe("insufficient_data");
  });
});
