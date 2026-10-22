// Frontend-only checks; no slice, quote, order or printer writes are allowed.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const base = process.env.BASE_URL || "http://127.0.0.1:8799";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Local test server required.");
async function run() {
  const three = resolve(__dirname, "../frontend-vue/node_modules/three");
  const { BoxGeometry, Mesh } = await import(
    pathToFileURL(join(three, "build/three.module.js"))
  );
  const { STLExporter } = await import(
    pathToFileURL(join(three, "examples/jsm/exporters/STLExporter.js"))
  );
  const geometry = new BoxGeometry(20, 30, 40),
    mesh = new Mesh(geometry);
  const bytes = Buffer.from(
    new STLExporter().parse(mesh, { binary: true }).buffer
  );
  geometry.dispose();
  const file = (name) => ({
    name,
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-quote-workbench-"));
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const errors = [],
      forbidden = [];
    let authFail = false,
      expired = false;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (msg) => {
      if (
        msg.type() === "error" &&
        /THREE|shader|WebGLProgram/i.test(msg.text())
      )
        errors.push(msg.text());
    });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const reply = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      const customer = {
        id: "member-test",
        name: "工作台測試會員",
        email: "workbench@example.test",
      };
      if (path.endsWith("/customer-auth/me"))
        return reply(
          expired ? { error: "expired" } : { customer },
          expired ? 401 : 200
        );
      if (
        path.endsWith("/customer-auth/login") ||
        path.endsWith("/customer-auth/register")
      )
        return reply(
          authFail
            ? { error: "invalid credentials" }
            : { token: "workbench-local-only", customer },
          authFail ? 401 : 200
        );
      if (path.endsWith("/customer-auth/logout")) return reply({ ok: true });
      if (
        /slicing-quotes|\/public\/cases|\/printers|\/queue|\/orders/.test(path)
      ) {
        forbidden.push(path);
        return reply({ error: "forbidden test request" }, 500);
      }
      return route.continue();
    });
    await page.goto(base + "/#/quote?service=rush-print");
    await page
      .getByRole("heading", { level: 1, name: "把想法，放上列印平台。" })
      .waitFor();
    assert.equal(await page.locator("main").count(), 1);
    const next = page.getByRole("button", { name: "確認設定，帶入會員資料" });
    assert.equal(await next.isDisabled(), true);
    assert.equal(
      await page.getByLabel("列印材料", { exact: true }).inputValue(),
      "PETG"
    );
    assert.equal(
      await page
        .getByLabel("列印材料", { exact: true })
        .locator("option")
        .count(),
      6
    );
    await page.getByLabel("選擇 STL 模型").setInputFiles({
      name: "bad.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("bad"),
    });
    await page
      .getByRole("alert")
      .filter({ hasText: "請選擇非空白 STL" })
      .waitFor();
    await page
      .getByLabel("選擇 STL 模型")
      .setInputFiles([file("body.stl"), file("cap.stl")]);
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".assignment-card").length === 2 &&
        !document.querySelector(".primary-button").disabled
    );
    await page.getByRole("radio", { name: "多色列印", exact: true }).check();
    await page
      .getByRole("button", { name: "色槽 1 選擇森林綠", exact: true })
      .click();
    await page
      .getByRole("button", { name: "色槽 2 選擇朱紅", exact: true })
      .click();
    await page.getByLabel("body.stl 數量", { exact: true }).fill("2");
    await page.getByLabel("cap.stl 數量", { exact: true }).fill("3");
    await page
      .getByLabel("cap.stl 基底色", { exact: true })
      .selectOption("slot-2");
    await page
      .getByRole("button", { name: "body.stl 新增換色區間", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("交由切片器自動選擇方向").isDisabled(),
      true
    );
    await page
      .getByLabel("body.stl 區間 1 起始高度", { exact: true })
      .fill("20");
    await page
      .getByLabel("body.stl 區間 1 結束高度", { exact: true })
      .fill("30");
    await page
      .getByRole("button", { name: "body.stl 新增換色區間", exact: true })
      .click();
    await page
      .getByLabel("body.stl 區間 2 起始高度", { exact: true })
      .fill("25");
    assert.equal(await next.isDisabled(), true);
    await page
      .getByRole("status")
      .filter({ hasText: "換色區間不可重疊" })
      .waitFor();
    await page
      .getByLabel("body.stl 區間 2 起始高度", { exact: true })
      .fill("30");
    await page
      .getByRole("button", { name: "body.stl 移除區間 2", exact: true })
      .click();
    await page
      .getByLabel("body.stl 區間 1 結束高度", { exact: true })
      .fill("80");
    assert.equal(await next.isDisabled(), true);
    await page
      .getByLabel("body.stl 區間 1 結束高度", { exact: true })
      .fill("40");
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".model-viewer canvas")?.dataset
            .renderedTriangles
        ) > 0
    );
    // Inspect the actual rendered WebGL image, not only the selected labels.
    await page.locator(".model-viewer-overlay").waitFor({ state: "hidden" });
    const rendered = await page
      .locator(".model-viewer canvas")
      .screenshot({ path: join(screenshots, "rendered-colors.png") });
    const colorCounts = await page.evaluate(async (data) => {
      const img = new Image();
      img.src = "data:image/png;base64," + data;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0,
        green = 0;
      for (let i = 0; i < rgba.length; i += 4) {
        if (rgba[i] > rgba[i + 1] * 1.3 && rgba[i] > 70) red++;
        if (rgba[i + 1] > rgba[i] * 1.2 && rgba[i + 1] > 50) green++;
      }
      return { red, green };
    }, rendered.toString("base64"));
    assert.ok(
      colorCounts.red > 100 && colorCounts.green > 100,
      JSON.stringify(colorCounts)
    );
    await page
      .locator(".model-panel")
      .screenshot({ path: join(screenshots, "model-multicolor.png") });
    await page.getByLabel("列印材料", { exact: true }).selectOption("ASA");
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        `overflow at ${width}`
      );
      if ([1440, 390].includes(width))
        await page.screenshot({
          path: join(screenshots, `workbench-${width}.png`),
          fullPage: true,
        });
    }
    await next.click();
    await page
      .getByLabel("電子郵件", { exact: true })
      .fill("workbench@example.test");
    await page
      .getByLabel("密碼", { exact: true })
      .fill("browser-test-password");
    authFail = true;
    await page
      .getByRole("button", { name: "登入並帶入資料", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "無法完成登入或註冊" })
      .waitFor();
    assert.match(page.url(), /#\/quote/);
    assert.equal(await page.locator(".assignment-card").count(), 2);
    authFail = false;
    await page
      .getByRole("button", { name: "登入並帶入資料", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "工作台測試會員", exact: true })
      .waitFor();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "下載設定草稿（JSON）" }).click();
    const download = await downloadPromise;
    const draft = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.equal(draft.settings.material, "ASA");
    assert.deepEqual(
      draft.models.map((m) => m.quantity),
      [2, 3]
    );
    assert.equal(draft.models[1].baseSlotId, "slot-2");
    assert.deepEqual(draft.models[0].heightBands, [
      { from: 20, to: 40, slotId: "slot-2" },
    ]);
    assert.equal(draft.machineProfileId, null);
    assert.equal(draft.estimate, null);
    assert.ok(!JSON.stringify(draft).includes("browser-test-password"));
    assert.ok(!JSON.stringify(draft).includes("workbench@example.test"));
    assert.equal(
      await page
        .getByRole("button", { name: "切片並取得報價（尚未開放）" })
        .isDisabled(),
      true
    );
    await page.getByRole("button", { name: "＋ 新增色槽" }).click();
    await page
      .getByLabel("cap.stl 基底色", { exact: true })
      .selectOption("slot-3");
    await page.getByRole("button", { name: "移除色槽 3", exact: true }).click();
    assert.equal(
      await page.getByLabel("cap.stl 基底色", { exact: true }).inputValue(),
      "slot-1"
    );
    await page
      .getByLabel("cap.stl 基底色", { exact: true })
      .selectOption("slot-2");
    await page
      .locator(".model-tabs button")
      .filter({ hasText: "body.stl" })
      .click();
    await page
      .getByRole("button", { name: "移除選取模型", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".assignment-card").length === 1 &&
        !document.querySelector(".primary-button").disabled
    );
    assert.equal(
      await page.getByLabel("cap.stl 數量", { exact: true }).inputValue(),
      "3"
    );
    assert.equal(
      await page.getByLabel("cap.stl 基底色", { exact: true }).inputValue(),
      "slot-2"
    );
    await page.getByRole("radio", { name: "單色列印", exact: true }).check();
    assert.equal(await page.locator(".color-slot").count(), 1);
    await page.getByRole("radio", { name: "多色列印", exact: true }).check();
    while ((await page.locator(".color-slot").count()) < 8)
      await page.getByRole("button", { name: "＋ 新增色槽" }).click();
    assert.equal(
      await page.getByRole("button", { name: "＋ 新增色槽" }).isDisabled(),
      true
    );
    await page.getByRole("button", { name: "切換帳號", exact: true }).click();
    await page.getByRole("button", { name: "建立帳號", exact: true }).click();
    await page.getByLabel("姓名", { exact: true }).fill("工作台測試會員");
    await page
      .getByLabel("密碼", { exact: true })
      .fill("browser-test-password");
    await page
      .getByRole("button", { name: "註冊並帶入資料", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "工作台測試會員", exact: true })
      .waitFor();
    expired = true;
    await page.reload();
    await page.getByLabel("選擇 STL 模型").setInputFiles(file("return.stl"));
    await page.waitForFunction(
      () => !document.querySelector(".primary-button").disabled
    );
    await next.click();
    await page
      .getByRole("alert")
      .filter({ hasText: "無法確認會員資料" })
      .waitFor();
    assert.match(page.url(), /#\/quote/);
    assert.equal(await page.locator(".assignment-card").count(), 1);
    page.once("dialog", (dialog) => dialog.dismiss());
    await page
      .getByRole("button", { name: "需要建模或轉檔？專員協助" })
      .click();
    assert.equal(await page.locator(".assignment-card").count(), 1);
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "需要建模或轉檔？專員協助" })
      .click();
    await page.getByRole("heading", { name: "你想怎麼開始？" }).waitFor();
    await page.goto(base + "/#/free-print/nthu-shuimu/slicer");
    await page.getByText("3DSTU_PETG", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("列印材料", { exact: true }).count(), 0);
    assert.deepEqual(forbidden, []);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          screenshots,
          checks:
            "local STL, model identity, quantities, slots, height band validation and rendered colors, all breakpoints, draft download, login/register/expired session, specialist fallback, no backend slices or orders, free PETG lock",
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}
run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
