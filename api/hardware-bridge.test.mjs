import { describe, expect, it } from "vitest";
import { diagnoseBridge, fetchMoonrakerStatus, fetchOctoPrintStatus, fetchPrusaLinkStatus, sendMoonrakerCommand, sendOctoPrintCommand, sendPrusaLinkCommand } from "./hardware-bridge.mjs";

function response(body = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}

describe("hardware bridge adapters", () => {
  it("normalizes OctoPrint printer and job status", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.endsWith("/api/printer")) return response({ state: { text: "Printing" }, temperature: { tool0: { actual: 211, target: 215 }, bed: { actual: 58, target: 60 } } });
      return response({ progress: { completion: 42.4 }, job: { file: { display: "part.gcode" } } });
    };
    const status = await fetchOctoPrintStatus({ baseUrl: "http://octopi.local/", apiKey: "key", fetchImpl });
    expect(status).toMatchObject({ status: "printing", progress: 42, nozzle: 211, bed: 58, targetNozzle: 215, targetBed: 60, job: "part.gcode" });
    expect(calls).toEqual(["http://octopi.local/api/printer", "http://octopi.local/api/job"]);
  });

  it("sends OctoPrint pause commands to the job endpoint", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return response({}, 204);
    };
    await sendOctoPrintCommand({ baseUrl: "http://octopi.local", apiKey: "key", action: "pause", fetchImpl });
    expect(calls).toEqual([{ url: "http://octopi.local/api/job", body: { command: "pause", action: "pause" } }]);
  });

  it("normalizes Moonraker status from printer objects", async () => {
    const fetchImpl = async (url) => {
      if (url.endsWith("/printer/info")) return response({ result: { state: "ready" } });
      return response({ result: { status: { print_stats: { state: "printing", filename: "part.gcode" }, extruder: { temperature: 205, target: 210 }, heater_bed: { temperature: 55, target: 60 } } } });
    };
    const status = await fetchMoonrakerStatus({ baseUrl: "http://moonraker.local", fetchImpl });
    expect(status).toMatchObject({ status: "printing", progress: 50, nozzle: 205, bed: 55, targetNozzle: 210, targetBed: 60, job: "part.gcode" });
  });

  it("sends Moonraker home as a gcode script", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return response({ result: "ok" });
    };
    await sendMoonrakerCommand({ baseUrl: "http://moonraker.local/", action: "home axes", fetchImpl });
    expect(calls).toEqual([{ url: "http://moonraker.local/printer/gcode/script", body: { script: "G28" } }]);
  });

  it("normalizes PrusaLink status from the v1 status endpoint", async () => {
    const status = await fetchPrusaLinkStatus({
      baseUrl: "http://prusa-mini.local/",
      apiKey: "key",
      fetchImpl: async (url, init) => {
        expect(url).toBe("http://prusa-mini.local/api/v1/status");
        expect(init.headers["X-Api-Key"]).toBe("key");
        return response({
          printer: { state: "PRINTING", temp_nozzle: 213.2, target_nozzle: 215, temp_bed: 58.1, target_bed: 60 },
          job: { progress: 67.6, file: { display_name: "mk4-part.gcode" } }
        });
      }
    });
    expect(status).toMatchObject({ status: "printing", progress: 68, nozzle: 213, bed: 58, targetNozzle: 215, targetBed: 60, job: "mk4-part.gcode" });
  });

  it("sends PrusaLink pause commands through the active job endpoint", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push({ url, method: init.method || "GET", auth: init.headers?.Authorization });
      if (url.endsWith("/api/v1/job")) return response({ id: 42 });
      return response({}, 204);
    };
    await sendPrusaLinkCommand({ baseUrl: "http://prusa-mini.local", apiKey: "maker:secret", action: "pause", fetchImpl });
    expect(calls).toEqual([
      { url: "http://prusa-mini.local/api/v1/job", method: "GET", auth: "Basic bWFrZXI6c2VjcmV0" },
      { url: "http://prusa-mini.local/api/v1/job/42/pause", method: "PUT", auth: "Basic bWFrZXI6c2VjcmV0" }
    ]);
  });

  it("diagnoses PrusaLink bridges with safe credential handling", async () => {
    const diagnostic = await diagnoseBridge({
      kind: "prusalink",
      name: "MK4 PrusaLink",
      baseUrl: "http://mk4.local",
      apiKey: "secret"
    }, {
      fetchImpl: async () => response({ printer: { state: "READY" }, job: {} })
    });
    expect(diagnostic.ok).toBe(true);
    expect(diagnostic.status).toMatchObject({ status: "idle" });
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
  });

  it("diagnoses invalid bridge URLs without network calls", async () => {
    const diagnostic = await diagnoseBridge({ kind: "octoprint", name: "Bad bridge", baseUrl: "octopi.local", apiKey: "" }, { fetchImpl: async () => {
      throw new Error("should not fetch");
    } });
    expect(diagnostic.ok).toBe(false);
    expect(diagnostic.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Base URL", status: "failed" })]));
    expect(diagnostic.recommendation).toContain("valid bridge URL");
  });

  it("returns a safe bridge diagnostic for HTTP failures", async () => {
    const diagnostic = await diagnoseBridge({
      kind: "octoprint",
      name: "Farm Octo",
      baseUrl: "http://octopi.local",
      apiKey: "secret"
    }, {
      fetchImpl: async () => response({ error: "unauthorized" }, 401)
    });
    expect(diagnostic.ok).toBe(false);
    expect(JSON.stringify(diagnostic)).not.toContain("secret");
    expect(diagnostic.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Authentication", status: "passed" }),
      expect.objectContaining({ name: "Status endpoint", status: "failed" })
    ]));
  });
});
