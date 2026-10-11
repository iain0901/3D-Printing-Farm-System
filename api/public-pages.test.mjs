import { describe, expect, it } from "vitest";
import {
  publicPages,
  getPublicPage,
} from "../frontend-vue/src/content/publicPages.mjs";

describe("public launch information pages", () => {
  it("defines the essential public guidance, contact, privacy and service pages", () => {
    expect(publicPages.map((page) => page.id)).toEqual([
      "materials",
      "file-prep",
      "fdm-design",
      "process",
      "faq",
      "about",
      "contact",
      "privacy",
      "terms",
    ]);
    expect(new Set(publicPages.map((page) => page.path)).size).toBe(
      publicPages.length
    );
    expect(new Set(publicPages.map((page) => page.title)).size).toBe(
      publicPages.length
    );
  });

  it.each(publicPages)(
    "$id has complete, Traditional Chinese public content",
    (page) => {
      expect(page.path).toMatch(/^\//);
      expect(page.headline).toHaveLength(2);
      expect(page.lead).toMatch(/[一-龥]/);
      expect(page.blocks.length).toBeGreaterThan(1);
      expect(page.cta.to).toMatch(/^\//);
      expect(getPublicPage(page.id)).toBe(page);
    }
  );

  it("does not invent unconfigured phone, address, payment or delivery promises", () => {
    const content = JSON.stringify(publicPages);
    expect(content).toContain("support@3dstu.com");
    expect(content).not.toMatch(/(02|03|04|05|06|07|08|09)-\d{7,8}/);
    expect(content).not.toMatch(/台北市|新北市|地址：/);
    expect(content).not.toMatch(/隔日送達|當日送達/);
    expect(content).toContain("不代表已排程");
  });

  it("has a safe unknown-page fallback", () => {
    expect(getPublicPage("not-a-page")).toBeNull();
    expect(getPublicPage(["materials"])).toBeNull();
    expect(getPublicPage()).toBeNull();
  });
});
