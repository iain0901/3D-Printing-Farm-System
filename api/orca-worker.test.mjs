import { describe, expect, it } from "vitest";
import { buildOrcaArgs, parseOrcaWorkerConfig } from "./orca-worker.mjs";

describe("OrcaSlicer worker", () => {
  it("pins an explicit CLI job to a profile, filament and isolated output directory", () => {
    const args = buildOrcaArgs({
      settingsPath: "/profiles/printer.json;/profiles/process.json",
      filamentPath: "/profiles/PETG.json"
    }, "/tmp/input/model.stl", "/tmp/output", { settingsPath: "", filamentPath: "" });
    expect(args).toEqual([
      "--arrange", "1", "--orient", "1", "--ensure-on-bed", "--slice", "0", "--outputdir", "/tmp/output",
      "--load-settings", "/profiles/printer.json;/profiles/process.json",
      "--load-filaments", "/profiles/PETG.json", "/tmp/input/model.stl"
    ]);
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
