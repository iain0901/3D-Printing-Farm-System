import { describe, expect, it } from "vitest";
import {
  calculateQuoteTotal,
  canTransitionCase,
  caseIntakeSchema,
  createQuoteVersion,
  evaluateReadyToPrint,
  formatCaseNumber,
  normalizeChatwootContext,
  publicQuoteVersion
} from "./case-domain.mjs";

describe("3DRFM case domain", () => {
  it("validates model and no-model intake paths", () => {
    const base = {
      customer: { name: "測試客戶", email: "buyer@example.com" },
      project: "機構支架",
      defaults: { material: "PETG", color: "黑色", quantity: 2 },
      parts: []
    };
    expect(caseIntakeSchema.safeParse({ ...base, hasModel: true, fileIds: [] }).success).toBe(false);
    expect(caseIntakeSchema.safeParse({ ...base, hasModel: true, fileIds: ["file-1"] }).success).toBe(true);
    expect(caseIntakeSchema.safeParse({ ...base, hasModel: false, purpose: "外殼打樣" }).success).toBe(true);
  });

  it("creates immutable traceable quote versions while exposing only total to customers", () => {
    const record = { quoteVersions: [{ id: "v1", versionNo: 1, status: "sent" }] };
    const version = createQuoteVersion(record, {
      send: true,
      scope: "兩件 PETG 支架",
      breakdown: { material: 100, machineTime: 200, setup: 80, shipping: 60, discount: 20, tax: 21 }
    }, { email: "quote@example.com" }, new Date("2026-08-04T00:00:00.000Z"));
    expect(record.quoteVersions[0].status).toBe("superseded");
    expect(version).toMatchObject({ versionNo: 2, status: "sent", customerTotal: 441, currency: "TWD" });
    expect(publicQuoteVersion(version)).toEqual({
      id: version.id,
      versionNo: 2,
      status: "sent",
      currency: "TWD",
      total: 441,
      scope: "兩件 PETG 支架",
      validUntil: "2026-08-11T00:00:00.000Z",
      sentAt: "2026-08-04T00:00:00.000Z"
    });
    expect(publicQuoteVersion(version)).not.toHaveProperty("breakdown");
    expect(calculateQuoteTotal({ material: 100, machineTime: 50, discount: 20, tax: 5 }).total).toBe(135);
  });

  it("enforces workflow and the complete Orca production gate", () => {
    expect(canTransitionCase("new", "under_review")).toEqual({ allowed: true });
    expect(canTransitionCase("new", "printing").allowed).toBe(false);
    const record = {
      currentQuoteVersionId: "qv-1",
      quoteVersions: [{ id: "qv-1", status: "accepted" }],
      paymentStatus: "paid",
      printerId: "printer-1",
      approvedSlicerJobId: "slice-1",
      slicerJobs: [{ id: "slice-1", engine: "OrcaSlicer", status: "completed", gcodeFileId: "gcode-1", approvedAt: "2026-08-04", approvedBy: "operator" }],
      parts: [{ readiness: "ready" }, { readiness: "ready" }]
    };
    expect(evaluateReadyToPrint(record)).toMatchObject({ allowed: true });
    record.slicerJobs[0].approvedAt = "";
    expect(evaluateReadyToPrint(record)).toMatchObject({ allowed: false, blockers: [{ key: "gcodeApproved" }] });
  });

  it("formats case numbers and normalizes Chatwoot context", () => {
    expect(formatCaseNumber(new Date("2026-08-04T12:00:00+08:00"), 7)).toBe("Q-20260804-007");
    expect(normalizeChatwootContext({
      accountId: 1,
      conversation: { id: 22, inbox_id: 3 },
      contact: { id: 4, name: "王小姐", phone_number: "+886 912-345-678", email: "WANG@EXAMPLE.COM" },
      agent: { id: 5, name: "Iris" }
    })).toMatchObject({ accountId: "1", conversationId: "22", contactId: "4", phone: "0912345678", email: "wang@example.com" });
  });
});
