import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
const read = (path) =>
  readFile(new URL(`../frontend-vue/${path}`, import.meta.url), "utf8");

describe("shared 3DRFM visual identity", () => {
  it("loads the design tokens once for public, member and slicer surfaces", async () => {
    expect(await read("src/main.js")).toContain("@/styles/brand-tokens.scss");
    const tokens = await read("src/styles/brand-tokens.scss");
    for (const token of [
      "ink",
      "primary",
      "interactive",
      "accent",
      "paper",
      "font",
      "radius-control",
      "radius-panel",
      "focus",
    ]) {
      expect(tokens).toContain(`--rfm-${token}:`);
    }
    expect(tokens).toContain(".brand-dialog");
    expect(tokens).toContain("--el-color-primary: var(--rfm-primary)");
  });
  it("reuses the same wordmark and brand scope in all three shells", async () => {
    for (const path of [
      "src/components/public/PublicShell.vue",
      "src/layouts/PortalLayout.vue",
      "src/components/SlicerLab.vue",
    ]) {
      const source = await read(path);
      expect(source).toContain("brand-surface");
      expect(source).toContain("import BrandMark");
      expect(source).toContain("<brand-mark");
    }
    expect(await read("src/components/public/BrandMark.vue")).toContain(
      "var(--rfm-accent)"
    );
  });
  it("does not let the homepage redefine shared navigation or footer chrome", async () => {
    const home = await read("src/views/landing/Index.vue");
    expect(home).not.toMatch(
      /:deep\(\.(?:public-header|public-footer|studio-brand|nav-panel|nav-trigger)/
    );
    for (const path of [
      "src/styles/public-services.scss",
      "src/styles/public-info.scss",
      "src/views/free-print/Index.vue",
    ]) {
      const source = await read(path);
      expect(source).toContain("var(--rfm-title-page)");
      expect(source).not.toMatch(/#(?:167c91|245c48|17343d|183d34)\b/i);
    }
  });
  it("matches the browser and offline shell to the same navy and paper", async () => {
    const manifest = JSON.parse(await read("public/manifest.webmanifest"));
    expect(manifest.theme_color).toBe("#192e53");
    expect(manifest.background_color).toBe("#f7f3e9");
    expect(await read("public/index.html")).toContain('content="#192e53"');
    const offline = await read("public/offline.html");
    expect(offline).toContain("#f7f3e9");
    expect(offline).toContain("'Noto Sans TC'");
  });
});
