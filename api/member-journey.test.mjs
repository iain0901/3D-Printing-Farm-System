import { describe, it, expect } from "vitest";
import { nextMemberAction } from "../frontend-vue/src/utils/member-journey.mjs";
import { memberReturnPath } from "../frontend-vue/src/utils/member-return.mjs";
describe("member journey guidance", () => {
  it("distinguishes user action from waiting and preserves unknown states", () => {
    for (const state of [
      "supplement_requested",
      "quoted",
      "awaiting_payment",
      "notified",
      "awaiting_removal",
      "failed",
    ])
      expect(nextMemberAction(state).attention).toBe(true);
    for (const state of ["printing", "queued", "completed", "unknown"])
      expect(nextMemberAction(state).attention).toBe(false);
    expect(nextMemberAction("unknown").title).toBe("等待處理");
    expect(nextMemberAction("awaiting_removal").action).toBe("取件與交棒");
  });
  it("returns to member print flows after login, without accepting external redirects", () => {
    for (const path of [
      "/portal/print?draft=abc",
      "/portal/free-slicer",
      "/portal/free-print",
    ])
      expect(memberReturnPath(path)).toBe(path);
    for (const path of [
      "https://evil.test",
      "//evil.test",
      "/portal/print/../../login",
      "/portal/print-evil",
    ])
      expect(memberReturnPath(path)).toBe("/portal/dashboard");
  });
});
