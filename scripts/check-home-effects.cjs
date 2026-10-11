// Exercise the real WebGPU renderer (SwiftShader), fallbacks and GPU cleanup.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const base = (process.env.BASE_URL || "http://127.0.0.1:8797").replace(
  /\/$/,
  ""
);

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader"],
  });
  const errors = [];
  const requests = [];
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("request", (r) => requests.push(r.url()));
    await page.addInitScript(() => {
      window.gpuAudit = { frames: 0, destroyed: 0 };
      const submit = GPUQueue.prototype.submit;
      GPUQueue.prototype.submit = function (...args) {
        window.gpuAudit.frames++;
        return submit.apply(this, args);
      };
      const destroy = GPUDevice.prototype.destroy;
      GPUDevice.prototype.destroy = function (...args) {
        window.gpuAudit.destroyed++;
        return destroy.apply(this, args);
      };
    });
    await page.goto(base + "/#/");
    const hero = page.locator(".poster-art");
    await page.waitForFunction(
      () => document.querySelector(".poster-art")?.dataset.effect === "animated"
    );
    const before = await page.evaluate(() => gpuAudit.frames);
    await page.waitForFunction((n) => gpuAudit.frames > n + 3, before);
    await page.waitForFunction(() => {
      const c = document.querySelector(".layer-canvas");
      return Math.max(c.width, c.height) <= 722;
    });
    const buffer = await page
      .locator(".layer-canvas")
      .evaluate((c) => [c.width, c.height]);
    assert.ok(Math.max(...buffer) <= 722, "drawing buffer must stay bounded");
    const rect = await hero.boundingBox();
    await page.mouse.move(
      rect.x + rect.width * 0.8,
      rect.y + rect.height * 0.3
    );
    await page.waitForFunction(
      () =>
        parseFloat(
          document
            .querySelector(".poster-art")
            .style.getPropertyValue("--object-x")
        ) > 0
    );
    await page.locator(".signature-object").evaluate((img) => img.decode());
    await page.locator("#nprogress").waitFor({ state: "hidden" });
    await page.screenshot({
      path: "/tmp/3drfm-shader-home-1440.png",
      animations: "disabled",
    });
    console.log(
      "PASS real WebGPU frames, bounded canvas and pointer interaction"
    );

    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight)
    );
    await page.waitForTimeout(350);
    const stopped = await page.evaluate(() => gpuAudit.frames);
    await page.waitForTimeout(350);
    assert.equal(
      await page.evaluate(() => gpuAudit.frames),
      stopped,
      "offscreen renderer must pause"
    );
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForFunction((n) => gpuAudit.frames > n, stopped);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () =>
        document.querySelector(".poster-art").dataset.effect === "static" &&
        gpuAudit.destroyed > 0
    );
    assert.equal(
      await hero.evaluate((el) => el.style.getPropertyValue("--object-x")),
      ""
    );
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction(
      () => document.querySelector(".poster-art").dataset.effect === "animated"
    );
    const destroyed = await page.evaluate(() => gpuAudit.destroyed);
    await page.evaluate(() => {
      location.hash = "/materials";
    });
    await hero.waitFor({ state: "detached" });
    await page.waitForFunction((n) => gpuAudit.destroyed > n, destroyed);
    console.log(
      "PASS offscreen pause/resume, live reduced-motion change and route cleanup"
    );

    for (const mode of [
      "unsupported",
      "no-adapter",
      "reduced-motion",
      "save-data",
    ]) {
      const fallback = await browser.newPage({
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
        reducedMotion: mode === "reduced-motion" ? "reduce" : "no-preference",
      });
      const chunks = [];
      fallback.on("request", (r) => {
        if (r.url().includes("fdm-layer-")) chunks.push(r.url());
      });
      fallback.on("pageerror", (e) => errors.push(e.message));
      await fallback.addInitScript((mode) => {
        if (mode === "unsupported")
          Object.defineProperty(navigator, "gpu", { value: undefined });
        if (mode === "no-adapter")
          navigator.gpu.requestAdapter = async () => null;
        if (mode === "save-data")
          Object.defineProperty(navigator, "connection", {
            value: { saveData: true },
          });
      }, mode);
      const loaded =
        mode === "no-adapter"
          ? fallback.waitForResponse(
              (r) => r.url().includes("fdm-layer-engine") && r.status() === 200
            )
          : Promise.resolve();
      await fallback.goto(base + "/#/");
      await fallback.locator(".poster-art").waitFor();
      await loaded;
      await fallback.waitForTimeout(600);
      assert.equal(
        await fallback.locator(".poster-art").getAttribute("data-effect"),
        "static"
      );
      assert.ok(await fallback.locator(".layer-static").isVisible());
      assert.ok(
        await fallback.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        )
      );
      if (mode !== "no-adapter")
        assert.equal(chunks.length, 0, `${mode} must not download GPU code`);
      await fallback.getByRole("link", { name: "上傳模型・自動估價" }).click();
      await fallback.waitForURL("**/#/quote");
      await fallback.locator("h1").waitFor();
      console.log(`PASS ${mode} fallback and quote navigation`);
      await fallback.close();
    }
    assert.deepEqual(errors, []);
    assert.ok(
      !requests.some((url) => /telemetry|api\.shaders\.com/.test(url)),
      "no shaders telemetry"
    );
    console.log("PASS no browser exceptions or shaders telemetry");
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
