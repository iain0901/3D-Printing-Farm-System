// Read-only browser checks. No free print order or printer command is submitted.
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
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-free-print-"));
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const errors = [];
    const mutations = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (
        request.method() !== "GET" &&
        /\/api\/(public\/(cases|slicing-quotes|quoteRequests)|printers|internal\/orca)/.test(
          request.url()
        )
      )
        mutations.push(request.url());
    });

    await page.goto(base + "/#/");
    await page.getByRole("link", { name: "選擇免費列印站點" }).click();
    await page.waitForURL("**/#/free-print");
    assert.equal(await page.locator(".free-station-card").count(), 1);
    assert.equal(
      await page.locator(".free-station-card h3").innerText(),
      "水木書苑"
    );
    const select = page.getByRole("link", {
      name: "選擇國立清華大學・水木書苑站點",
    });
    await select.focus();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/#/free-print/nthu-shuimu");
    assert.equal(await page.locator("h1").innerText(), "水木書苑");
    assert.match(
      await page.locator(".free-notice").innerText(),
      /線上送印準備中/
    );
    assert.match(await page.title(), /水木書苑/);
    await page.reload();
    await page.getByRole("heading", { level: 1, name: "水木書苑" }).waitFor();
    await page.getByRole("link", { name: "重新選擇站點" }).click();
    await page.waitForURL("**/#/free-print");
    console.log(
      "PASS anonymous station selection, keyboard activation, deep link, refresh and change station"
    );

    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of ["/free-print", "/free-print/nthu-shuimu"]) {
        await page.goto(base + "/#" + route);
        await page.locator(".free-print-site h1").waitFor();
        assert.equal(await page.locator("h1").count(), 1);
        assert.equal(await page.locator("main").count(), 1);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          `overflow at ${width}: ${route}`
        );
        assert.equal(await page.locator(".studio-image").count(), 0);
        const faq = page.getByText("選擇站點後，就已經排到列印了嗎？", {
          exact: true,
        });
        const wasOpen = await faq.evaluate((el) => el.parentElement.open);
        await faq.click();
        assert.equal(
          await faq.evaluate((el) => el.parentElement.open),
          !wasOpen
        );
        await page.locator("#nprogress").waitFor({ state: "detached" });
        if ([1440, 390].includes(width)) {
          await page.evaluate(() => {
            document.activeElement?.blur();
            scrollTo(0, 0);
          });
          await page.screenshot({
            path: join(
              screenshots,
              `${
                route.endsWith("shuimu") ? "station" : "directory"
              }-${width}.png`
            ),
            fullPage: true,
          });
        }
      }
      if (width <= 768)
        await page.getByRole("button", { name: "選單" }).click();
      await page.getByRole("button", { name: "製作服務" }).click();
      await page
        .locator("#public-nav")
        .getByRole("link", { name: "免費列印", exact: false })
        .click();
      await page.waitForURL("**/#/free-print");
      assert.equal(
        await page.locator("#nav-services").getAttribute("aria-expanded"),
        "false"
      );
      console.log(`PASS free pages, FAQ, navigation and layout at ${width}px`);
    }
    for (const path of [
      "/free-print/unknown",
      "/free-print/nthu-shuimu/invalid",
    ]) {
      await page.goto(base + "/#/free-print/nthu-shuimu");
      await page.locator(".free-notice").waitFor();
      await page.evaluate((path) => {
        location.hash = path;
      }, path);
      await page.waitForURL("**/#/404");
      await page.locator("h1").waitFor();
    }
    await page.goto(base + "/#/free-print/nthu-shuimu");
    await page.getByRole("link", { name: "前往付費代印估價" }).click();
    await page.waitForURL("**/#/quote");
    assert.deepEqual(mutations, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS invalid stations, explicit paid-service link and no print mutations or browser errors"
    );
    console.log("Screenshots: " + screenshots);
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
