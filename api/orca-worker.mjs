import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const envNumber = (name, fallback, env = process.env) => {
  const value = Number(env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

export function parseOrcaWorkerConfig(env = process.env) {
  return {
    apiUrl: String(env.LAYERPILOT_API_INTERNAL_URL || "http://layerpilot:8797").replace(/\/+$/, ""),
    workerToken: String(env.LAYERPILOT_WORKER_TOKEN || ""),
    workerId: String(env.ORCA_WORKER_ID || "orca-worker"),
    command: String(env.ORCA_SLICER_CMD || "orca-slicer"),
    version: String(env.ORCA_SLICER_VERSION || "2.4.2"),
    settingsPath: String(env.ORCA_SLICER_SETTINGS_PATH || ""),
    filamentPath: String(env.ORCA_SLICER_FILAMENT_PATH || ""),
    intervalMs: envNumber("ORCA_WORKER_INTERVAL_MS", 3000, env),
    timeoutMs: envNumber("ORCA_SLICER_TIMEOUT_MS", 20 * 60 * 1000, env),
    runOnce: ["1", "true", "yes"].includes(String(env.ORCA_WORKER_RUN_ONCE || "").toLowerCase())
  };
}

function headers(config) {
  return { "x-layerpilot-worker-token": config.workerToken };
}

async function api(config, pathName, init = {}) {
  const response = await fetch(`${config.apiUrl}${pathName}`, {
    ...init,
    headers: { ...headers(config), ...(init.headers || {}) }
  });
  if (!response.ok) throw new Error(`Orca API ${pathName} returned ${response.status}: ${await response.text()}`);
  return response;
}

function parseDurationMinutes(text) {
  const match = text.match(/estimated printing time[^=]*=\s*([^\r\n]+)/i);
  if (!match) return 0;
  const value = match[1];
  const hours = Number(value.match(/(\d+)h/i)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)m/i)?.[1] || 0);
  const seconds = Number(value.match(/(\d+)s/i)?.[1] || 0);
  return Math.round(hours * 60 + minutes + seconds / 60);
}

function parseMaterialGrams(text) {
  const match = text.match(/total filament used \[g\]\s*=\s*([\d.]+)/i) || text.match(/filament used \[g\]\s*=\s*([\d.]+)/i);
  return match ? Math.round(Number(match[1]) * 100) / 100 : 0;
}

export function buildOrcaArgs(job, inputPath, outputDir, config) {
  const args = ["--arrange", "1", "--orient", "1", "--ensure-on-bed", "--slice", "0", "--outputdir", outputDir];
  const settingsPath = job.settingsPath || config.settingsPath;
  const filamentPath = job.filamentPath || config.filamentPath;
  if (settingsPath) args.push("--load-settings", settingsPath);
  if (filamentPath) args.push("--load-filaments", filamentPath);
  args.push(inputPath);
  return args;
}

async function locateGcode(outputDir) {
  const { readdir } = await import("node:fs/promises");
  const files = await readdir(outputDir, { recursive: true });
  const candidate = files.find((file) => /\.(gcode|gco|g)$/i.test(file));
  if (!candidate) throw new Error("OrcaSlicer did not produce a G-code file");
  return path.join(outputDir, candidate);
}

export async function runOrcaSlice(job, inputBytes, config) {
  const root = await mkdtemp(path.join(os.tmpdir(), "farmflow-orca-"));
  try {
    const inputDir = path.join(root, "input");
    const outputDir = path.join(root, "output");
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const filename = path.basename(job.sourceFile.name || "input.stl");
    const inputPath = path.join(inputDir, filename);
    await writeFile(inputPath, inputBytes);
    const args = buildOrcaArgs(job, inputPath, outputDir, config);
    const result = await execFileAsync(config.command, args, { timeout: config.timeoutMs, maxBuffer: 10 * 1024 * 1024, windowsHide: true });
    const gcodePath = await locateGcode(outputDir);
    const gcode = await readFile(gcodePath);
    const text = gcode.toString("utf8");
    return {
      filename: path.basename(gcodePath),
      buffer: gcode,
      estimatedMinutes: parseDurationMinutes(text),
      estimatedGrams: parseMaterialGrams(text),
      warnings: String(result.stderr || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).slice(-30),
      stdout: String(result.stdout || "").slice(-4000)
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function uploadResult(config, job, result) {
  const form = new FormData();
  form.append("file", new Blob([result.buffer], { type: "text/x-gcode" }), result.filename);
  form.append("estimatedMinutes", String(result.estimatedMinutes));
  form.append("estimatedGrams", String(result.estimatedGrams));
  form.append("warnings", result.warnings.join("\n"));
  form.append("workerVersion", config.version);
  await api(config, `/api/internal/orca/jobs/${encodeURIComponent(job.id)}/result`, { method: "POST", body: form });
}

export async function runOrcaWorkerCycle(config = parseOrcaWorkerConfig()) {
  if (!config.workerToken) throw new Error("LAYERPILOT_WORKER_TOKEN is required");
  const claimed = await api(config, "/api/internal/orca/jobs/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workerId: config.workerId })
  }).then((response) => response.json());
  if (!claimed.job) return { claimed: false };
  const job = claimed.job;
  try {
    const input = await api(config, `/api/internal/orca/files/${encodeURIComponent(job.sourceFile.id)}`).then((response) => response.arrayBuffer());
    const result = await runOrcaSlice(job, Buffer.from(input), config);
    await uploadResult(config, job, result);
    return { claimed: true, completed: true, jobId: job.id, estimatedMinutes: result.estimatedMinutes, estimatedGrams: result.estimatedGrams };
  } catch (error) {
    await api(config, `/api/internal/orca/jobs/${encodeURIComponent(job.id)}/fail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: error instanceof Error ? error.message : "OrcaSlicer worker failed" })
    }).catch(() => undefined);
    return { claimed: true, completed: false, jobId: job.id, error: error instanceof Error ? error.message : "OrcaSlicer worker failed" };
  }
}

export async function startOrcaWorker(config = parseOrcaWorkerConfig()) {
  let stopped = false;
  const cycle = async () => {
    if (stopped) return;
    const result = await runOrcaWorkerCycle(config);
    if (result.claimed) console.log(`[orca-worker] ${result.completed ? "completed" : "failed"} ${result.jobId}`);
  };
  await cycle();
  if (config.runOnce) return { stop: async () => { stopped = true; } };
  const timer = setInterval(() => cycle().catch((error) => console.error("[orca-worker] cycle failed", error)), config.intervalMs);
  return { stop: async () => { stopped = true; clearInterval(timer); } };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const worker = await startOrcaWorker();
  const shutdown = async () => { await worker.stop(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
