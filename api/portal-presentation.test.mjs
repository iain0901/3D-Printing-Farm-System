import { describe, it, expect } from "vitest";
import {
  portalSection,
  portalStatus,
  portalStatusType,
  portalMoney,
  portalSummary,
} from "../frontend-vue/src/utils/portal-presentation.mjs";
import { CASE_STATUSES } from "./case-domain.mjs";

describe("會員工作台呈現", () => {
  it("未知分頁安全回到案件，保留四個既有功能區", () => {
    expect(portalSection("unknown").id).toBe("cases");
    for (const id of ["cases", "quotes", "orders", "addresses"])
      expect(portalSection(id).id).toBe(id);
  });
  it("每個正式案件狀態都有繁體中文，不暴露英文代碼", () => {
    for (const status of CASE_STATUSES) {
      expect(portalStatus(status)).not.toBe("待專員確認");
      expect(portalStatus(status)).toMatch(/[\u4e00-\u9fff]/);
    }
    expect(portalStatus("future_unknown_status")).toBe("待專員確認");
    expect(portalStatusType("formal_quote_sent")).toBe("warning");
    expect(portalStatusType("completed")).toBe("success");
    for (const status of [
      "received",
      "queued",
      "printing",
      "on_hold",
      "packed",
      "shipped",
      "completed",
      "cancelled",
      "new",
      "reviewing",
      "quoted",
      "accepted",
      "converted",
      "rejected",
    ]) {
      expect(portalStatus(status)).not.toBe("待專員確認");
    }
  });
  it("尚未報價與零元分開顯示，金額有千分位", () => {
    expect(portalMoney(null)).toBe("待確認");
    expect(portalMoney(undefined)).toBe("待確認");
    expect(portalMoney("bad")).toBe("待確認");
    expect(portalMoney(0)).toBe("NT$ 0");
    expect(portalMoney(1280)).toBe("NT$ 1,280");
  });
  it("統計來自真實案件，待回覆細節不重複計數", () => {
    expect(
      portalSummary(
        [
          { status: "printing" },
          { status: "formal_quote_sent" },
          { status: "completed" },
          { status: "cancelled" },
        ],
        [
          {
            status: "quoted",
            confirmations: [{ status: "pending" }, { status: "pending" }],
          },
          { status: "new", confirmations: [{ status: "pending" }] },
          { status: "accepted" },
        ]
      )
    ).toEqual({ active: 2, awaiting: 3, completed: 1 });
    expect(portalSummary([], [])).toEqual({
      active: 0,
      awaiting: 0,
      completed: 0,
    });
  });
});
