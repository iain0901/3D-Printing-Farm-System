const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const { tmpdir } = require("node:os");
const base = process.env.BASE_URL || "http://127.0.0.1:8800";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only browser test.");
async function run() {
  const root = resolve(__dirname, "../frontend-vue/node_modules/three");
  const { BoxGeometry, Mesh } = await import(
    pathToFileURL(join(root, "build/three.module.js"))
  );
  const { STLExporter } = await import(
    pathToFileURL(join(root, "examples/jsm/exporters/STLExporter.js"))
  );
  const g = new BoxGeometry(20, 30, 40),
    bytes = Buffer.from(
      new STLExporter().parse(new Mesh(g), { binary: true }).buffer
    );
  g.dispose();
  const file = (name) => ({
    name,
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-surface-paint-"));
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    const errors = [],
      apiRequests = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && /THREE|shader|WebGLProgram/.test(m.text()))
        errors.push(m.text());
    });
    await page.route("**/api/**", async (route) => {
      apiRequests.push(new URL(route.request().url()).pathname);
      await route.abort();
    });
    const next = page.getByRole("button", { name: "確認設定，帶入會員資料" });
    const paintCount = () =>
      page
        .locator(".surface-tools [role=status]")
        .innerText()
        .then((t) => Number(t.match(/已塗色 (\d+)/)[1]));
    const waitCount = (count) =>
      page.waitForFunction(
        (n) =>
          document
            .querySelector(".surface-tools [role=status]")
            ?.textContent.includes(`已塗色 ${n}／`),
        count
      );
    const ready = async () => {
      await page.waitForFunction(
        () => !document.querySelector(".primary-button").disabled
      );
      await page.locator(".model-viewer-overlay").waitFor({ state: "hidden" });
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector(".model-viewer canvas")?.dataset
              .renderedTriangles
          ) > 0
      );
    };
    const clickModel = async () => {
      const canvas = page.locator(".model-viewer canvas");
      await canvas.scrollIntoViewIfNeeded();
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    const downloadDraft = async () => {
      await next.click();
      const event = page.waitForEvent("download");
      await page.getByRole("button", { name: "下載設定草稿（JSON）" }).click();
      return JSON.parse(readFileSync(await (await event).path(), "utf8"));
    };
    await page.goto(base + "/#/quote");
    await page
      .getByLabel("選擇 STL 模型")
      .setInputFiles([file("paint-a.stl"), file("paint-b.stl")]);
    await ready();
    assert.equal(await page.locator(".surface-tools").count(), 0);
    await page.getByRole("radio", { name: "多色列印", exact: true }).check();
    await ready();
    await page
      .getByRole("button", { name: "色槽 1 選擇森林綠", exact: true })
      .click();
    await page
      .getByRole("button", { name: "色槽 2 選擇朱紅", exact: true })
      .click();
    await page.getByLabel("筆刷色槽", { exact: true }).selectOption("slot-2");
    await page.getByRole("button", { name: "筆刷上色", exact: true }).click();
    await page.getByLabel("筆刷半徑（mm）").fill("1");
    await clickModel();
    await waitCount(1);
    await page.getByRole("button", { name: "復原上色", exact: true }).click();
    await waitCount(0);
    await page.getByRole("button", { name: "重做上色", exact: true }).click();
    await waitCount(1);
    await page.getByRole("button", { name: "橡皮擦", exact: true }).click();
    await clickModel();
    await waitCount(0);
    await page.getByRole("button", { name: "復原上色", exact: true }).click();
    await waitCount(1);
    await page
      .getByRole("button", { name: "相連平面填色", exact: true })
      .click();
    await clickModel();
    await waitCount(2);
    const rendered = await page
      .locator(".model-viewer canvas")
      .screenshot({ path: join(screenshots, "painted-front.png") });
    const coloredPixels = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = "data:image/png;base64," + data;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
      let red = 0,
        green = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] > pixels[i + 1] * 1.3 && pixels[i] > 70) red++;
        if (pixels[i + 1] > pixels[i] * 1.2 && pixels[i + 1] > 50) green++;
      }
      return { red, green };
    }, rendered.toString("base64"));
    assert.ok(
      coloredPixels.red > 100 && coloredPixels.green > 100,
      JSON.stringify(coloredPixels)
    );
    const first = await downloadDraft();
    const firstPaint = first.models[0].surfacePaint;
    assert.equal(first.schemaVersion, "3drfm.quote-workspace.v2");
    assert.equal(firstPaint.triangleCount, 12);
    assert.match(firstPaint.geometrySha256, /^[a-f0-9]{64}$/);
    assert.equal(firstPaint.faces.length, 2);
    assert.ok(firstPaint.faces.every((pair) => pair[1] === "slot-2"));
    assert.equal(first.models[1].surfacePaint, null);
    await page.getByLabel("Z 軸旋轉（°）").fill("90");
    await page.getByLabel("等比例縮放（%）").fill("110");
    await page.getByRole("button", { name: "自動排版", exact: true }).click();
    await ready();
    await waitCount(2);
    const rotated = await downloadDraft();
    assert.deepEqual(rotated.models[0].surfacePaint.faces, firstPaint.faces);
    assert.notEqual(
      rotated.models[0].surfacePaint.geometrySha256,
      firstPaint.geometrySha256
    );
    await page
      .locator(".model-tabs button")
      .filter({ hasText: "paint-b.stl" })
      .click();
    await ready();
    await waitCount(0);
    await page
      .getByRole("button", { name: "相連平面填色", exact: true })
      .click();
    await clickModel();
    await waitCount(2);
    await page
      .locator(".model-tabs button")
      .filter({ hasText: "paint-a.stl" })
      .click();
    await ready();
    await waitCount(2);
    await page.getByRole("button", { name: "旋轉檢視", exact: true }).click();
    const canvas = page.locator(".model-viewer canvas");
    await canvas.scrollIntoViewIfNeeded();
    const rect = await canvas.boundingBox();
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width / 2 + 80,
      rect.y + rect.height / 2 + 20,
      { steps: 8 }
    );
    await page.mouse.up();
    assert.equal(await paintCount(), 2);
    await page
      .locator(".surface-tools")
      .screenshot({ path: join(screenshots, "paint-tools.png") });
    await page
      .locator(".model-viewer")
      .screenshot({ path: join(screenshots, "painted-model.png") });
    page.once("dialog", (d) => d.dismiss());
    await page
      .getByRole("button", { name: "清除模型上色", exact: true })
      .click();
    await waitCount(2);
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "清除模型上色", exact: true })
      .click();
    await waitCount(0);
    await page.getByRole("button", { name: "復原上色", exact: true }).click();
    await waitCount(2);
    await page.getByRole("radio", { name: "單色列印", exact: true }).check();
    await ready();
    assert.equal((await downloadDraft()).models[0].surfacePaint, null);
    await page.getByRole("radio", { name: "多色列印", exact: true }).check();
    await ready();
    await waitCount(2);
    await page.getByRole("button", { name: "＋ 新增色槽" }).click();
    await page.getByLabel("筆刷色槽", { exact: true }).selectOption("slot-3");
    await page
      .getByRole("button", { name: "相連平面填色", exact: true })
      .click();
    await clickModel();
    await page.getByRole("button", { name: "移除色槽 3", exact: true }).click();
    assert.equal(
      await page.getByLabel("筆刷色槽", { exact: true }).inputValue(),
      "slot-1"
    );
    assert.equal(
      await page
        .getByRole("button", { name: "復原上色", exact: true })
        .isDisabled(),
      true
    );
    assert.ok(
      (await downloadDraft()).models[0].surfacePaint.faces.every(
        (pair) => pair[1] !== "slot-3"
      )
    );
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        `overflow ${width}`
      );
      if (width === 390)
        await page
          .locator(".model-panel")
          .screenshot({ path: join(screenshots, "paint-mobile.png") });
    }
    // Touch pointer input paints without OrbitControls intercepting the gesture.
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "清除模型上色", exact: true })
      .click();
    await waitCount(0);
    await page.setViewportSize({ width: 390, height: 950 });
    await page.getByRole("button", { name: "筆刷上色", exact: true }).click();
    await page.getByLabel("筆刷色槽", { exact: true }).selectOption("slot-2");
    await canvas.scrollIntoViewIfNeeded();
    const touchRect = await canvas.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        {
          x: touchRect.x + touchRect.width / 2,
          y: touchRect.y + touchRect.height / 2,
          radiusX: 2,
          radiusY: 2,
        },
      ],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await waitCount(1);
    await page
      .getByRole("button", { name: "移除選取模型", exact: true })
      .click();
    await ready();
    const remaining = await downloadDraft();
    assert.equal(remaining.models.length, 1);
    assert.equal(remaining.models[0].name, "paint-b.stl");
    assert.equal(remaining.models[0].surfacePaint.faces.length, 2);
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          screenshots,
          checks:
            "brush, fill, erase, undo/redo, geometry binding, transforms, model switching, orbit, reset confirmation, single/multi modes, slot deletion, responsive, touch, JSON persistence, no API writes",
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
