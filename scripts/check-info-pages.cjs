// Public information-page checks. No APIs are mutated by this script.
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
  const { publicPages } = await import(
    "../frontend-vue/src/content/publicPages.mjs"
  );
  const screenshots = mkdtempSync(join(tmpdir(), "farmflow-info-"));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const infoPage of publicPages) {
        await page.goto(base + "/#" + infoPage.path);
        await page.locator(".info-page h1").waitFor();
        assert.match(await page.title(), new RegExp(infoPage.title));
        assert.equal(
          await page
            .locator(".info-page h1")
            .innerText()
            .then((text) => text.replace(/\s/g, "")),
          infoPage.headline.join("").replace(/\s/g, "")
        );
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          `${infoPage.path}: overflow at ${width}`
        );
        if (
          [1440, 390].includes(width) &&
          ["materials", "contact", "privacy", "terms"].includes(infoPage.id)
        ) {
          await page.waitForTimeout(250);
          await page.screenshot({
            path: join(screenshots, `${infoPage.id}-${width}.png`),
            fullPage: true,
          });
        }
      }
      console.log(`PASS 9 public information pages at ${width}px`);
    }
    await page.goto(base + "/#/faq");
    await page.locator(".info-faq details").first().locator("summary").click();
    assert.equal(
      await page.locator(".info-faq details").first().getAttribute("open"),
      ""
    );
    await page.goto(base + "/#/contact");
    const support = page.getByRole("link", { name: /技術支援與合作/ });
    assert.equal(
      await support.getAttribute("href"),
      "mailto:support@3dstu.com"
    );
    await page
      .getByRole("link", { name: /自動估價/ })
      .first()
      .click();
    await page.getByRole("heading", { name: "你想怎麼開始？" }).waitFor();
    await page.goto(base + "/#/privacy");
    await page
      .locator(".public-footer")
      .getByRole("link", { name: "服務使用說明" })
      .click();
    await page.locator(".info-page h1").waitFor();
    assert.match(await page.title(), /服務使用說明/);
    await page.goto(base + "/#/guides/missing");
    await page.getByRole("heading", { name: "這一頁，還沒成型。" }).waitFor();
    assert.deepEqual(errors, []);
    console.log(
      `PASS FAQ, mail support, estimator CTA, policy footer and invalid route fallback\nScreenshots: ${screenshots}`
    );
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
