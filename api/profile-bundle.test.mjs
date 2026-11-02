import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, it, expect } from 'vitest';
import { fixtureProfileBundle } from './test-helpers/profile-bundle.mjs';
import { loadProfileBundle, requireMatchingBundle, computePublishedQuote, sha256 } from './profile-bundle.mjs';
import { runOrcaSlice } from './orca-worker.mjs';
import { testStl } from './test-helpers/stl.mjs';
const dirs = [];
afterEach(async () => { while (dirs.length) await rm(dirs.pop(), { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'hi-bundle-fixture-')); dirs.push(root);
  return { root, ...await fixtureProfileBundle(path.join(root, 'profiles')) };
}
it('loads three hash-pinned flattened presets, validates physical metadata and never exposes paths', async () => {
  const f = await fixture();
  expect(f.summary).toMatchObject({ machine: 'Creality Hi', nozzleDiameter: 0.4, materialLabel: '3DSTU_PETG', version: 'synthetic-fixture-v1' });
  expect(JSON.stringify(f.summary)).not.toContain(f.root);
  await expect(loadProfileBundle({ manifestPath: f.manifestPath, engineVersion: '2.4.1' })).rejects.toThrow(/驗證失敗/);
  await expect(loadProfileBundle({ manifestPath: '' })).rejects.toThrow(/未就緒/);
});
it('rejects a corrupted hash, unresolved inheritance and false machine metadata even with an updated hash', async () => {
  const f = await fixture(), file = path.join(path.dirname(f.manifestPath), 'machine.json');
  await writeFile(file, JSON.stringify({ ...f.profiles.machine, printer_model: 'Bambu X1 Carbon' }));
  await expect(loadProfileBundle({ manifestPath: f.manifestPath })).rejects.toThrow(/驗證失敗/);
  f.manifest.files.machine.sha256 = sha256(await readFile(file));
  await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await expect(loadProfileBundle({ manifestPath: f.manifestPath })).rejects.toThrow(/驗證失敗/);
  await writeFile(file, JSON.stringify({ ...f.profiles.machine, inherits: 'missing-base' }));
  f.manifest.files.machine.sha256 = sha256(await readFile(file)); await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await expect(loadProfileBundle({ manifestPath: f.manifestPath })).rejects.toThrow(/驗證失敗/);
});
it('rejects path traversal and symlinks escaping the immutable version directory', async () => {
  const f = await fixture();
  f.manifest.files.machine.path = '../outside.json';
  await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await expect(loadProfileBundle({ manifestPath: f.manifestPath })).rejects.toThrow(/驗證失敗/);
  const outside = path.join(f.root, 'outside.json'); await writeFile(outside, JSON.stringify(f.profiles.machine));
  await symlink(outside, path.join(path.dirname(f.manifestPath), 'escape.json'));
  f.manifest.files.machine.path = 'escape.json';
  await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await expect(loadProfileBundle({ manifestPath: f.manifestPath })).rejects.toThrow(/驗證失敗/);
});
it('does not silently migrate a queued job when the published version changes', async () => {
  const f = await fixture();
  expect(() => requireMatchingBundle(f.summary, { ...f.summary, version: 'new-version' })).toThrow(/重新切片/);
  expect(() => requireMatchingBundle(undefined, f.summary)).toThrow();
});
it('rejects a missing printable height even when the altered profile hash is correct', async () => {
  const f = await fixture();
  const machine = { ...f.profiles.machine }; delete machine.printable_height;
  const file = path.join(path.dirname(f.manifestPath), 'machine.json');
  await writeFile(file, JSON.stringify(machine));
  f.manifest.files.machine.sha256 = sha256(await readFile(file));
  await writeFile(f.manifestPath, JSON.stringify(f.manifest));
  await expect(loadProfileBundle({ manifestPath: f.manifestPath })).rejects.toThrow(/驗證失敗/);
});
it('computes NT$2 from measured order-total grams once, with no minimum, hourly floor or old surcharge', () => {
  expect(computePublishedQuote(48.5, 2, 142).total).toBe(97);
  expect(computePublishedQuote(0.125, 20, 480).total).toBe(0.25);
  expect(computePublishedQuote(10.825, 3).total).toBe(21.65);
  for (const n of [0, -1, NaN, Infinity]) expect(() => computePublishedQuote(n)).toThrow();
});
it('uses only the published bundle, applies overrides privately, records effective hashes and verifies output identity', async () => {
  const f = await fixture(), manifestBefore = await readFile(f.manifestPath, 'utf8');
  const job = { id: 'synthetic-slice', scope: 'public-slicing-quote', purpose: 'quote', material: 'PETG', profileBundle: f.summary,
    settingsPath: '/old/X1C.json', filamentPath: '/old/PLA.json', layerHeight: 0.16, infill: 25, walls: 3, autoSupports: true, quantity: 1 };
  let called = 0;
  const execFile = async (_, args) => {
    called++;
    const [machine, process] = args[args.indexOf('--load-settings') + 1].split(';');
    expect(JSON.parse(await readFile(machine, 'utf8')).printer_model).toBe('Creality Hi');
    expect(JSON.parse(await readFile(process, 'utf8'))).toMatchObject({ layer_height: '0.16', wall_loops: '3', sparse_infill_density: '25%' });
    const out = args[args.indexOf('--outputdir') + 1];
    await writeFile(path.join(out, 'fixture.gcode'), '; generated by OrcaSlicer 2.4.2\n; printer_model = Creality Hi\n; nozzle_diameter = 0.4\n; filament_type = PETG\n; filament_diameter = 1.75\n; filament_density = 1.27\n; total estimated time: 1m\nM83\nG1 X1 E1\n');
    return { stdout: '', stderr: '' };
  };
  const result = await runOrcaSlice(job, [{ file: { name: 'fixture.stl' }, bytes: testStl() }], { profileManifestPath: f.manifestPath, version: '2.4.2', command: 'synthetic-no-binary', timeoutMs: 1000 }, { execFile });
  expect(called).toBe(1); expect(result.totalGrams).toBeGreaterThan(0);
  expect(result.profileBundle).toEqual(f.summary); expect(result.effectiveProfileHashes.process).toMatch(/^[a-f0-9]{64}$/);
  expect(result.effectiveProfileHashes.process).not.toBe(f.summary.hashes.process);
  expect(await readFile(f.manifestPath, 'utf8')).toBe(manifestBefore);
  expect(JSON.parse(await readFile(path.join(path.dirname(f.manifestPath), 'process.json'), 'utf8')).layer_height).toBe('0.2');
});
