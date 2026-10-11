// Public audience-page checks. Uses the real, non-mutating estimate API;
// intercepts case creation so no order is written.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const base = (process.env.BASE_URL || "http://127.0.0.1:8797").replace(
  /\/$/,
  ""
);

async function run() {
  const { audiences, services } = await import(
    "../frontend-vue/src/content/fdmServices.mjs"
  );
  const screenshots = mkdtempSync(join(tmpdir(), "farmflow-services-"));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
      reducedMotion: "reduce",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const routes = [
      "/services",
      ...audiences.map((item) => `/for/${item.id}`),
      ...services.map((item) => `/services/${item.id}`),
    ];
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.goto(base + "/#" + route);
        await page.locator(".services-page h1").waitFor();
        assert.ok(
          page.url().includes(route),
          `Anonymous access failed: ${route}`
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          `${route}: overflow at ${width}`
        );
        if (
          [1440, 390].includes(width) &&
          [
            "/services",
            "/for/education",
            "/services/industrial-parts",
            "/services/rush-print",
          ].includes(route)
        ) {
          await page.waitForTimeout(350);
          await page.screenshot({
            path: join(
              screenshots,
              `${route.replaceAll("/", "-")}-${width}.png`
            ),
            fullPage: true,
          });
        }
      }
      console.log(`PASS 12 public service pages at ${width}px`);
    }
    await page.goto(base + "/#/services");
    assert.equal(await page.locator(".use-case-card").count(), 8);
    await page
      .getByRole("link", { name: "公司與設計團隊", exact: true })
      .click();
    await page.locator(".use-case-card").first().waitFor();
    assert.equal(await page.locator(".use-case-card").count(), 3);
    assert.match(await page.title(), /公司與設計團隊/);
    for (const service of services) {
      await page.goto(base + "/#/services/" + service.id);
      await page
        .locator(".service-hero")
        .getByRole("link", { name: "開始自動估價" })
        .click();
      await page.getByRole("heading", { name: "上傳模型檔案" }).waitFor();
      assert.equal(
        new URLSearchParams(page.url().split("?")[1]).get("mode"),
        "estimate"
      );
      assert.match(
        await page.locator(".quote-context").innerText(),
        new RegExp(service.title)
      );
      await page.getByRole("button", { name: "上一步", exact: true }).click();
      assert.equal(
        await page.locator(".mode-card").first().getAttribute("aria-pressed"),
        "true"
      );
    }
    console.log(
      "PASS all service CTAs go to the existing automatic estimator, not agent mode"
    );
    await page.goto(base + "/#/services/industrial-parts");
    await page.locator(".preparation-checklist input").first().check();
    assert.match(
      await page.locator(".preparation-progress").innerText(),
      /1 ／ 4/
    );
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("denied");
          },
        },
      });
    });
    await page.getByRole("button", { name: "複製詢價清單" }).click();
    assert.match(
      await page.getByLabel("詢價清單文字").inputValue(),
      /已備妥：圖面/
    );
    await page
      .locator(".service-related")
      .getByRole("link", { name: "小批量製作" })
      .click();
    assert.match(
      await page.locator(".preparation-progress").innerText(),
      /0 ／ 4/
    );
    console.log(
      "PASS preparation checklist, denied-clipboard fallback and sibling-page state reset"
    );

    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto(base + "/#/services/rush-print");
    await page
      .locator(".service-hero")
      .getByRole("link", { name: "開始自動估價" })
      .click();
    const stl =
      "solid sample\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid sample";
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "sample.stl",
        mimeType: "application/octet-stream",
        buffer: Buffer.from(stl),
      });
    await page.locator(".part-row").waitFor();
    await page.locator(".part-row .el-select").click();
    await page.locator(".el-select-dropdown:visible").waitFor();
    assert.doesNotMatch(
      await page.locator(".el-select-dropdown:visible").innerText(),
      /樹脂|Resin/
    );
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    await page.getByLabel("姓名", { exact: true }).fill("介面測試");
    await page.getByLabel("案件名稱", { exact: true }).fill("急件介面回歸測試");
    assert.match(
      await page.getByLabel("備註", { exact: true }).inputValue(),
      /快速急件評估/
    );
    assert.ok(
      await page.getByRole("checkbox", { name: /需要急件評估/ }).isChecked()
    );
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      "quote settings overflow"
    );
    const estimateResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/public/cases/estimate") &&
        response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "下一步", exact: true }).click();
    const response = await estimateResponse;
    assert.equal(response.status(), 200);
    assert.equal(response.request().postDataJSON().rush, true);
    const estimate = await response.json();
    assert.equal(estimate.engine, "auto-quote");
    assert.ok(estimate.estimate.total > 0);
    await page
      .getByText(`NT$ ${estimate.estimate.total.toLocaleString()}`, {
        exact: true,
      })
      .first()
      .waitFor();
    assert.match(
      await page.locator(".estimate-card").innerText(),
      /參考件用量/
    );
    await page.screenshot({
      path: join(screenshots, "rush-auto-estimate-mobile.png"),
      fullPage: true,
    });
    let submitted = "";
    await page.route("**/api/public/cases", (route) => {
      submitted = route.request().postData();
      return route.fulfill({
        json: {
          case: {
            id: "ui-demo",
            caseNo: "UI-001",
            project: "急件介面回歸測試",
          },
          accessToken: "sample-token",
        },
      });
    });
    await page.getByRole("button", { name: "建立案件", exact: true }).click();
    await page
      .getByRole("heading", { name: "案件已建立", exact: true })
      .waitFor();
    assert.match(submitted, /"mode":"estimate"/);
    assert.match(submitted, /快速急件評估/);
    assert.match(submitted, /不代表已承諾交期/);
    console.log(
      "PASS FDM upload, real existing auto-quote engine, rush flag and mocked case handoff"
    );
    await page.goto(base + "/#/services/not-a-service");
    await page.getByRole("heading", { name: "這一頁，還沒成型。" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS unknown route fallback and no runtime exceptions\nScreenshots: ${screenshots}`
    );
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
