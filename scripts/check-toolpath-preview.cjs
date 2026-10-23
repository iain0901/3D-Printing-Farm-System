const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const base = process.env.BASE_URL || "http://127.0.0.1:8806";
const real = process.env.REAL_SLICE === "1";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");

async function main() {
  const three = resolve(__dirname, "../frontend-vue/node_modules/three");
  const { BufferGeometry, Float32BufferAttribute, Mesh } = await import(
    pathToFileURL(join(three, "build/three.module.js"))
  );
  const { STLExporter } = await import(
    pathToFileURL(join(three, "examples/jsm/exporters/STLExporter.js"))
  );
  // Closed, indexed annulus: share the seam exactly, without near-coincident
  // endpoints from a full-circle Shape/Path extrusion.
  const points = [],
    indices = [],
    sides = 128;
  for (const z of [0, 4.5])
    for (const radius of [24.85, 15])
      for (let i = 0; i < sides; i++)
        points.push(
          radius * Math.cos((i * Math.PI * 2) / sides),
          radius * Math.sin((i * Math.PI * 2) / sides),
          z
        );
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    quad(i, j, j + 256, i + 256);
    quad(i + 128, i + 384, j + 384, j + 128);
    quad(i + 256, j + 256, j + 384, i + 384);
    quad(i, i + 128, j + 128, j);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const bytes = Buffer.from(
    new STLExporter().parse(new Mesh(geometry), { binary: true }).buffer
  );
  geometry.dispose();
  const output = mkdtempSync(join(tmpdir(), "3drfm-preview-ring-"));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  let page,
    preview,
    passed = false;
  try {
    page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (real)
      page.on("response", async (response) => {
        if (response.url().endsWith("/toolpaths") && response.ok())
          preview = (await response.json()).preview;
      });
    else {
      const { buildToolpathPreview } = await import(
        pathToFileURL(resolve(__dirname, "../api/toolpath-preview.mjs"))
      );
      const code = ["G90", "M83", "; WIDTH: 0.45", "; HEIGHT: 0.2"];
      for (let l = 1; l <= 22; l++)
        for (const radius of [15, 15.45, 24.4, 24.85]) {
          code.push(
            `G0 X${130 + radius} Y130 Z${l * 0.2}`,
            "; FEATURE: Outer wall"
          );
          for (let i = 1; i <= 128; i++)
            code.push(
              `G1 X${130 + radius * Math.cos((i * Math.PI) / 64)} Y${
                130 + radius * Math.sin((i * Math.PI) / 64)
              } E0.03`
            );
        }
      code.push("G0 X0 Y0 Z250");
      preview = buildToolpathPreview(code.join("\n"));
      const job = {
        id: "ring-preview",
        status: "completed",
        createdAt: new Date().toISOString(),
        engine: "OrcaSlicer",
        totalGrams: 4,
        modelGrams: 4,
        supportGrams: 0,
        otherGrams: 0,
        estimatedMinutes: 10,
      };
      await page.route("**/api/public/slicing-quotes**", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(
            route.request().url().endsWith("/toolpaths")
              ? { preview }
              : { slicingQuote: job, accessToken: "ring-local-token" }
          ),
        })
      );
    }
    await page.goto(base + "/#/cloud-slicer");
    await page.getByLabel("選擇 STL 模型", { exact: true }).setInputFiles({
      name: "ring-49.7mm.stl",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
    const start = page.getByRole("button", { name: /^開始切片/ });
    await start.waitFor();
    await page.waitForFunction(
      () =>
        !document.querySelector(".studio-preparing") &&
        Number(
          document.querySelector(".stage-canvas canvas")?.dataset
            .renderedTriangles
        ) > 0
    );
    await start.click();
    await page.waitForFunction(
      () =>
        document.querySelector(".toolpath-canvas canvas")?.dataset.view ===
          "model" &&
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .renderedTriangles
        ) > 500,
      {},
      { timeout: 180000 }
    );
    await page.screenshot({
      path: join(output, "ring-model-desktop.png"),
      fullPage: true,
    });
    const canvas = page.locator(".toolpath-canvas canvas");
    const camera = await canvas.getAttribute("data-camera");
    await page.getByRole("button", { name: "列印路徑", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector(".toolpath-canvas canvas")?.dataset.view ===
        "paths"
    );
    assert.equal(
      await canvas.getAttribute("data-camera"),
      camera,
      "switch must retain camera framing"
    );
    assert.equal(
      await page.getByLabel("路徑結束層", { exact: true }).inputValue(),
      String(preview.layers.length - 1)
    );
    assert.ok(preview.layers.length >= 20, "full lid height must remain");
    assert.ok(
      preview.objectBounds.max[2] >= 4.3,
      "bounds include final extrusion layer"
    );
    assert.ok(
      preview.objectBounds.max[0] - preview.objectBounds.min[0] < 51,
      "ignore parking/travel bounds"
    );
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .renderedTriangles
        ) > 10000
    );
    await page.screenshot({
      path: join(output, "ring-paths-desktop.png"),
      fullPage: true,
    });
    const total = Number(await canvas.getAttribute("data-visible-segments"));
    await page.getByLabel("路徑結束層", { exact: true }).fill("0");
    await page.getByLabel("只顯示目前層", { exact: true }).check();
    await page.getByLabel("路徑線段進度", { exact: true }).fill("50");
    await page.waitForFunction(
      (n) =>
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .visibleSegments
        ) < n,
      total
    );
    await page
      .getByRole("button", { name: "顯示全部圖層", exact: true })
      .click();
    await page.waitForFunction(
      (n) =>
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .visibleSegments
        ) === n,
      total
    );
    assert.equal(
      await page.getByLabel("只顯示目前層", { exact: true }).isChecked(),
      false
    );
    assert.equal(
      await canvas.getAttribute("data-camera"),
      camera,
      "layer inspection must not reframe"
    );
    await page.getByLabel("顯示外壁路徑", { exact: true }).uncheck();
    await page.getByLabel("顯示外壁路徑", { exact: true }).check();
    await page.getByRole("button", { name: "播放路徑", exact: true }).click();
    await page.getByRole("button", { name: "模型外觀", exact: true }).click();
    await page.getByRole("button", { name: "列印路徑", exact: true }).click();
    assert.equal(
      await page.getByRole("button", { name: "播放路徑", exact: true }).count(),
      1,
      "switch stops playback"
    );
    await page
      .getByRole("button", { name: "顯示全部圖層", exact: true })
      .click();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      await page.getByRole("button", { name: "適合視窗", exact: true }).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      await page.screenshot({
        path: join(output, `ring-paths-${width}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "模型外觀", exact: true }).click();
      await page.getByRole("button", { name: "適合視窗", exact: true }).click();
      await page.screenshot({
        path: join(output, `ring-model-${width}.png`),
        fullPage: true,
      });
      await page.getByRole("button", { name: "列印路徑", exact: true }).click();
    }
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector(".toolpath-canvas canvas")?.dataset.view ===
          "paths" &&
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .renderedTriangles
        ) > 10000
    );
    assert.equal(
      await page
        .getByRole("button", { name: "模型外觀", exact: true })
        .isDisabled(),
      true,
      "do not pretend to restore absent source STL"
    );
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify({
        passed,
        real,
        layers: preview.layers.length,
        segments: preview.segmentCount,
        output,
      })
    );
  } finally {
    if (!passed && page)
      await page
        .screenshot({ path: join(output, "failure.png"), fullPage: true })
        .catch(() => {});
    await browser.close();
    if (!passed) console.error("Screenshots:", output);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
