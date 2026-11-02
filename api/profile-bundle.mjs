import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { printingPolicy } from '../frontend-vue/src/utils/printing-policy.mjs';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fileSchema = z.object({ path: z.string().min(1).max(200), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const bundleManifestSchema = z.object({
  schemaVersion: z.literal(1),
  policyId: z.literal(printingPolicy.id),
  version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/),
  engine: z.literal('OrcaSlicer'),
  engineVersion: z.string().min(1).max(40),
  machine: z.literal(printingPolicy.machine),
  nozzleDiameter: z.literal(printingPolicy.nozzleDiameter),
  material: z.literal(printingPolicy.material),
  materialLabel: z.literal(printingPolicy.materialLabel),
  baseLayerHeight: z.literal(printingPolicy.baseLayerHeight),
  buildVolume: z.array(z.number().finite().positive()).length(3),
  files: z.object({ machine: fileSchema, process: fileSchema, filament: fileSchema }).strict(),
}).strict();
const scalar = (value) => Array.isArray(value) ? value[0] : value;
const failure = () => Object.assign(new Error('Creality Hi／3DSTU_PETG 設定包未就緒或驗證失敗；不會改用其他機型或估算。'), { statusCode: 503 });
async function boundedRead(filename) {
  if ((await stat(filename)).size > 5 * 1024 * 1024) throw failure();
  return readFile(filename);
}
export async function loadProfileBundle({ manifestPath = process.env.ORCA_PROFILE_BUNDLE_MANIFEST || '', engineVersion = process.env.ORCA_SLICER_VERSION || '2.4.2' } = {}) {
  let stage = 'manifest';
  try {
    if (!manifestPath) throw failure();
    const manifestFile = await realpath(manifestPath), root = path.dirname(manifestFile);
    const bytes = await boundedRead(manifestFile);
    const manifest = bundleManifestSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (manifest.engineVersion !== engineVersion) throw failure();
    const profiles = {}, hashes = {};
    for (const kind of ['machine', 'process', 'filament']) {
      stage = `${kind}.path`;
      const file = manifest.files[kind];
      if (path.isAbsolute(file.path) || file.path.includes(';') || file.path.split(/[\\/]/).includes('..')) throw failure();
      const full = await realpath(path.join(root, file.path));
      if (!full.startsWith(root + path.sep)) throw failure();
      const raw = await boundedRead(full);
      stage = `${kind}.sha256`;
      if (sha256(raw) !== file.sha256) throw failure();
      stage = `${kind}.profile`;
      const profile = JSON.parse(raw.toString('utf8'));
      if (!profile || typeof profile !== 'object' || Array.isArray(profile) || profile.inherits || profile.type !== kind || !profile.name) throw failure();
      profiles[kind] = profile; hashes[kind] = file.sha256;
    }
    const machine = profiles.machine, filament = profiles.filament;
    stage = 'machine-material-identity';
    if (!/^Creality Hi(?:\b|\s)/i.test(String(machine.printer_model || machine.name)) ||
      Number(scalar(machine.nozzle_diameter)) !== printingPolicy.nozzleDiameter ||
      !Array.isArray(machine.nozzle_diameter) || machine.nozzle_diameter.some((n) => Number(n) !== 0.4) ||
      String(scalar(filament.filament_type)).toUpperCase() !== 'PETG' ||
      Number(scalar(profiles.process.layer_height)) !== 0.2) throw failure();
    for (const profile of [profiles.process, filament]) {
      if (profile.compatible_printers?.length && !profile.compatible_printers.includes(machine.name)) throw failure();
    }
    const area = machine.printable_area?.map((p) => String(p).split('x').map(Number));
    stage = 'build-volume';
    if (!area?.length || area.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))) throw failure();
    const dimensions = [0, 1].map((axis) => Math.max(...area.map((p) => p[axis])) - Math.min(...area.map((p) => p[axis])));
    dimensions.push(Number(scalar(machine.printable_height)));
    if (dimensions.some((n, i) => !Number.isFinite(n) || n <= 0 || Math.abs(n - manifest.buildVolume[i]) > 0.01)) throw failure();
    return { profiles, summary: {
      policyId: manifest.policyId, version: manifest.version, manifestSha256: sha256(bytes), hashes,
      machine: manifest.machine, nozzleDiameter: manifest.nozzleDiameter, material: manifest.material,
      materialLabel: manifest.materialLabel, baseLayerHeight: manifest.baseLayerHeight,
      engine: manifest.engine, engineVersion: manifest.engineVersion, buildVolume: manifest.buildVolume,
    } };
  } catch (error) { throw Object.assign(failure(), { diagnostics: { stage, code: error.code || error.name || 'invalid_profile' } }); }
}
export function requireMatchingBundle(expected, actual) {
  if (!expected || expected.policyId !== printingPolicy.id || expected.version !== actual.version || expected.manifestSha256 !== actual.manifestSha256 ||
    ['machine', 'process', 'filament'].some((kind) => expected.hashes?.[kind] !== actual.hashes?.[kind]))
    throw Object.assign(new Error('工作指定的設定包版本已變更或不符，請重新切片；不會使用其他預設。'), { statusCode: 409 });
}
export function computePublishedQuote(totalGrams, quantity = 1, minutes = 0) {
  if (!Number.isFinite(totalGrams) || totalGrams <= 0 || !Number.isInteger(quantity) || quantity < 1) throw new Error('報價必須有有效的實際總耗材重量與數量。');
  const total = Math.round((totalGrams * printingPolicy.pricePerGram + Number.EPSILON) * 100) / 100;
  return { ok: true, currency: 'TWD', total, policyId: printingPolicy.id,
    input: { scope: 'order', quantity, totalGrams, grams: totalGrams, minutes, material: 'PETG' },
    pricing: { tierPricePerGram: 2, machineHourlyRate: 0, minimumCharge: 0, tax: 0 },
    escalated: false, escalationReasons: [],
    lines: [{ key: 'weight', label: `實際總耗材 ${totalGrams} g × NT$2／g`, amount: total }, { key: 'total', label: '列印報價', amount: total }],
  };
}
