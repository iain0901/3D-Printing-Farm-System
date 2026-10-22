import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildJobProcessConfig,
  buildOrcaArgs,
  parseGcodeMetrics,
  parseOrcaWorkerConfig,
  resolveReferenceProfiles,
  startOrcaWorker
} from "./orca-worker.mjs";

afterEach(() => vi.useRealTimers());

describe("OrcaSlicer worker", () => {
  it("preserves manual station orientation and disables arcs for the layer viewer", () => {
    const args = buildOrcaArgs({ autoOrient: false, autoArrange: false }, ["input.3mf"], "/tmp/output", {});
    expect(args[args.indexOf("--orient") + 1]).toBe("0");
    expect(args[args.indexOf("--arrange") + 1]).toBe("0");
    expect(buildJobProcessConfig({ purpose: "free-print" }).enable_arc_fitting).toBe("0");
  });
  it("pins auto orientation, arrangement, ensure-on-bed and explicit private process settings", () => {
    const args = buildOrcaArgs({
      settingsPath: "/profiles/printer.json;/tmp/job/private-process.json",
      filamentPath: "/profiles/PETG.json"
    }, ["/tmp/input/model-1.stl", "/tmp/input/model-2.stl"], "/tmp/output", { settingsPath: "", filamentPath: "" });
    expect(args).toEqual([
      "--arrange", "1", "--orient", "1", "--ensure-on-bed", "--slice", "0", "--outputdir", "/tmp/output",
      "--load-settings", "/profiles/printer.json;/tmp/job/private-process.json",
      "--load-filaments", "/profiles/PETG.json", "/tmp/input/model-1.stl", "/tmp/input/model-2.stl"
    ]);
  });

  it("maps every accepted material to a real bundled filament profile and rejects all others", () => {
    for (const material of ["PLA", "PETG", "ASA", "TPU"]) {
      const profiles = resolveReferenceProfiles(material, "/opt/orca/resources/profiles");
      expect(profiles.machinePath).toContain("Artillery M1 Pro 0.4 nozzle.json");
      expect(profiles.processPath).toContain("0.20mm Standard @Artillery M1 Pro 0.4 nozzle.json");
      expect(profiles.filamentPath).toMatch(new RegExp(material, "i"));
      expect(profiles.profileName).toContain("reference");
    }
    expect(() => resolveReferenceProfiles("ABS")).toThrow(/Unsupported material/);
  });

  it("builds job-private process JSON from layer height, infill, walls and automatic support", () => {
    expect(buildJobProcessConfig({ layerHeight: 0.16, infill: 28, walls: 4, autoSupports: true })).toMatchObject({
      type: "process",
      layer_height: "0.16",
      sparse_infill_density: "28%",
      wall_loops: "4",
      enable_support: "1",
      support_type: "tree(auto)"
    });
    expect(buildJobProcessConfig({ layerHeight: 0.2, infill: 0, walls: 2, autoSupports: false }).enable_support).toBe("0");
  });

  it("classifies actual extrusion while handling M82, M83, G92 and retract/restore without double counting", () => {
    const gcode = [
      "; filament_diameter = 1.75",
      "; filament_density = 1.24",
      "; total estimated time: 1h 2m 30s",
      "M82",
      "G92 E0",
      "; FEATURE: Outer wall",
      "G1 X1 E10",
      "G1 E8 ; retract",
      "G1 E10 ; restore only",
      "G1 X2 E12 ; 2 deposited",
      "; FEATURE: Support interface",
      "G1 X3 E15",
      "M83",
      "G1 E-2",
      "G1 E2 ; restore only",
      "G1 X4 E1 ; support deposit",
      "G92 E0",
      "; TYPE: Brim",
      "G1 X5 E2",
      "; FEATURE: Internal infill",
      "G1 X6 E1"
    ].join("\n");
    const metrics = parseGcodeMetrics(gcode);
    const massPerMm = Math.PI * (1.75 / 2) ** 2 / 1000 * 1.24;
    expect(metrics.estimatedMinutes).toBe(62.5);
    expect(metrics.modelGrams).toBeCloseTo(13 * massPerMm, 4);
    expect(metrics.supportGrams).toBeCloseTo(4 * massPerMm, 4);
    expect(metrics.otherGrams).toBeCloseTo(2 * massPerMm, 4);
    expect(metrics.totalGrams).toBeCloseTo(19 * massPerMm, 4);
  });

  it("never overlaps polling cycles even when a slice takes longer than the poll interval", async () => {
    vi.useFakeTimers();
    let calls = 0;
    let active = 0;
    let maximumActive = 0;
    let releaseSecond;
    const runCycle = async () => {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (calls === 2) await new Promise((resolve) => { releaseSecond = resolve; });
      active -= 1;
      return { claimed: false };
    };
    const worker = await startOrcaWorker({ intervalMs: 10, runOnce: false }, { runCycle });
    await vi.advanceTimersByTimeAsync(10);
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(2);
    expect(maximumActive).toBe(1);
    releaseSecond();
    await Promise.resolve();
    await worker.stop();
  });

  it("loads a pinned, independently configurable worker", () => {
    expect(parseOrcaWorkerConfig({
      LAYERPILOT_API_INTERNAL_URL: "http://api:8797/",
      LAYERPILOT_WORKER_TOKEN: "worker-token",
      ORCA_SLICER_VERSION: "2.4.2",
      ORCA_WORKER_INTERVAL_MS: "5000",
      ORCA_SLICER_TIMEOUT_MS: "600000"
    })).toMatchObject({ apiUrl: "http://api:8797", workerToken: "worker-token", version: "2.4.2", intervalMs: 5000, timeoutMs: 600000 });
  });
});
