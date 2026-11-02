import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { testStl } from './test-helpers/stl.mjs';
import { buildModelSkillPackage } from "./model-skill-package.mjs";
import { difficultyDuration } from "./schedule-difficulty.mjs";
import { optimizeScheduleQueue } from "./server.mjs";
const makeJob = (id, patch = {}) => ({ id, file: id, status: "queued", stage: "needs scheduling", priority: "Normal", due: "Tomorrow 17:00", time: "1h 00m", material: "PETG", color: "Blue", dimensions: [20, 20, 10], ...patch });
const printer = (id, color) => ({ id, name: id, status: "idle", filament: `PETG ${color}`, buildVolume: [260, 260, 260], compatibleMaterials: ['PETG'], utilization: 0 });
const data = (jobs, printers = [printer("a", "Blue")]) => ({ queue: jobs, printers, spools: [{ id: "petg", material: "PETG", remaining: 10000 }], files: [] });
describe("poster: four-dimensional scheduling control cases", () => {
  it("uses deadlines rather than FIFO", () => {
    const result = optimizeScheduleQueue(data([makeJob("later"), makeJob("urgent", { due: "Today 17:00" })]), { strategy: "multi-factor" });
    expect(result.scheduled[0].jobId).toBe("urgent");
  });
  it("uses print duration for ordering and lane occupancy", () => {
    const result = optimizeScheduleQueue(data([makeJob("short"), makeJob("long", { time: "2h 00m" })]), { strategy: "multi-factor" });
    expect(result.scheduled.map((r) => r.jobId)).toEqual(["long", "short"]);
    expect(result.scheduled[1].scheduledStart).toBe("10:00");
  });
  it("uses difficulty as a real planning factor and transparently reserves risk buffer", () => {
    const result = optimizeScheduleQueue(data([makeJob("normal"), makeJob("difficult", { difficulty: 5 })]), { strategy: "multi-factor" });
    expect(result.scheduled[0].jobId).toBe("difficult");
    expect(result.scheduled[0].difficulty.bufferMinutes).toBe(12);
    expect(result.scheduled[1].scheduledStart).toBe("09:12");
    expect(difficultyDuration(makeJob("derived", { dimensions: [10, 10, 100], settings: { support: true } }), 60).level).toBe(3);
  });
  it("uses current material/color when choosing a printer", () => {
    const result = optimizeScheduleQueue(data([makeJob("blue")], [printer("black", "Black"), printer("blue", "Blue")]), { strategy: "multi-factor" });
    expect(result.scheduled[0].printerId).toBe("blue");
  });
  it("writes the same existing job used by orders instead of an independent demo queue", () => {
    const db = data([makeJob("linked", { sourceOrderId: "fixture-order", sourceQuoteRequestId: "fixture-quote" })]);
    optimizeScheduleQueue(db, { strategy: "multi-factor" });
    expect(db.queue[0]).toMatchObject({ sourceOrderId: "fixture-order", sourceQuoteRequestId: "fixture-quote", stage: "scheduled", optimizationStrategy: "multi-factor" });
  });
  it("does not schedule onto an unavailable or incompatible printer just because every candidate is blocked", () => {
    const unavailable = printer('offline', 'Blue'); unavailable.status = 'maintenance';
    const db = data([makeJob('blocked')], [unavailable]);
    const result = optimizeScheduleQueue(db, { strategy: 'multi-factor' });
    expect(result.scheduled).toEqual([]); expect(result.skipped).toHaveLength(1);
    expect(db.queue[0].stage).toBe('needs scheduling');
  });
});
describe("poster: downloadable FDM modeling skill", () => {
  it("runs the packaged validator on a real bounded STL and rejects an invalid file", async () => {
    const dir = await mkdtemp(join(tmpdir(), '3drfm-skill-validator-'));
    try {
      const zip = await JSZip.loadAsync(await buildModelSkillPackage());
      const script = join(dir, 'validate-stl.mjs'), model = join(dir, 'fixture.stl');
      await writeFile(script, await zip.file('3drfm-model-design/validate-stl.mjs').async('string'));
      await writeFile(model, testStl());
      const result = JSON.parse(execFileSync(process.execPath, [script, model], { encoding: 'utf8' }));
      expect(result.dimensionsAssumingMm).toEqual([10, 20, 30]);
      expect(result.triangles).toBe(4);
      await writeFile(model, Buffer.from('not an STL'));
      expect(() => execFileSync(process.execPath, [script, model], { stdio: 'pipe' })).toThrow();
    } finally { await rm(dir, { recursive: true }); }
  });
  it("packages actual instructions, validation script, supported install paths and hash manifest", async () => {
    const zip = await JSZip.loadAsync(await buildModelSkillPackage());
    expect(await zip.file("3drfm-model-design/SKILL.md").async("string")).toContain("真正切片估時");
    expect(await zip.file("3drfm-model-design/validate-stl.mjs").async("string")).toContain("Non-finite vertex");
    const readme = await zip.file("README.md").async("string");
    expect(readme).toContain(".agents/skills"); expect(readme).toContain(".claude/skills");
    expect(JSON.parse(await zip.file("manifest.json").async("string")).files["3drfm-model-design/SKILL.md"]).toMatch(/^[a-f0-9]{64}$/);
  });
});
