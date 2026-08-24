import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { access, constants } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ============================================================================
// 3DSTU FarmFlow 切片管線 (Slicer Pipeline)
//
// 在 Ubuntu 伺服器上以真實 CLI 切片器完成：
//   模型檢查 → 自動旋轉擺盤 (--auto-orient / --arrange) → 支撐設定 (--load ini)
//   → G-code 輸出 → 解析實際耗材克重與列印時間（餵入自動報價引擎）
//
// 支援的 CLI 家族：
//   - Prusa 系（prusa-slicer / superslicer）：完全可腳本化，支援 --auto-orient、
//     --arrange 與 --load <config.ini>（含支撐/層高/填充/牆數），Ubuntu 可用
//     `sudo apt install prusa-slicer` 安裝（23.04+/24.04 universe）。
//   - Orca 系（orca-slicer）：由 api/orca-worker.mjs 處理；此模組僅偵測並回報。
// 找不到任何切片器時回傳 available:false，呼叫端走 internal fallback。
// ============================================================================

const PRUSA_FAMILY_CANDIDATES = ["prusa-slicer", "prusa_slicer", "superslicer", "superslicer-console"];
const ORCA_FAMILY_CANDIDATES = ["orca-slicer", "bambu-studio", "bambu-studio-cli"];

async function commandExists(command, pathEnv = process.env.PATH || "") {
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".cmd", ".exe", ".bat", ""] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        await access(candidate, constants.X_OK);
        return candidate;
      } catch {
        // continue probing
      }
    }
  }
  return null;
}

/**
 * 偵測可用的切片器 CLI。
 * 優先順序：明確 env 設定 > Prusa 系 > Orca 系。
 * @returns {Promise<{available:boolean, family?:'prusa'|'orca', command?:string, source?:string}>}
 */
export async function detectSlicerCommand(env = process.env, probe = commandExists) {
  const explicit = String(env.LAYERPILOT_SLICER_CMD || "").trim();
  if (explicit) return { available: true, family: "prusa", command: explicit, source: "env:LAYERPILOT_SLICER_CMD" };
  for (const candidate of PRUSA_FAMILY_CANDIDATES) {
    const found = await probe(candidate);
    if (found) return { available: true, family: "prusa", command: candidate, source: `path:${candidate}` };
  }
  for (const candidate of ORCA_FAMILY_CANDIDATES) {
    const found = await probe(candidate);
    if (found) return { available: true, family: "orca", command: candidate, source: `path:${candidate}` };
  }
  return { available: false };
}

// ---------------------------------------------------------------------------
// 模型檢查：送切前的基本可製造性檢查
// ---------------------------------------------------------------------------
export function buildModelChecks(metadata = {}, { buildVolume = null } = {}) {
  const checks = [];
  const dims = Array.isArray(metadata.dimensions) ? metadata.dimensions.map((value) => Number(value) || 0) : [];
  const hasDims = dims.length === 3 && dims.every((value) => value > 0);
  const degenerate = hasDims && dims.some((value) => !Number.isFinite(value));
  checks.push({
    key: "dimensions",
    label: "模型尺寸",
    status: hasDims && !degenerate ? "ok" : "fail",
    detail: hasDims ? `${dims.map((value) => Math.round(value)).join(" x ")} mm` : "無法取得有效尺寸"
  });
  if (hasDims && Array.isArray(buildVolume) && buildVolume.length === 3) {
    const fits = dims.every((value, index) => value <= Number(buildVolume[index]));
    checks.push({
      key: "build_volume",
      label: "列印空間",
      status: fits ? "ok" : "fail",
      detail: fits ? `符合機台 ${buildVolume.join(" x ")} mm` : `超出機台 ${buildVolume.join(" x ")} mm`
    });
  }
  const triangles = Number(metadata.triangleCount || metadata.triangles || 0);
  checks.push({
    key: "triangles",
    label: "三角面數",
    status: triangles === 0 ? "warn" : triangles > 0 && triangles < 4 ? "fail" : "ok",
    detail: triangles > 0 ? `${triangles.toLocaleString()} faces` : "未提供面數資訊"
  });
  const type = String(metadata.type || "").toUpperCase();
  checks.push({
    key: "sliceable_type",
    label: "檔案格式",
    status: ["STL", "3MF", "OBJ"].includes(type) || !type ? "ok" : "warn",
    detail: type || "未知格式（將嘗試切片）"
  });
  const grams = Number(metadata.estimateGrams || 0);
  checks.push({
    key: "material_estimate",
    label: "材料估計",
    status: grams > 0 ? "ok" : "warn",
    detail: grams > 0 ? `約 ${grams} g` : "解析不到重量估計，切片後以實際值為準"
  });
  return checks;
}

export function summarizeModelChecks(checks = []) {
  const failed = checks.filter((check) => check.status === "fail");
  const warned = checks.filter((check) => check.status === "warn");
  return {
    ok: failed.length === 0,
    needsAttention: warned.length > 0,
    failed,
    warned
  };
}

// ---------------------------------------------------------------------------
// Prusa 系設定檔產生：把工作單設定映射成 config.ini（支撐/層高/填充/牆數/溫度）
// ---------------------------------------------------------------------------
export function generatePrusaConfigIni(settings = {}) {
  const materialTemps = {
    PLA: { first: 215, other: 210, bed: 60 },
    PETG: { first: 245, other: 240, bed: 80 },
    ABS: { first: 260, other: 255, bed: 100 },
    ASA: { first: 265, other: 260, bed: 100 },
    TPU: { first: 230, other: 225, bed: 50 }
  };
  const temps = materialTemps[String(settings.material || "PLA").toUpperCase()] || materialTemps.PLA;
  const layerHeight = Number(settings.layerHeight) > 0 ? Number(settings.layerHeight) : 0.2;
  const infill = Math.min(100, Math.max(0, Number(settings.infill ?? 15)));
  const walls = Math.min(10, Math.max(1, Number.parseInt(settings.walls ?? 2, 10) || 2));
  const supports = settings.supports !== false && settings.support !== "None";
  const brim = Boolean(settings.brim);
  const firstLayerHeight = Math.min(layerHeight, 0.25);
  const lines = [
    "; generated by 3DSTU FarmFlow slicer pipeline",
    `; layer_height = ${layerHeight}`,
    "layer_height = " + layerHeight,
    `first_layer_height = ${firstLayerHeight}`,
    `fill_density = ${infill}%`,
    `perimeters = ${walls}`,
    `support_material = ${supports ? 1 : 0}`,
    `support_material_auto = ${supports ? 1 : 0}`,
    "support_material_pattern = rectilinear",
    "support_material_spacing = 2.5",
    `brim_width = ${brim ? 5 : 0}`,
    `temperature = ${temps.other}`,
    `first_layer_temperature = ${temps.first}`,
    `bed_temperature = ${temps.bed}`,
    `first_layer_bed_temperature = ${temps.bed}`
  ];
  return lines.join("\n") + "\n";
}

/**
 * 組 Prusa 系 CLI 參數：自動旋轉 + 擺盤 + 載入設定 + 輸出 G-code。
 */
export function buildPrusaSliceArgs({ inputPath, outputPath, configPath, autoOrient = true, arrange = true, supports = true }) {
  const args = [
    "--export-gcode",
    "--output",
    outputPath,
    "--load",
    configPath
  ];
  if (autoOrient) args.push("--auto-orient");
  if (arrange) args.push("--arrange");
  // 支撐已寫入 config.ini（--load），這裡不再重複旗標
  void supports;
  args.push(inputPath);
  return args;
}

// ---------------------------------------------------------------------------
// G-code 成果解析：實際耗材克重與預估時間
// ---------------------------------------------------------------------------
export function parseGcodeStats(text) {
  const gramsMatch =
    text.match(/total filament used \[g\]\s*=\s*([\d.]+)/i) ||
    text.match(/filament used \[g\]\s*=\s*([\d.]+)/i) ||
    text.match(/;\s*filament used\s*=\s*[\d.]+\s*g/i);
  let grams = 0;
  const numericGrams = text.match(/(?:total )?filament used \[g\]\s*=\s*([\d.]+)/i);
  if (numericGrams) grams = Number(numericGrams[1]);
  else if (gramsMatch) grams = Number(gramsMatch[0].match(/([\d.]+)/)?.[1] || 0);

  const timeMatch = text.match(/estimated printing time[^=]*=\s*([^\r\n]+)/i);
  let minutes = 0;
  if (timeMatch) {
    const value = timeMatch[1];
    const days = Number(value.match(/(\d+)d/i)?.[1] || 0);
    const hours = Number(value.match(/(\d+)h/i)?.[1] || 0);
    minutes += days * 24 * 60;
    minutes += hours * 60;
    minutes += Number(value.match(/(\d+)m/i)?.[1] || 0);
    minutes += Number(value.match(/(\d+)s/i)?.[1] || 0) / 60;
  }
  const m73 = [...text.matchAll(/M73\s+P\d+\s+R(\d+)/gi)];
  if (!timeMatch && m73.length) {
    const remainingSeconds = Number(m73[m73.length - 1][1]);
    if (Number.isFinite(remainingSeconds)) minutes = remainingSeconds / 60;
  }
  return {
    grams: Math.round(grams * 100) / 100,
    minutes: Math.round(minutes)
  };
}

// ---------------------------------------------------------------------------
// 端到端管線：暫存目錄內完成 寫入輸入 → 產生 ini → 執行 CLI → 解析成果
// execImpl 可注入以便測試（生產用 child_process.execFile）。
// ---------------------------------------------------------------------------
export async function runPrusaSlicePipeline({
  command,
  inputBuffer,
  filename = "model.stl",
  settings = {},
  timeoutMs = 15 * 60 * 1000,
  autoOrient = true,
  arrange = true,
  execImpl = execFileAsync
}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "farmflow-slice-"));
  try {
    const inputDir = path.join(root, "input");
    const outputDir = path.join(root, "output");
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    const safeName = path.basename(filename || "model.stl");
    const inputPath = path.join(inputDir, safeName);
    await writeFile(inputPath, inputBuffer);
    const configPath = path.join(root, "farmflow-print-settings.ini");
    await writeFile(configPath, generatePrusaConfigIni(settings), "utf8");
    const outputPath = path.join(outputDir, `${path.basename(safeName, path.extname(safeName))}.gcode`);
    const args = buildPrusaSliceArgs({ inputPath, outputPath, configPath, autoOrient, arrange });
    let stdout = "";
    let stderr = "";
    try {
      const result = await execImpl(command, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
      stdout = String(result.stdout || "");
      stderr = String(result.stderr || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Slicer CLI failed: ${message.slice(0, 500)}`);
    }
    let gcode;
    try {
      gcode = await readFile(outputPath);
    } catch {
      // 有些版本會自行命名輸出；退而掃描輸出目錄
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(outputDir);
      const found = files.find((file) => /\.(gcode|gco|g)$/i.test(file));
      if (!found) throw new Error(`Slicer produced no G-code${stderr ? `: ${stderr.split(/\r?\n/).slice(-3).join(" | ")}` : ""}`);
      gcode = await readFile(path.join(outputDir, found));
    }
    const text = gcode.toString("utf8");
    const stats = parseGcodeStats(text);
    return {
      filename: path.basename(outputPath),
      buffer: gcode,
      estimatedGrams: stats.grams,
      estimatedMinutes: stats.minutes,
      autoOriented: autoOrient,
      arranged: arrange,
      supportsEnabled: settings.supports !== false && settings.support !== "None",
      warnings: stderr
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(-30),
      stdout: stdout.slice(-4000)
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
