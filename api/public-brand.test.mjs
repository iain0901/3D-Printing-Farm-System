import { describe, expect, it } from "vitest";
import {
  publicNavigation,
  footerGroups,
} from "../frontend-vue/src/content/publicNavigation.mjs";
import {
  homeArtwork,
  routeArtwork,
} from "../frontend-vue/src/content/publicArtwork.mjs";
import {
  audiences,
  services,
} from "../frontend-vue/src/content/fdmServices.mjs";
import { publicPages } from "../frontend-vue/src/content/publicPages.mjs";

const routes = new Set([
  "/",
  "/services",
  "/free-print",
  "/cloud-slicer",
  "/quote",
  "/portal/login",
  "/portal/register",
  ...audiences.map((a) => "/for/" + a.id),
  ...services.map((s) => "/services/" + s.id),
  ...publicPages.map((p) => p.path),
]);
describe("3DRFM public brand information architecture", () => {
  it("groups company information independently from member and staff applications", () => {
    expect(publicNavigation.map((g) => g.id)).toEqual([
      "services",
      "applications",
      "resources",
      "company",
    ]);
    for (const group of [...publicNavigation, ...footerGroups]) {
      for (const link of group.links) {
        expect(routes.has(link.to)).toBe(true);
        expect(link.to).not.toBe("/login");
      }
    }
  });
  it("curates at most two placements for each of the 13 illustrations", () => {
    const counts = new Map();
    for (const kind of [...homeArtwork, ...Object.values(routeArtwork)])
      counts.set(kind, (counts.get(kind) || 0) + 1);
    expect(counts.size).toBe(13);
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(2);
    for (const path of Object.keys(routeArtwork))
      expect(routes.has(path)).toBe(true);
    for (const path of [
      "/privacy",
      "/terms",
      "/portal/login",
      "/portal/register",
      "/portal/reset",
      "/login",
    ])
      expect(routeArtwork[path]).toBeUndefined();
  });
  it("recommends PETG without making a universal material guarantee", () => {
    const comparison = publicPages
      .find((p) => p.id === "materials")
      .blocks.find((b) => b.type === "comparison");
    expect(comparison.rows).toHaveLength(6);
    expect(
      comparison.rows
        .filter((row) => row.recommended)
        .map((row) => row.material)
    ).toEqual(["PETG"]);
    expect(comparison.intro).toContain("實際選擇仍要依模型、受力與環境確認");
  });
});
