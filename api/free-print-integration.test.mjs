import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, it, expect, vi } from "vitest";
import {
  buildServer,
  openDatabase,
  autoScheduleQueue,
  optimizeScheduleQueue,
  constraintScheduleQueue,
  matchQueueNow,
} from "./server.mjs";
const cleanups = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()();
  vi.unstubAllEnvs();
});
it("authenticates station control independently from staff and serializes worker writes through the API", async () => {
  vi.stubEnv("LAYERPILOT_WORKER_TOKEN", "station-integration-worker");
  const dir = await mkdtemp(path.join(tmpdir(), "3drfm-station-integration-"));
  const db = await openDatabase(path.join(dir, "state.json"));
  const app = await buildServer({
    db,
    serveStatic: false,
    emailClient: { send: vi.fn(async () => {}) },
  });
  cleanups.push(async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  });
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/api/customer/workspace/free-print/station",
      })
    ).statusCode
  ).toBe(401);
  const registered = await app.inject({
    method: "POST",
    url: "/api/customer-auth/register",
    payload: {
      name: "站點測試",
      email: "station-integration@example.test",
      password: "station-test-123",
    },
  });
  expect(registered.statusCode).toBe(201);
  const member = registered.json();
  const state = await app.inject({
    method: "GET",
    url: "/api/customer/workspace/free-print/station",
    headers: { authorization: `Bearer ${member.token}` },
  });
  expect(state.statusCode, state.body).toBe(200);
  expect(state.json().station.open).toBe(false);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/api/member-service/free-print-station",
        headers: { authorization: `Bearer ${member.token}` },
      })
    ).statusCode
  ).toBe(401);
  const payload = {
    id: "station-worker",
    telemetryEnabled: false,
    bridgePollingEnabled: false,
    telemetryIncrement: 2,
  };
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/internal/worker-cycle",
        payload,
      })
    ).statusCode
  ).toBe(401);
  db.data.freePrintReservations.push({
    id: "do-not-overwrite",
    stationId: "nthu-shuimu",
    workspaceId: "ws-default",
    customerId: member.customer.id,
    status: "queued",
    sequence: 1,
  });
  const cycle = await app.inject({
    method: "POST",
    url: "/api/internal/worker-cycle",
    headers: { "x-layerpilot-worker-token": "station-integration-worker" },
    payload,
  });
  expect(cycle.statusCode, cycle.body).toBe(200);
  expect(cycle.json().apiNotify.ok).toBe(true);
  expect(
    db.data.freePrintReservations.find((r) => r.id === "do-not-overwrite")
      .status
  ).toBe("queued");
  expect(db.data.dataMeta.worker.id).toBe("station-worker");
  const printer = db.data.printers[0];
  printer.status = "idle";
  db.data.printers = [printer];
  db.data.bridges = [];
  db.data.freePrintStations[0].printerId = printer.id;
  db.data.freePrintStations[0].enabled = true;
  db.data.queue = [
    {
      id: "paid-work",
      status: "queued",
      stage: "needs scheduling",
      priority: "Normal",
      material: "PETG",
      color: "Any",
      dimensions: [10, 10, 10],
      time: "0h 10m",
      file: "paid.gcode",
    },
  ];
  expect(autoScheduleQueue(db.data).scheduled).toEqual([]);
  expect(optimizeScheduleQueue(db.data).scheduled).toEqual([]);
  expect(constraintScheduleQueue(db.data).scheduled).toEqual([]);
  expect(matchQueueNow(db.data).matches).toEqual([]);
  db.data.freePrintStations[0].enabled = false;
  db.data.freePrintReservations[0].status = "awaiting_removal";
  expect(autoScheduleQueue(db.data).scheduled).toEqual([]);
});
