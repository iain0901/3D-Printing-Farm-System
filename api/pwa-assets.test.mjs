import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("3DRFM PWA assets", () => {
  it("builds installable mobile console assets without caching API data", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "frontend-vue", "dist", "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({
      name: "3DRFM 3D 列印製造服務",
      short_name: "3DRFM",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#17343d"
    });
    expect(manifest.icons.some((icon) => icon.src === "/layerpilot-icon.svg" && icon.purpose.includes("maskable"))).toBe(true);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(expect.arrayContaining(["/#/portal/dashboard", "/#/quote"]));

    const index = await readFile(path.join(root, "frontend-vue", "dist", "index.html"), "utf8");
    expect(index).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(index).toContain('name="theme-color" content="#17343d"');

    const serviceWorker = await readFile(path.join(root, "frontend-vue", "dist", "sw.js"), "utf8");
    expect(serviceWorker).toContain("layerpilot-shell-v1");
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain("/offline.html");

    const offline = await readFile(path.join(root, "frontend-vue", "dist", "offline.html"), "utf8");
    expect(offline).toContain('lang="zh-Hant"');
    expect(offline).toContain("目前無法連線");
    expect(offline).toContain("需要連線至伺服器");
  });
});
