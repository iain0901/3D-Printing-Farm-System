import { describe, it, expect } from "vitest";
import { cameraSession } from "../frontend-vue/src/api/freePrintCamera.js";
const now = Date.parse("2026-10-24T01:00:00Z");
const origin = "https://example.test";
const valid = {
  state: "ready",
  kind: "snapshot",
  mediaUrl: "/api/customer/workspace/free-print/reservations/own/camera/frame",
  expiresAt: "2026-10-24T01:01:00Z",
};
describe("camera frontend contract", () => {
  it("handles unconfigured backends and valid reservation-scoped sources", () => {
    expect(cameraSession({}, "own", now, origin)).toBeNull();
    expect(
      cameraSession({ camera: { state: "unconfigured" } }, "own", now, origin)
    ).toBeNull();
    expect(cameraSession({ camera: valid }, "own", now, origin).mediaUrl).toBe(
      valid.mediaUrl
    );
  });
  it("rejects stale, permanent, cross-reservation and off-origin streams", () => {
    for (const patch of [
      { expiresAt: "2026-10-24T00:59:00Z" },
      { expiresAt: "2026-10-24T01:03:00Z" },
      { kind: "iframe" },
      { mediaUrl: "http://camera.local/live" },
      { mediaUrl: "//camera.local/live" },
      {
        mediaUrl:
          "/api/customer/workspace/free-print/reservations/another/camera/frame",
      },
      {
        mediaUrl:
          "/api/customer/workspace/free-print/reservations/own/camera/../../another/camera/frame",
      },
    ])
      expect(() =>
        cameraSession({ camera: { ...valid, ...patch } }, "own", now, origin)
      ).toThrow();
  });
});
