import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./server.mjs";
import { parseWorkerConfig, runWorkerCycle } from "./worker.mjs";

describe("3DSTU FarmFlow background worker", () => {
  it("parses production worker environment settings", () => {
    const config = parseWorkerConfig({
      LAYERPILOT_WORKER_ID: "qc-worker",
      LAYERPILOT_WORKER_TELEMETRY: "true",
      LAYERPILOT_WORKER_BRIDGE_POLLING: "false",
      LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS: "1500",
      LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS: "2500",
      LAYERPILOT_WORKER_TELEMETRY_INCREMENT: "7",
      LAYERPILOT_API_INTERNAL_URL: "http://layerpilot:8797/",
      LAYERPILOT_WORKER_TOKEN: "worker-secret",
      LAYERPILOT_WORKER_RUN_ONCE: "true"
    });
    expect(config).toMatchObject({
      id: "qc-worker",
      telemetryEnabled: true,
      bridgePollingEnabled: false,
      telemetryIntervalMs: 1500,
      bridgePollingIntervalMs: 2500,
      telemetryIncrement: 7,
      apiInternalUrl: "http://layerpilot:8797",
      workerToken: "worker-secret",
      runOnce: true
    });
  });

  it("runs telemetry and records a durable worker heartbeat", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "layerpilot-worker-"));
    const dbPath = path.join(dir, "db.json");
    try {
      const db = await openDatabase(dbPath);
      db.data.printers.forEach((item) => {
        item.status = "idle";
        item.progress = 0;
        item.job = "";
      });
      db.data.queue.forEach((item) => {
        if (item.status === "printing" || item.stage === "printing") {
          item.status = "complete";
          item.stage = "post processing";
        }
      });
      const printer = db.data.printers[0];
      printer.status = "printing";
      printer.progress = 96;
      printer.job = "Worker QC cube.gcode";
      db.data.queue.push({
        id: "worker-qc-job",
        fileId: "worker-qc-file",
        file: "Worker QC cube.gcode",
        printerId: printer.id,
        printer: printer.name,
        status: "printing",
        priority: "Normal",
        stage: "printing",
        material: "PLA",
        color: "Any",
        due: "Today 18:00",
        dimensions: [20, 20, 20],
        assignee: "Worker",
        time: "0h 10m",
        cost: 3,
        added: "Worker test"
      });
      await db.write();

      const result = await runWorkerCycle(db, {
        id: "qc-worker",
        telemetryEnabled: true,
        bridgePollingEnabled: false,
        telemetryIncrement: 10,
        telemetryIntervalMs: 5000,
        bridgePollingIntervalMs: 10000
      });
      expect(result.telemetry).toMatchObject({ changed: true, completedJobs: [expect.objectContaining({ id: "worker-qc-job" })] });
      expect(result.bridgePolling).toMatchObject({ skipped: true });
      expect(db.data.dataMeta.worker).toMatchObject({
        id: "qc-worker",
        telemetryEnabled: true,
        bridgePollingEnabled: false,
        telemetryIntervalMs: 5000,
        bridgePollingIntervalMs: 10000,
        lastTelemetryChanged: true
      });
      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.queue.find((job) => job.id === "worker-qc-job")).toMatchObject({ status: "complete", stage: "post processing" });
      expect(persisted.dataMeta.worker.id).toBe("qc-worker");
      expect(persisted.events.some((event) => event.type === "print.completed")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reloads the shared database before each cycle so it does not clobber API writes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "layerpilot-worker-"));
    const dbPath = path.join(dir, "db.json");
    try {
      const workerDb = await openDatabase(dbPath);
      const apiDb = await openDatabase(dbPath);
      apiDb.data.quoteRequests.unshift({
        id: "qr-concurrent",
        customer: "Concurrent Customer",
        email: "concurrent@example.com",
        project: "Race check",
        material: "PLA",
        quantity: 1,
        due: "Flexible",
        budget: 0,
        source: "Website",
        status: "new",
        priority: "Normal"
      });
      await apiDb.write();

      await runWorkerCycle(workerDb, { id: "race-worker", telemetryEnabled: true, bridgePollingEnabled: false });

      const persisted = JSON.parse(await readFile(dbPath, "utf8"));
      expect(persisted.quoteRequests.some((quote) => quote.id === "qr-concurrent")).toBe(true);
      expect(persisted.dataMeta.worker.id).toBe("race-worker");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
