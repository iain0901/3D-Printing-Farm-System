import { describe, it, expect } from "vitest";
import {
  adminTools,
  visibleAdminTools,
  adminNavGroup,
  stationControlAllowed,
} from "../frontend-vue/src/utils/admin-workspace.mjs";
describe("management entry points", () => {
  it("keeps every new workflow reachable and restricts privileged shortcuts", () => {
    expect(visibleAdminTools(["*"])).toHaveLength(adminTools.length);
    expect(
      visibleAdminTools([]).some((t) => t.to === "/free-print-admin")
    ).toBe(false);
    expect(
      visibleAdminTools(["orders:write"]).some((t) => t.to === "/cases/index")
    ).toBe(true);
    expect(
      visibleAdminTools(["orders:write"]).some(
        (t) => t.to === "/ai-knowledge/index"
      )
    ).toBe(false);
    expect(adminNavGroup("/free-print-admin")).toBe("生產與設備");
    expect(adminNavGroup("/agent-tools")).toBe("AI 與整合");
  });
});
describe("reservation control visibility fails closed", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const item = {
    canControl: true,
    status: "preparing",
    leaseExpiresAt: new Date(now + 60000).toISOString(),
  };
  it("requires owner lease, freshness and valid expiry", () => {
    expect(stationControlAllowed(item, now)).toBe(true);
    for (const patch of [
      { canControl: false },
      { status: "queued" },
      { status: "attention" },
      { status: "completed" },
      { leaseExpiresAt: "invalid" },
      { leaseExpiresAt: new Date(now).toISOString() },
    ]) {
      expect(stationControlAllowed({ ...item, ...patch }, now)).toBe(false);
    }
    expect(stationControlAllowed(item, now, true)).toBe(false);
    expect(stationControlAllowed(null, now)).toBe(false);
  });
  it("keeps print monitoring and pickup available after preparation deadline", () => {
    for (const status of ["starting", "printing", "paused", "awaiting_removal"])
      expect(stationControlAllowed({ ...item, status }, now + 120000)).toBe(
        true
      );
  });
});
