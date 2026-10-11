import { describe, expect, it } from "vitest";
import {
  audiences,
  services,
  getAudience,
  getService,
  servicesForAudience,
  fdmMaterials,
  inquiryRoute,
  inquiryNotes,
} from "../frontend-vue/src/content/fdmServices.mjs";

describe("FDM audience pages and existing estimator handoff", () => {
  it("defines one directory, three audience hubs and eight distinct service pages", () => {
    expect(audiences).toHaveLength(3);
    expect(services).toHaveLength(8);
    expect(new Set(services.map((item) => item.id)).size).toBe(8);
    expect(new Set(services.map((item) => item.summary)).size).toBe(8);
    expect(new Set(services.map((item) => item.question)).size).toBe(8);
    expect(
      audiences.map((item) => servicesForAudience(item.id).length)
    ).toEqual([3, 3, 2]);
  });
  it.each(services)(
    "$id has specific preparation, limitations and valid FDM materials",
    (service) => {
      expect(getAudience(service.audience)).toBeTruthy();
      expect(service.priorities).toHaveLength(3);
      expect(service.checklist).toHaveLength(4);
      expect(service.boundary.length).toBeGreaterThan(40);
      expect(service.examples.length).toBeGreaterThan(0);
      for (const [material] of service.materials)
        expect(fdmMaterials).toContain(material);
      expect(inquiryRoute(service.id)).toEqual({
        path: "/quote",
        query: { service: service.id, mode: "estimate" },
      });
      expect(inquiryNotes(service.id)).toContain(service.title);
      expect(inquiryNotes(service.id)).toContain(service.brief);
    }
  );
  it("never offers resin printing or accepts arbitrary query text as service content", () => {
    expect(fdmMaterials).not.toContain("Resin");
    for (const invalid of [
      "unknown",
      "__proto__",
      "<script>",
      undefined,
      ["rush-print"],
    ]) {
      expect(getService(invalid)).toBeNull();
      expect(inquiryNotes(invalid)).toBe("");
      expect(inquiryRoute(invalid)).toEqual({ path: "/quote" });
    }
    expect(getAudience("missing")).toBeNull();
  });
  it("keeps rush estimates distinct from a delivery promise", () => {
    expect(getService("rush-print").boundary).toContain("不保證");
    expect(inquiryNotes("rush-print")).toContain("不代表已承諾交期或排單");
  });
});
