import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createStationPlate } from "./station-plate.mjs";

const execFileAsync = promisify(execFile);
const REFERENCE_MACHINE = "Artillery M1 Pro 0.4 nozzle";
const REFERENCE_PROCESS = "0.20mm Standard @Artillery M1 Pro 0.4 nozzle";
const MATERIAL_FILAMENTS = Object.freeze({
  PLA: "Artillery PLA Basic @Artillery M1 Pro 0.4 nozzle",
  PETG: "Artillery PETG @Artillery M1 Pro 0.4 nozzle",
  ASA: "Artillery ASA @Artillery M1 Pro 0.4 nozzle",
  TPU: "Artillery TPU @Artillery M1 Pro 0.4 nozzle"
});

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
    resourcesRoot: String(env.ORCA_SLICER_RESOURCES_ROOT || "/opt/orca/resources/profiles"),
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

export function resolveReferenceProfiles(material, resourcesRoot = "/opt/orca/resources/profiles") {
  const normalized = String(material || "").trim().toUpperCase();
  const filament = MATERIAL_FILAMENTS[normalized];
  if (!filament) throw new Error(`Unsupported material: ${material}. Supported materials: ${Object.keys(MATERIAL_FILAMENTS).join(", ")}`);
  const vendorRoot = path.join(resourcesRoot, "Artillery");
  return {
    material: normalized,
    machinePath: path.join(vendorRoot, "machine", `${REFERENCE_MACHINE}.json`),
    processPath: path.join(vendorRoot, "process", `${REFERENCE_PROCESS}.json`),
    filamentPath: path.join(vendorRoot, "filament", `${filament}.json`),
    profileName: `${REFERENCE_MACHINE} / ${REFERENCE_PROCESS} / ${filament} (bundled reference profile; not the customer's configured printer)`
  };
}

export async function resolvePresetInheritance(filename, seen = new Set()) {
  if (seen.has(filename)) throw new Error("Cyclic Orca profile inheritance");
  seen.add(filename);
  const current = JSON.parse(await readFile(filename, "utf8"));
  let merged = current;
  if (current.inherits) {
    const directory = path.dirname(filename);
    const candidates = await readdir(directory, { recursive: true });
    const parent = candidates.find(item => path.basename(item, ".json") === current.inherits);
    if (!parent) throw new Error(`Missing Orca parent preset: ${current.inherits}`);
    merged = { ...await resolvePresetInheritance(path.join(directory, parent), seen), ...current };
  }
  delete merged.inherits;
  merged.from = "system";
  return merged;
}

export function buildJobProcessConfig(job) {
  return {
    type: "process",
    name: `FarmFlow private ${job.id || "quote"}`,
    inherits: REFERENCE_PROCESS,
    from: "user",
    instantiation: "true",
    compatible_printers: [REFERENCE_MACHINE],
    layer_height: String(job.layerHeight),
    initial_layer_print_height: String(Math.max(0.2, Number(job.layerHeight))),
    sparse_infill_density: `${Number(job.infill)}%`,
    wall_loops: String(Number(job.walls)),
    enable_support: job.autoSupports ? "1" : "0",
    support_type: "tree(auto)",
    support_style: "default",
    gcode_comments: "1",
    ...(job.purpose === "free-print" ? { enable_arc_fitting: "0" } : {})
  };
}

function parseDurationMinutes(text) {
  const candidates = [...text.matchAll(/(?:total estimated time|model printing time|estimated printing time)[^:=]*[:=]\s*([^\r\n;]+)/gi)];
  const match = candidates.find((item) => /total estimated time/i.test(item[0])) || candidates[0];
  if (!match) return 0;
  const value = match[1];
  const days = Number(value.match(/(\d+)d/i)?.[1] || 0);
  const hours = Number(value.match(/(\d+)h/i)?.[1] || 0);
  const minutes = Number(value.match(/(\d+)m/i)?.[1] || 0);
  const seconds = Number(value.match(/(\d+)s/i)?.[1] || 0);
  return days * 1440 + hours * 60 + minutes + seconds / 60;
}

function extrusionRole(comment, currentRole) {
  const feature = comment.match(/\b(?:FEATURE|TYPE)\s*:\s*(.+?)\s*$/i)?.[1]?.trim();
  if (!feature) return currentRole;
  if (/support(?:\s+interface|\s+material)?|support interface/i.test(feature)) return "support";
  if (/brim|skirt|prime|purge|flush|wipe tower|custom|travel/i.test(feature)) return "other";
  return "model";
}

/** Parse deposited filament by G-code feature; retract/restore movement is excluded. */
export function parseGcodeMetrics(text) {
  const diameter = Number(text.match(/;\s*filament_diameter\s*[:=]\s*([\d.]+)/i)?.[1]);
  const density = Number(text.match(/;\s*filament_density\s*[:=]\s*([\d.]+)/i)?.[1]);
  if (!(diameter > 0) || !(density > 0)) throw new Error("Generated G-code is missing a valid filament diameter or density");

  let relative = false;
  let tool = 0;
  let role = "other";
  const tools = new Map();
  const state = () => {
    if (!tools.has(tool)) tools.set(tool, { currentE: 0, retractionDebt: 0 });
    return tools.get(tool);
  };
  const deposited = { model: 0, support: 0, other: 0 };

  for (const raw of text.split(/\r?\n/)) {
    const semicolon = raw.indexOf(";");
    const comment = semicolon >= 0 ? raw.slice(semicolon + 1) : "";
    role = extrusionRole(comment, role);
    const line = (semicolon >= 0 ? raw.slice(0, semicolon) : raw).trim();
    if (!line) continue;
    if (/^M82\b/i.test(line)) { relative = false; continue; }
    if (/^M83\b/i.test(line)) { relative = true; continue; }
    const toolChange = line.match(/^T(\d+)\b/i);
    if (toolChange) { tool = Number(toolChange[1]); continue; }
    const reset = line.match(/^G92\b[^;]*\bE\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
    if (reset) { state().currentE = Number(reset[1]); continue; }
    if (!/^G0?[123]\b/i.test(line)) continue;
    const match = line.match(/\bE\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)/i);
    if (!match) continue;
    const nextE = Number(match[1]);
    if (!Number.isFinite(nextE)) continue;
    const current = state();
    const delta = relative ? nextE : nextE - current.currentE;
    if (!relative) current.currentE = nextE;
    if (delta < 0) {
      current.retractionDebt += -delta;
      continue;
    }
    if (delta <= 0) continue;
    const restored = Math.min(delta, current.retractionDebt);
    current.retractionDebt -= restored;
    const actual = delta - restored;
    if (actual > 0) deposited[role] += actual;
  }

  const gramsPerMm = Math.PI * (diameter / 2) ** 2 / 1000 * density;
  const mass = (mm) => mm * gramsPerMm;
  const modelGrams = mass(deposited.model);
  const supportGrams = mass(deposited.support);
  const otherGrams = mass(deposited.other);
  return {
    estimatedMinutes: parseDurationMinutes(text),
    modelGrams,
    supportGrams,
    otherGrams,
    totalGrams: modelGrams + supportGrams + otherGrams
  };
}

export function buildOrcaArgs(job, inputPaths, outputDir, config) {
  const args = ["--arrange", job.autoArrange === false ? "0" : "1", "--orient", job.autoOrient === false ? "0" : "1", "--ensure-on-bed", "--slice", "0", "--outputdir", outputDir];
  const settingsPath = job.settingsPath || config.settingsPath;
  const filamentPath = job.filamentPath || config.filamentPath;
  if (settingsPath) args.push("--load-settings", settingsPath);
  if (filamentPath) args.push("--load-filaments", filamentPath);
  args.push(...(Array.isArray(inputPaths) ? inputPaths : [inputPaths]));
  return args;
}

async function locateGcodePaths(outputDir) {
  const files = await readdir(outputDir, { recursive: true });
  const candidates = files.filter((file) => /\.(gcode|gco|g)$/i.test(file)).sort();
  if (!candidates.length) throw new Error("OrcaSlicer did not produce a G-code file");
  return candidates.map((file) => path.join(outputDir, file));
}

export async function runOrcaSlice(job, sourceInputs, config) {
  const root = await mkdtemp(path.join(os.tmpdir(), "farmflow-orca-"));
  try {
    const inputDir = path.join(root, "input");
    const outputDir = path.join(root, "output");
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const sources = Array.isArray(sourceInputs) ? sourceInputs : [{ file: job.sourceFile, bytes: sourceInputs }];
    if (!sources.length) throw new Error("OrcaSlicer job has no source files");
    const quantity = Number(job.quantity || 1);
    const inputPaths = [];
    for (let index = 0; index < sources.length; index += 1) {
      const count = Number(job.quantities?.[index] ?? quantity);
      for (let copy = 1; copy <= count; copy += 1) {
        const source = sources[index];
        const original = path.basename(source.file?.name || `input-${index + 1}.stl`);
        const extension = path.extname(original) || ".stl";
        const stem = path.basename(original, extension).replace(/[^a-z0-9_-]/gi, "_");
        const inputPath = path.join(inputDir, `${String(index + 1).padStart(2, "0")}-${stem}-copy-${String(copy).padStart(3, "0")}${extension.toLowerCase()}`);
        await writeFile(inputPath, source.bytes);
        inputPaths.push(inputPath);
      }
    }

    let effectiveJob = job;
    if (job.purpose === "free-print") {
      if (job.material !== "PETG") throw new Error("免費列印固定使用 3DSTU_PETG，請重新建立切片工作");
      const platePath = path.join(inputDir, "station-plate.3mf");
      await writeFile(platePath, await createStationPlate(sources.map(source => source.bytes), job.placements, job.autoArrange !== false));
      inputPaths.splice(0, inputPaths.length, platePath);
    }
    let profileName = String(job.profileName || job.profileId || "");
    if (job.scope === "public-slicing-quote") {
      const profiles = resolveReferenceProfiles(job.material, config.resourcesRoot);
      const privateProcessPath = path.join(root, "private-process.json");
      const privateMachinePath = path.join(root, "private-machine.json");
      const privateFilamentPath = path.join(root, "private-filament.json");
      const bundledProcess = await resolvePresetInheritance(profiles.processPath);
      const processProfile = { ...bundledProcess, ...buildJobProcessConfig(job), from: "system" };
      delete processProfile.inherits;
      await writeFile(privateProcessPath, JSON.stringify(processProfile, null, 2));
      await writeFile(privateMachinePath, JSON.stringify(await resolvePresetInheritance(profiles.machinePath), null, 2));
      await writeFile(privateFilamentPath, JSON.stringify(await resolvePresetInheritance(profiles.filamentPath), null, 2));
      effectiveJob = {
        ...job,
        settingsPath: `${privateMachinePath};${privateProcessPath}`,
        filamentPath: privateFilamentPath
      };
      profileName = profiles.profileName;
    }

    const args = buildOrcaArgs(effectiveJob, inputPaths, outputDir, config);
    const execution = await execFileAsync(config.command, args, { timeout: config.timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    const gcodePaths = await locateGcodePaths(outputDir);
    const plates = await Promise.all(gcodePaths.map(async (gcodePath) => {
      const buffer = await readFile(gcodePath);
      return { gcodePath, buffer, metrics: parseGcodeMetrics(buffer.toString("utf8")) };
    }));
    const metrics = plates.reduce((sum, plate) => ({
      estimatedMinutes: sum.estimatedMinutes + plate.metrics.estimatedMinutes,
      modelGrams: sum.modelGrams + plate.metrics.modelGrams,
      supportGrams: sum.supportGrams + plate.metrics.supportGrams,
      otherGrams: sum.otherGrams + plate.metrics.otherGrams,
      totalGrams: sum.totalGrams + plate.metrics.totalGrams
    }), { estimatedMinutes: 0, modelGrams: 0, supportGrams: 0, otherGrams: 0, totalGrams: 0 });
    if (!(metrics.estimatedMinutes > 0) || !(metrics.totalGrams > 0)) throw new Error("OrcaSlicer G-code did not contain positive measured time and extrusion");
    const gcode = plates.length === 1
      ? plates[0].buffer
      : Buffer.concat(plates.flatMap((plate, index) => [Buffer.from(`; FARMFLOW QUOTE PLATE ${index + 1}: ${path.basename(plate.gcodePath)}\n`), plate.buffer, Buffer.from("\n")]));
    const warnings = String(execution.stderr || "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean).slice(-30);
    if (plates.length > 1) warnings.push(`Quote totals include ${plates.length} separately sliced build plates; the stored concatenated artifact is measurement evidence, not production-ready G-code.`);
    return {
      filename: plates.length === 1 ? path.basename(plates[0].gcodePath) : "all-quote-plates.gcode",
      buffer: gcode,
      ...metrics,
      profileName,
      warnings,
      stdout: String(execution.stdout || "").slice(-4000)
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function uploadResult(config, job, result) {
  const form = new FormData();
  form.append("estimatedMinutes", String(result.estimatedMinutes));
  form.append("estimatedGrams", String(result.totalGrams));
  form.append("modelGrams", String(result.modelGrams));
  form.append("supportGrams", String(result.supportGrams));
  form.append("otherGrams", String(result.otherGrams));
  form.append("totalGrams", String(result.totalGrams));
  form.append("profileName", result.profileName);
  form.append("warnings", result.warnings.join("\n"));
  form.append("workerVersion", config.version);
  form.append("file", new Blob([result.buffer], { type: "text/x-gcode" }), result.filename);
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
    const sourceFiles = job.sourceFiles?.length ? job.sourceFiles : [job.sourceFile];
    const sourceInputs = await Promise.all(sourceFiles.map(async (file) => ({
      file,
      bytes: Buffer.from(await api(config, `/api/internal/orca/files/${encodeURIComponent(file.id)}`).then((response) => response.arrayBuffer()))
    })));
    const result = await runOrcaSlice(job, sourceInputs, config);
    await uploadResult(config, job, result);
    return { claimed: true, completed: true, jobId: job.id, estimatedMinutes: result.estimatedMinutes, totalGrams: result.totalGrams };
  } catch (error) {
    await api(config, `/api/internal/orca/jobs/${encodeURIComponent(job.id)}/fail`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: error instanceof Error ? error.message : "OrcaSlicer worker failed" })
    }).catch(() => undefined);
    return { claimed: true, completed: false, jobId: job.id, error: error instanceof Error ? error.message : "OrcaSlicer worker failed" };
  }
}

export async function startOrcaWorker(config = parseOrcaWorkerConfig(), dependencies = {}) {
  const runCycle = dependencies.runCycle || runOrcaWorkerCycle;
  let stopped = false;
  let timer = null;
  let activeCycle = null;
  const cycle = async () => {
    if (stopped || activeCycle) return;
    activeCycle = runCycle(config);
    try {
      const result = await activeCycle;
      if (result.claimed) console.log(`[orca-worker] ${result.completed ? "completed" : "failed"} ${result.jobId}`);
    } finally {
      activeCycle = null;
      if (!stopped && !config.runOnce) timer = setTimeout(() => cycle().catch((error) => console.error("[orca-worker] cycle failed", error)), config.intervalMs);
    }
  };
  await cycle().catch((error) => {
    if (config.runOnce) throw error;
    console.error("[orca-worker] startup retry", error.message);
  });
  return {
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      await activeCycle?.catch(() => undefined);
    }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const worker = await startOrcaWorker();
  const shutdown = async () => { await worker.stop(); process.exit(0); };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
