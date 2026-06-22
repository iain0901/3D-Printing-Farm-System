import { describe, expect, it } from "vitest";
import { diagnoseBridge, fetchMoonrakerStatus, fetchOctoPrintStatus, sendMoonrakerCommand, sendOctoPrintCommand } from "./hardware-bridge.mjs";

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
