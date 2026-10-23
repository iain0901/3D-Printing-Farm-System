const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const base = process.env.BASE_URL || "http://127.0.0.1:8804";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local test server only");

async function main() {
  const { instructionPlacements } = await import(
    "../frontend-vue/src/content/instructionArtwork.mjs"
  );
  const metadata = require("../frontend-vue/src/content/instructionArtworkAssets.json");
  const registered = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "插圖驗證會員",
      email: `art-${Date.now()}@example.test`,
      password: "illustration-test-123",
      phone: "0912345678",
    }),
  });
  assert.equal(registered.status, 201);
  const { token } = await registered.json();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await page.addInitScript(
    (token) => localStorage.setItem("layerpilot-customer-token", token),
    token
  );
  const shots = mkdtempSync(join(tmpdir(), "3drfm-instruction-art-")),
    errors = [],
    broken = [],
    usage = new Map();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.url().includes("/images/instructions/") && !r.ok())
      broken.push(r.url());
  });
  let passed = false;
  async function visit(route) {
    await page.goto(base + "/#" + route);
    await page.waitForFunction(
      (expected) =>
        document.querySelector("#vue-admin-better").__vue_app__?.config
          .globalProperties.$router.currentRoute.value.fullPath === expected,
      route
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    );
  }
  try {
    for (const [route, expected] of Object.entries(instructionPlacements)) {
      await visit(route);
      if (route.startsWith("/portal/workspace")) {
        await page.locator(".member-hub").waitFor();
        await page
          .locator(".member-hub > .hub-panel[role=status]")
          .waitFor({ state: "hidden" });
      }
      await page.waitForFunction((ids) => {
        const actual = [...document.querySelectorAll("[data-instruction-art]")]
          .map((el) => el.dataset.instructionArt)
          .sort();
        return JSON.stringify(actual) === JSON.stringify([...ids].sort());
      }, expected);
      const images = await page
        .locator("[data-instruction-art]")
        .evaluateAll(async (elements) => {
          for (const img of elements) {
            img.loading = "eager";
            await img.decode();
          }
          return elements.map((img) => {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            const context = canvas.getContext("2d");
            context.drawImage(img, 0, 0);
            return {
              id: img.dataset.instructionArt,
              width: img.naturalWidth,
              height: img.naturalHeight,
              alt: img.alt,
              cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
            };
          });
        });
      for (const img of images) {
        const source = metadata.assets[img.id];
        assert.equal(img.width, source.width, route);
        assert.equal(img.height, source.height, route);
        assert.equal(
          img.alt,
          "",
          route + " decorative duplicates are silent to screen readers"
        );
        assert.equal(
          img.cornerAlpha,
          0,
          route + " must preserve transparent cutout corners"
        );
        usage.set(img.id, [...(usage.get(img.id) || []), route]);
      }
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        );
        const sizes = await page
          .locator("[data-instruction-art]")
          .evaluateAll((els) =>
            els.map((el) => ({
              id: el.dataset.instructionArt,
              width: el.getBoundingClientRect().width,
              height: el.getBoundingClientRect().height,
            }))
          );
        for (const size of sizes) {
          assert.ok(
            size.width > 0 && size.width <= 240,
            JSON.stringify({ route, ...size })
          );
          assert.ok(
            size.height > 0 && size.height <= 180,
            JSON.stringify({ route, ...size })
          );
        }
        if (
          [1440, 390].includes(width) &&
          [
            "/",
            "/materials",
            "/guides/fdm-design",
            "/free-print/nthu-shuimu",
            "/portal/workspace?section=models",
            "/portal/workspace?section=drafts",
            "/quote",
            "/cloud-slicer",
          ].includes(route)
        ) {
          const focus =
            route === "/"
              ? page.locator(".commission-section")
              : route === "/quote"
              ? page.locator(".workbench-grid")
              : route === "/cloud-slicer"
              ? page.locator(".slicer-stage")
              : route.startsWith("/portal/")
              ? page.locator(".member-hub")
              : route === "/materials" || route === "/guides/fdm-design"
              ? page.locator(".instruction-notes")
              : page.locator("main");
          await focus.screenshot({
            path: join(shots, `${route.replace(/\W/g, "-")}-${width}.png`),
          });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    assert.equal(usage.size, 16);
    for (const [id, routes] of usage)
      assert.equal(routes.length, 2, `${id}: ${routes.join(", ")}`);
    // Empty-state imagery must disappear when the real 3D editor is in use.
    await visit("/cloud-slicer");
    const { BoxGeometry, Mesh } = await import(
      "../frontend-vue/node_modules/three/build/three.module.js"
    );
    const { STLExporter } = await import(
      "../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js"
    );
    const geometry = new BoxGeometry(10, 20, 30);
    const buffer = Buffer.from(
      new STLExporter().parse(new Mesh(geometry), { binary: true }).buffer
    );
    geometry.dispose();
    await page
      .getByLabel("選擇 STL 模型")
      .setInputFiles({
        name: "art-test.stl",
        mimeType: "application/octet-stream",
        buffer,
      });
    await page
      .locator(".stage-empty [data-instruction-art]")
      .waitFor({ state: "hidden" });
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".stage-canvas canvas")?.dataset
            .renderedTriangles
        ) === 12
    );
    assert.deepEqual(broken, []);
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          assets: usage.size,
          placements: [...usage.values()].reduce((n, p) => n + p.length, 0),
          checks: [
            "real generated assets and alpha",
            "at most two placements each",
            "small contextual images, not full-page posters",
            "HTML copy and silent decorative alt",
            "320/390/768/1440px",
            "empty-state imagery does not cover active models",
          ],
          screenshots: shots,
        },
        null,
        2
      )
    );
  } finally {
    if (!passed) {
      console.error(
        page.url(),
        (await page.locator("body").innerText()).slice(-2000)
      );
      await page
        .screenshot({ path: join(shots, "failure.png"), fullPage: true })
        .catch(() => {});
      console.error("Screenshots:", shots);
    }
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
