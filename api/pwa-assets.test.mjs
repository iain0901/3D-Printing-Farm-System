import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("3DSTUXXX PWA assets", () => {
  it("builds installable mobile console assets without caching API data", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "dist", "manifest.webmanifest"), "utf8"));
    expect(manifest).toMatchObject({
      name: "3DSTUXXX",
      short_name: "3DSTUXXX",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: "#2563eb"
    });
    expect(manifest.icons.some((icon) => icon.src === "/layerpilot-icon.svg" && icon.purpose.includes("maskable"))).toBe(true);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(expect.arrayContaining(["/", "/?view=queue"]));

    const index = await readFile(path.join(root, "dist", "index.html"), "utf8");
    expect(index).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(index).toContain('name="theme-color" content="#2563eb"');

    const serviceWorker = await readFile(path.join(root, "dist", "sw.js"), "utf8");
    expect(serviceWorker).toContain("layerpilot-shell-v1");
    expect(serviceWorker).toContain('url.pathname.startsWith("/api/")');
    expect(serviceWorker).toContain("/offline.html");

    const offline = await readFile(path.join(root, "dist", "offline.html"), "utf8");
    expect(offline).toContain("Offline console");
    expect(offline).toContain("local API connection");
  });
});
