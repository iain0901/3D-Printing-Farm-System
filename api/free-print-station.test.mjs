import Fastify from "fastify";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, it, expect, vi } from "vitest";
import { registerFreePrintStation } from "./free-print-station.mjs";
import { stationHardwareCommand } from "./free-print-hardware.mjs";
const apps = [];
afterEach(async () => {
  while (apps.length) await apps.pop().close();
});
async function fixture({ mail = true, createCameraSession = null } = {}) {
  const app = Fastify();
  apps.push(app);
  let time = Date.parse("2026-10-24T01:00:00Z");
  const users = {
    a: { id: "a", email: "a@example.test", workspaceId: "ws-default" },
    b: { id: "b", email: "b@example.test", workspaceId: "ws-default" },
    other: { id: "other", email: "other@example.test", workspaceId: "other" },
    admin: { id: "admin", role: "Admin", workspaceId: "ws-default" },
  };
  app.addHook("preHandler", async (req) => {
    req.user = users[req.headers["x-user"]];
  });
  const db = {
    data: {
      customers: Object.values(users),
      printers: [
        {
          id: "p",
          workspaceId: "ws-default",
          name: "Station",
          buildVolume: [260, 260, 260],
        },
      ],
      bridges: [
        {
          printerId: "p",
          workspaceId: "ws-default",
          enabled: true,
          kind: "moonraker",
          baseUrl: "http://machine.test",
        },
      ],
      slicingQuotes: [],
      files: [],
      memberNotifications: [],
    },
    write: vi.fn(async () => {}),
  };
  let status = {
    status: "idle",
    nozzle: 25,
    bed: 25,
    progress: 0,
    jobState: "standby",
    position: { x: 10, y: 10, z: 10 },
  };
  const send = vi.fn(async () => {}),
    hardware = vi.fn(async () => {});
  const service = await registerFreePrintStation(app, {
    database: db,
    customerFromRequest: (_, req) => ({
      customer: users[req.headers["x-user"]],
    }),
    readFile: async () => Buffer.from("REAL TEST GCODE"),
    emailClient: mail ? { send } : null,
    clock: () => time,
    fetchStatus: async () => ({ ...status }),
    hardwareCommand: hardware,
    createCameraSession,
    intervalMs: 3600000,
  });
  const api = (user, method, path, payload) =>
    app.inject({
      method,
      url: "/api/customer/workspace/free-print" + path,
      headers: { "x-user": user },
      payload,
    });
  const admin = (method, path, payload, user = "admin") =>
    app.inject({
      method,
      url: "/api/member-service/free-print-station" + path,
      headers: { "x-user": user },
      payload,
    });
  const config = {
    enabled: true,
    printerId: "p",
    profileName: "verified PETG profile",
    nozzleTemperature: 240,
    bedTemperature: 75,
    minimumExtrudeTemperature: 220,
    releaseBedTemperature: 40,
    arrivalMinutes: 20,
    preparationMinutes: 30,
  };
  expect((await admin("PUT", "", config)).statusCode).toBe(200);
  function job(id) {
    const token = "secret-" + id;
    db.data.slicingQuotes.push({
      id,
      workspaceId: "ws-default",
      purpose: "free-print",
      stationId: "nthu-shuimu",
      material: "PETG",
      status: "completed",
      gcodeFileId: "gcode-" + id,
      profileName: config.profileName,
      estimatedMinutes: 15,
      publicAccessTokenHash: createHash("sha256").update(token).digest("hex"),
    });
    db.data.files.push({ id: "gcode-" + id, workspaceId: "ws-default" });
    return { stationId: "nthu-shuimu", slicingQuoteId: id, sliceToken: token };
  }
  const action = (u, id, action, extra = {}, requestId = randomUUID()) =>
    api(u, "POST", `/reservations/${id}/action`, {
      action,
      requestId,
      ...extra,
    });
  return {
    app,
    db,
    users,
    service,
    send,
    hardware,
    api,
    admin,
    job,
    action,
    config,
    setStatus: (patch) => (status = { ...status, ...patch }),
    advance: (ms) => (time += ms),
  };
}
describe("free print FIFO sessions and exclusive hardware control", () => {
  it("keeps camera sessions private, rejects queued/expired/ended slots, and reports unconfigured honestly", async () => {
    const f = await fixture();
    const first = await f.api(
      "a",
      "POST",
      "/reservations",
      f.job("camera-one")
    );
    const id = first.json().reservationId;
    const second = await f.api(
      "b",
      "POST",
      "/reservations",
      f.job("camera-two")
    );
    const camera = (user, reservationId = id) =>
      f.api(user, "POST", `/reservations/${reservationId}/camera-session`, {});
    expect((await camera("missing")).statusCode).toBe(401);
    expect((await camera("b")).statusCode).toBe(404);
    expect((await camera("other")).statusCode).toBe(404);
    expect((await camera("b", second.json().reservationId)).statusCode).toBe(
      403
    );
    const response = await camera("a");
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      reservationId: id,
      camera: { state: "unconfigured" },
    });
    expect(first.json().station.camera.configured).toBe(false);
    f.advance(21 * 60000);
    expect((await camera("a")).statusCode).toBe(403);
    f.advance(-21 * 60000);
    await f.action("a", id, "cancel");
    expect((await camera("a")).statusCode).toBe(403);
    expect(f.hardware).not.toHaveBeenCalled();
  });
  it("validates provider scope and lifetime without exposing printer URLs or credentials", async () => {
    let override;
    const provider = vi.fn(
      async ({ reservationId, expiresAt }) =>
        override || {
          state: "ready",
          kind: "mjpeg",
          expiresAt,
          mediaUrl: `/api/customer/workspace/free-print/reservations/${reservationId}/camera/stream?ticket=short-lived`,
        }
    );
    const f = await fixture({ createCameraSession: provider });
    const response = await f.api(
      "a",
      "POST",
      "/reservations",
      f.job("camera-provider")
    );
    const id = response.json().reservationId;
    const camera = () =>
      f.api("a", "POST", `/reservations/${id}/camera-session`, {});
    expect(response.json().station.camera.configured).toBe(true);
    const result = await camera();
    expect(result.statusCode).toBe(200);
    expect(result.json().camera.kind).toBe("mjpeg");
    const context = provider.mock.calls[0][0];
    expect(context).toEqual({
      reservationId: id,
      stationId: "nthu-shuimu",
      workspaceId: "ws-default",
      customerId: "a",
      expiresAt: "2026-10-24T01:01:00.000Z",
      signal: expect.any(AbortSignal),
    });
    const base = result.json().camera;
    for (const patch of [
      { mediaUrl: "http://user:password@printer.local/stream" },
      {
        mediaUrl: `/api/customer/workspace/free-print/reservations/${id}/camera/../../other/camera/stream`,
      },
      {
        mediaUrl:
          "/api/customer/workspace/free-print/reservations/another/camera/stream",
      },
      { expiresAt: "2026-10-24T01:03:00.000Z" },
      { expiresAt: "2026-10-24T00:59:00.000Z" },
      { password: "must-not-expose" },
    ]) {
      override = { ...base, ...patch };
      const denied = await camera();
      expect(denied.statusCode, JSON.stringify(patch)).toBe(502);
      expect(denied.body).not.toMatch(
        /password|printer\.local|must-not-expose/
      );
    }
    provider.mockRejectedValueOnce(new Error("secret printer credentials"));
    const denied = await camera();
    expect(denied.statusCode).toBe(502);
    expect(denied.body).not.toContain("secret");
  });
  it("does not block station control on a slow camera and rechecks access after camera setup", async () => {
    let finish, entered;
    const started = new Promise((resolve) => {
      entered = resolve;
    });
    const provider = ({ reservationId, expiresAt }) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            state: "ready",
            kind: "mjpeg",
            expiresAt,
            mediaUrl: `/api/customer/workspace/free-print/reservations/${reservationId}/camera/stream`,
          });
        entered();
      });
    const f = await fixture({ createCameraSession: provider });
    const first = await f.api(
      "a",
      "POST",
      "/reservations",
      f.job("slow-camera")
    );
    const id = first.json().reservationId;
    const pending = f
      .api("a", "POST", `/reservations/${id}/camera-session`, {})
      .then((r) => r);
    await started;
    // If camera setup held the station lock, this request would never finish.
    const cancel = await f.action("a", id, "cancel");
    expect(cancel.statusCode).toBe(200);
    finish();
    expect((await pending).statusCode).toBe(403);
  });
  it("runs two people through turn email, preparation, real file dispatch, completion, removal and next turn", async () => {
    const f = await fixture();
    const first = await f.api("a", "POST", "/reservations", f.job("one"));
    expect(first.statusCode, first.body).toBe(201);
    const id = first.json().reservationId;
    expect(first.json().reservations[0].status).toBe("notified");
    const second = await f.api("b", "POST", "/reservations", f.job("two"));
    const secondId = second.json().reservationId;
    expect(second.json().reservations[0].status).toBe("queued");
    expect(second.json().telemetry).toBe(null);
    expect((await f.action("b", id, "home")).statusCode).toBe(404);
    expect((await f.action("b", secondId, "home")).statusCode).toBe(403);
    expect((await f.action("a", id, "checkin")).statusCode).toBe(200);
    expect((await f.action("a", id, "load")).statusCode).toBe(409);
    expect((await f.action("a", id, "start")).statusCode).toBe(409);
    await f.action("a", id, "home");
    expect(
      (await f.action("a", id, "jog", { axis: "x", distance: -10 })).statusCode
    ).toBe(200);
    f.setStatus({ position: { x: 0, y: 10, z: 10 } });
    expect(
      (await f.action("a", id, "jog", { axis: "x", distance: -1 })).statusCode
    ).toBe(400);
    f.setStatus({ nozzle: 240, bed: 75 });
    expect((await f.action("a", id, "load")).statusCode).toBe(200);
    await f.action("a", id, "checks", {
      checks: { bedClear: true, filamentReady: true, areaClear: true },
    });
    const requestId = randomUUID();
    const responses = await Promise.all([
      f.action("a", id, "start", {}, requestId),
      f.action("a", id, "start", {}, requestId),
    ]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(
      f.hardware.mock.calls.filter(([, c]) => c.action === "start")
    ).toHaveLength(1);
    expect(
      f.hardware.mock.calls.find(([, c]) => c.action === "start")[1]
    ).toMatchObject({
      filename: `3drfm-free-${id}.gcode`,
      bytes: Buffer.from("REAL TEST GCODE"),
    });
    expect((await f.action("a", id, "start")).statusCode).toBe(409);
    f.setStatus({
      status: "printing",
      job: `3drfm-free-${id}.gcode`,
      progress: 20,
      jobState: "printing",
    });
    await f.service.tick();
    expect(f.db.data.freePrintReservations[0].status).toBe("printing");
    expect(
      (await f.action("a", id, "jog", { axis: "x", distance: 1 })).statusCode
    ).toBe(409);
    f.setStatus({ status: "idle", jobState: "complete", progress: 100 });
    await f.service.tick();
    expect(f.db.data.freePrintReservations[0].status).toBe("awaiting_removal");
    expect(f.db.data.freePrintReservations[1].status).toBe("queued");
    const checks = { bedClear: true, filamentReady: false, areaClear: true };
    expect((await f.action("a", id, "release", { checks })).statusCode).toBe(
      409
    );
    f.setStatus({ nozzle: 25, bed: 30 });
    expect((await f.action("a", id, "release", { checks })).statusCode).toBe(
      200
    );
    expect(f.db.data.freePrintReservations[0].status).toBe("completed");
    expect(f.db.data.freePrintReservations[1].status).toBe("notified");
    expect((await f.action("a", id, "home")).statusCode).toBe(403);
    await f.service.flushMail();
    expect(
      f.send.mock.calls.filter(([m]) => m.subject.includes("列印完成"))
    ).toHaveLength(1);
    expect(
      f.send.mock.calls.filter(([m]) => m.subject.includes("輪到你"))
    ).toHaveLength(2);
    expect(f.send.mock.calls.every(([m]) => !m.text.includes("secret-"))).toBe(
      true
    );
  });
  it("does not infer completion from a wrong file, offline state, or an unobserved idle transition", async () => {
    const f = await fixture();
    const joined = await f.api("a", "POST", "/reservations", f.job("one"));
    const id = joined.json().reservationId;
    await f.action("a", id, "checkin");
    await f.action("a", id, "home");
    await f.action("a", id, "checks", {
      checks: { bedClear: true, filamentReady: true, areaClear: true },
    });
    await f.action("a", id, "start");
    f.setStatus({
      status: "idle",
      job: "different.gcode",
      progress: 100,
      jobState: "complete",
    });
    await f.service.tick();
    expect(f.db.data.freePrintReservations[0].status).toBe("starting");
    f.setStatus({ status: "offline" });
    f.advance(180000);
    await f.service.tick();
    expect(f.db.data.freePrintReservations[0].status).toBe("starting");
    f.setStatus({
      status: "printing",
      job: `3drfm-free-${id}.gcode`,
      jobState: "printing",
      progress: 10,
    });
    await f.service.tick();
    f.setStatus({ status: "idle", job: "different.gcode" });
    await f.service.tick();
    expect(f.db.data.freePrintReservations[0].status).toBe("attention");
    await f.service.flushMail();
    expect(
      f.send.mock.calls.filter(([m]) => m.subject.includes("列印完成"))
    ).toHaveLength(0);
  });
  it("allows a notified member to decline and safely hands the cold idle station to the next person", async () => {
    const f = await fixture();
    const a = await f.api("a", "POST", "/reservations", f.job("one"));
    await f.api("b", "POST", "/reservations", f.job("two"));
    expect(
      (await f.action("a", a.json().reservationId, "cancel")).statusCode
    ).toBe(200);
    expect(f.db.data.freePrintReservations[0].status).toBe("cancelled");
    expect(f.db.data.freePrintReservations[1].status).toBe("notified");
    expect(f.hardware).not.toHaveBeenCalled();
  });
  it("keeps machine controls responsive while SMTP waits for a reply", async () => {
    const f = await fixture();
    let release;
    f.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    try {
      const joined = await f.api(
        "a",
        "POST",
        "/reservations",
        f.job("slow-email")
      );
      const id = joined.json().reservationId;
      expect((await f.action("a", id, "checkin")).statusCode).toBe(200);
      expect((await f.action("a", id, "home")).statusCode).toBe(200);
      expect(f.hardware.mock.calls.some(([, c]) => c.action === "home")).toBe(
        true
      );
    } finally {
      release?.();
      await f.service.flushMail();
    }
  });
  it("fences cross-owner, cross-workspace, unsupported commands and stale or incompatible results", async () => {
    const f = await fixture(),
      payload = f.job("one");
    expect(
      (await f.api("other", "POST", "/reservations", payload)).statusCode
    ).toBe(403);
    expect(
      (
        await f.api("a", "POST", "/reservations", {
          ...payload,
          sliceToken: "wrong",
        })
      ).statusCode
    ).toBe(400);
    f.db.data.slicingQuotes[0].profileName = "wrong";
    expect(
      (await f.api("a", "POST", "/reservations", payload)).statusCode
    ).toBe(409);
    f.db.data.slicingQuotes[0].profileName = f.config.profileName;
    const r = await f.api("a", "POST", "/reservations", payload),
      id = r.json().reservationId;
    expect(
      (await f.action("a", id, "gcode", { script: "G1 X999" })).statusCode
    ).toBe(400);
    expect(
      (await f.action("a", id, "home", { printerId: "other" })).statusCode
    ).toBe(400);
    expect((await f.admin("PUT", "", f.config, "a")).statusCode).toBe(403);
    expect((await f.api("b", "GET", "/station")).json().reservations).toEqual(
      []
    );
    expect(f.hardware).not.toHaveBeenCalled();
  });
  it("handles arrival expiry without skipping hot or occupied machines and retries email without duplicating successful mail", async () => {
    const f = await fixture();
    f.send.mockRejectedValueOnce(new Error("smtp down"));
    await f.api("a", "POST", "/reservations", f.job("one"));
    await f.api("b", "POST", "/reservations", f.job("two"));
    await f.service.flushMail();
    const successful = f.send.mock.calls.length;
    await f.service.tick();
    await f.service.flushMail();
    expect(f.send.mock.calls.length).toBe(successful);
    f.advance(60001);
    await f.service.tick();
    await f.service.flushMail();
    expect(f.db.data.freePrintMail.some((m) => m.status === "retry")).toBe(
      false
    );
    f.setStatus({ nozzle: 240, bed: 70 });
    f.advance(21 * 60000);
    await f.service.tick();
    expect(f.db.data.freePrintReservations[0].status).toBe("attention");
    expect(f.db.data.freePrintReservations[1].status).toBe("queued");
    f.setStatus({ nozzle: 25, bed: 25 });
    expect(
      (
        await f.admin("POST", "/resolve", {
          id: f.db.data.freePrintReservations[0].id,
          bedClear: true,
          note: "現場確認已停止冷卻且清空平台",
        })
      ).statusCode
    ).toBe(200);
    expect(f.db.data.freePrintReservations[1].status).toBe("notified");
  });
  it("blocks opening without SMTP and retains uncertain physical commands without automatic retry", async () => {
    const missing = await fixture({ mail: false });
    expect(
      (await missing.api("a", "POST", "/reservations", missing.job("one")))
        .statusCode
    ).toBe(409);
    const f = await fixture();
    const joined = await f.api("a", "POST", "/reservations", f.job("one"));
    const id = joined.json().reservationId;
    await f.action("a", id, "checkin");
    await f.action("a", id, "home");
    await f.action("a", id, "checks", {
      checks: { bedClear: true, filamentReady: true, areaClear: true },
    });
    f.hardware.mockRejectedValueOnce(new Error("lost acknowledgement"));
    const key = randomUUID();
    expect((await f.action("a", id, "start", {}, key)).statusCode).toBe(502);
    expect(f.db.data.freePrintReservations[0].status).toBe("attention");
    const count = f.hardware.mock.calls.length;
    await f.action("a", id, "start", {}, key);
    expect(f.hardware.mock.calls.length).toBe(count);
  });
});
describe("real station connector contracts", () => {
  it("uploads the exact named G-code and starts that file on Moonraker", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push([url, init]);
      return { ok: true };
    };
    await stationHardwareCommand(
      {
        kind: "moonraker",
        baseUrl: "http://printer.test",
        apiKey: "server-only",
      },
      {
        action: "start",
        filename: "3drfm-free-test.gcode",
        bytes: Buffer.from("G1 X10"),
      },
      { fetchImpl }
    );
    expect(calls.map(([u]) => u)).toEqual([
      "http://printer.test/server/files/upload",
      "http://printer.test/printer/print/start",
    ]);
    expect(await calls[0][1].body.get("file").text()).toBe("G1 X10");
    expect(JSON.parse(calls[1][1].body)).toEqual({
      filename: "3drfm-free-test.gcode",
    });
  });
  it("uses OctoPrint select-and-print and bounded relative scripts for filament changes", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    await stationHardwareCommand(
      { kind: "octoprint", baseUrl: "http://printer.test" },
      { action: "start", filename: "job.gcode", bytes: Buffer.from("G28") },
      { fetchImpl }
    );
    const form = fetchImpl.mock.calls[0][1].body;
    expect(form.get("select")).toBe("true");
    expect(form.get("print")).toBe("true");
    await stationHardwareCommand(
      { kind: "moonraker", baseUrl: "http://printer.test" },
      { action: "unload" },
      { fetchImpl }
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).script).toContain(
      "G1 E-10 F120"
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).script).toContain(
      "RESTORE_GCODE_STATE"
    );
  });
});
