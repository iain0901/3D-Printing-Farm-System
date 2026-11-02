// Synthetic, deliberately minimal profiles for isolated protocol tests only. Never publish to a printer.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sha256, loadProfileBundle } from '../profile-bundle.mjs';
import { printingPolicy } from '../../frontend-vue/src/utils/printing-policy.mjs';
export async function fixtureProfileBundle(root) {
  await mkdir(root, { recursive: true });
  const profiles = {
    machine: { type: 'machine', name: 'Creality Hi 0.4 nozzle', printer_model: 'Creality Hi', nozzle_diameter: ['0.4'], printable_area: ['0x0', '260x0', '260x260', '0x260'], printable_height: '300', test_fixture_only: true },
    process: { type: 'process', name: 'Synthetic 0.20 process', layer_height: '0.2', test_fixture_only: true },
    filament: { type: 'filament', name: '3DSTU_PETG synthetic fixture', filament_type: ['PETG'], filament_diameter: ['1.75'], filament_density: ['1.27'], test_fixture_only: true },
  };
  const files = {};
  for (const [kind, profile] of Object.entries(profiles)) {
    const bytes = JSON.stringify(profile);
    await writeFile(path.join(root, `${kind}.json`), bytes);
    files[kind] = { path: `${kind}.json`, sha256: sha256(bytes) };
  }
  const manifest = { schemaVersion: 1, policyId: printingPolicy.id, version: 'synthetic-fixture-v1', engine: 'OrcaSlicer', engineVersion: '2.4.2',
    machine: printingPolicy.machine, nozzleDiameter: 0.4, material: 'PETG', materialLabel: '3DSTU_PETG', baseLayerHeight: 0.2, buildVolume: [260, 260, 300], files };
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const bundle = await loadProfileBundle({ manifestPath, engineVersion: '2.4.2' });
  return { manifestPath, manifest, ...bundle };
}
