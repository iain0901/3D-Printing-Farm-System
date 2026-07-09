import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { openDatabase, runBridgePollingTick, runTelemetryTick } from "./server.mjs";

function envFlag(name, fallback = false, env = process.env) {
  const value = String(env[name] ?? "").trim().toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function envNumber(name, fallback, env = process.env) {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function parseWorkerConfig(env = process.env) {
  return {
    id: String(env.LAYERPILOT_WORKER_ID || `worker-${randomUUID()}`),
    dbPath: env.LAYERPILOT_DB_PATH,
    telemetryEnabled: envFlag("LAYERPILOT_WORKER_TELEMETRY", true, env),
    bridgePollingEnabled: envFlag("LAYERPILOT_WORKER_BRIDGE_POLLING", true, env),
    telemetryIntervalMs: envNumber("LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS", 5000, env),
    bridgePollingIntervalMs: envNumber("LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS", 10000, env),
    telemetryIncrement: envNumber("LAYERPILOT_WORKER_TELEMETRY_INCREMENT", 2, env),
    apiInternalUrl: String(env.LAYERPILOT_API_INTERNAL_URL || "").replace(/\/+$/g, ""),
    workerToken: String(env.LAYERPILOT_WORKER_TOKEN || ""),
    runOnce: envFlag("LAYERPILOT_WORKER_RUN_ONCE", false, env)
  };
}

async function notifyApi(config, result) {
  if (!config.apiInternalUrl || !config.workerToken) return { skipped: true };
  const response = await fetch(`${config.apiInternalUrl}/api/internal/worker-broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-layerpilot-worker-token": config.workerToken
    },
    body: JSON.stringify({ reason: "worker.cycle", workerId: result.id })
  });
  return { skipped: false, ok: response.ok, status: response.status };
}

export async function runWorkerCycle(database, config = {}) {
  const startedAt = new Date().toISOString();
  const result = {
    id: config.id || "worker",
    startedAt,
    telemetry: { skipped: true },
    bridgePolling: { skipped: true }
  };
  if (config.reloadBeforeCycle !== false) {
    // The API process writes the same document; reload before mutating so this
    // cycle's full-document write does not clobber writes made since the last cycle.
    const previous = database.data;
    await database.read();
    database.data ||= previous;
  }
  if (config.telemetryEnabled !== false) {
    result.telemetry = await runTelemetryTick(database, { increment: config.telemetryIncrement ?? 2 });
  }
  if (config.bridgePollingEnabled !== false) {
    result.bridgePolling = await runBridgePollingTick(database);
  }
  database.data.dataMeta ||= {};
  database.data.dataMeta.worker = {
    id: result.id,
    lastRunAt: new Date().toISOString(),
    telemetryEnabled: config.telemetryEnabled !== false,
    bridgePollingEnabled: config.bridgePollingEnabled !== false,
    telemetryIntervalMs: config.telemetryIntervalMs,
    bridgePollingIntervalMs: config.bridgePollingIntervalMs,
    lastTelemetryChanged: Boolean(result.telemetry?.changed),
    lastBridgeChanged: Boolean(result.bridgePolling?.changed)
  };
  await database.write();
  result.apiNotify = await notifyApi(config, result).catch((error) => ({ skipped: false, ok: false, error: error instanceof Error ? error.message : "API notify failed" }));
  return result;
}

export async function startWorker(config = parseWorkerConfig(), options = {}) {
  const database = options.database || await openDatabase(config.dbPath);
  let stopped = false;
  let running = false;
  const logger = options.logger || console;
  const runSafely = async (reason) => {
    if (running || stopped) return null;
    running = true;
    try {
      const result = await runWorkerCycle(database, config);
      if (logger?.log) logger.log(`[layerpilot-worker] ${reason}: telemetry=${Boolean(result.telemetry?.changed)} bridge=${Boolean(result.bridgePolling?.changed)} apiNotify=${result.apiNotify?.skipped ? "skipped" : result.apiNotify?.ok ? "ok" : "failed"}`);
      return result;
    } catch (error) {
      if (logger?.error) logger.error("[layerpilot-worker] cycle failed", error);
      return null;
    } finally {
      running = false;
    }
  };
  await runSafely("startup");
  if (config.runOnce) {
    return { database, stop: async () => { stopped = true; await database.close?.(); } };
  }
  const telemetryTimer = config.telemetryEnabled === false ? null : setInterval(() => runSafely("telemetry"), config.telemetryIntervalMs);
  const bridgeTimer = config.bridgePollingEnabled === false ? null : setInterval(() => runSafely("bridge-poll"), config.bridgePollingIntervalMs);
  return {
    database,
    stop: async () => {
      stopped = true;
      if (telemetryTimer) clearInterval(telemetryTimer);
      if (bridgeTimer) clearInterval(bridgeTimer);
      await database.close?.();
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const config = parseWorkerConfig();
  const worker = await startWorker(config);
  const shutdown = async () => {
    await worker.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  if (config.runOnce) await shutdown();
}
