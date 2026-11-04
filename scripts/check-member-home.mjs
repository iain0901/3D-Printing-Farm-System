import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer, openDatabase } from "../api/server.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "member-home-"));
process.chdir(fileURLToPath(new URL("../frontend-vue/", import.meta.url)));
process.env.LAYERPILOT_STORAGE_DIR = path.join(directory, "storage");
const db = await openDatabase(path.join(directory, "db.json"));
const app = await buildServer({
  db,
  serveStatic: true,
  emailClient: null,
  stripeClient: null,
});
let browser;
try {
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  context.setDefaultTimeout(15000);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/#/portal/print`);
  await page
    .getByRole("button", { name: "登入會員中心", exact: true })
    .waitFor()
    .catch(async (e) => {
      console.log(page.url(), errors, await page.locator("body").innerText());
      throw e;
    });
  assert.ok(page.url().includes("redirect="));
  const response = await context.request.post(
    `${base}/api/customer-auth/register`,
    {
      data: {
        name: "流程測試會員",
        email: "member-flow@example.test",
        password: "fixture-password-123",
      },
    }
  );
  assert.equal(response.status(), 201);
  const session = await response.json();
  await page.evaluate(
    (s) => localStorage.setItem("layerpilot-customer-token", s.token),
    session
  );
  await page.reload();
  await page.goto(`${base}/#/portal/dashboard`);
  await page.getByText("從第一個模型開始", { exact: true }).waitFor();
  console.log(
    "PASS anonymous member route returns to login; real member sees empty-state guidance"
  );
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(250);
    if (width === 390) console.log(await page.evaluate(() => ({sidebar:getComputedStyle(document.querySelector('.portal-sidebar')).width, main:getComputedStyle(document.querySelector('.portal-main')).padding, viewport:innerWidth})));
    await page.screenshot({
      path: path.join(directory, `home-${width}.png`),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1
      ),
      false
    );
  }
  await page.locator(".start-option.paid").click();
  await page.getByLabel("選擇 STL 模型", { exact: true }).waitFor();
  assert.equal(await page.locator(".portal-sidebar").count(), 1);
  assert.equal(await page.locator(".public-site").count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await page.screenshot({path:path.join(directory,'paid-member-mobile.png'),fullPage:true});
  await page.goto(`${base}/#/portal/free-slicer`);
  await page.getByRole("heading", { name: "水木書苑・雲端切片" }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.equal(await page.locator(".portal-sidebar").count(), 1);
  await page.getByRole("link", { name: "我的排隊與列印操作" }).click();
  await page
    .getByRole("heading", { name: "一步一步，完成你的免費列印。" })
    .waitFor();
  assert.equal(await page.locator(".public-site").count(), 0);
  await page.getByRole("link", { name: "準備模型與切片" }).click();
  assert.ok(page.url().includes("/portal/free-slicer"));
  console.log(
    "PASS paid editor, free slicer and queue remain within the member layout"
  );
  await page.route("**/api/customer/cases", (route) =>
    route.fulfill({
      json: {
        cases: [
          {
            id: "fixture-case",
            project: "需要補件的模型",
            status: "supplement_requested",
            parts: [],
          },
        ],
      },
    })
  );
  await page.route("**/api/customer/workspace/free-print/station", (route) =>
    route.fulfill({
      json: {
        station: {},
        reservations: [
          {
            id: "fixture-reservation",
            sequence: 2,
            status: "awaiting_removal",
          },
        ],
      },
    })
  );
  await page.goto(`${base}/#/portal/dashboard`);
  await page.getByText("需要你補件", { exact: true }).waitFor();
  await page.getByRole("link", { name: "取件與交棒" }).waitFor();
  await page.screenshot({
    path: path.join(directory, "home-actions.png"),
    fullPage: true,
  });
  assert.ok(
    await page
      .getByRole("link", { name: "查看補件要求" })
      .getAttribute("href")
      .then((h) => h.includes("fixture-case"))
  );
  await page.route("**/api/customer/cases", (route) =>
    route.fulfill({ status: 503, json: { error: "fixture unavailable" } })
  );
  await page.getByRole("button", { name: "更新進度" }).click();
  await page
    .getByText("案件暫時無法讀取，請重試。", { exact: false })
    .waitFor();
  await page.getByRole("link", { name: "取件與交棒" }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `PASS actionable statuses, per-source error recovery and no JS errors. Screenshots: ${directory}`
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(path.join(directory, "db.json"), { force: true });
}
