// Read-only browser checks for the corporate site, navigation and illustration budget.
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
  const { services, audiences } = await import(
    "../frontend-vue/src/content/fdmServices.mjs"
  );
  const { publicPages } = await import(
    "../frontend-vue/src/content/publicPages.mjs"
  );
  const { publicNavigation } = await import(
    "../frontend-vue/src/content/publicNavigation.mjs"
  );
  const { homeArtwork, routeArtwork } = await import(
    "../frontend-vue/src/content/publicArtwork.mjs"
  );
  const routes = [
    "/",
    "/services",
    ...audiences.map((a) => "/for/" + a.id),
    ...services.map((s) => "/services/" + s.id),
    ...publicPages.map((p) => p.path),
    "/quote",
    "/portal/login",
    "/portal/register",
    "/portal/reset",
    "/login",
    "/401",
    "/404",
  ];
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-brand-"));
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const images = new Map();
    for (const route of routes) {
      await page.goto(base + "/#" + route);
      await page.locator(".public-site h1").waitFor();
      assert.equal(
        await page.locator("main").count(),
        1,
        route + " must have one main landmark"
      );
      assert.equal(
        await page.locator("h1").count(),
        1,
        route + " must have one page title"
      );
      assert.doesNotMatch(
        await page.locator(".public-site").innerText(),
        /三點成型|回到工作室/
      );
      const sources = await page
        .locator(".studio-image")
        .evaluateAll(async (imgs) => {
          await Promise.all(
            imgs.map((img) => {
              img.loading = "eager";
              return img.decode();
            })
          );
          return imgs.map((img) => ({
            src: img.getAttribute("src"),
            loaded: img.naturalWidth > 0,
          }));
        });
      assert.equal(
        sources.length,
        route === "/" ? homeArtwork.length : routeArtwork[route] ? 1 : 0,
        route + " artwork placement"
      );
      for (const image of sources) {
        assert.ok(image.loaded, route + " broken image " + image.src);
        images.set(image.src, [...(images.get(image.src) || []), route]);
      }
    }
    assert.equal(images.size, 12);
    for (const [src, usages] of images)
      assert.ok(usages.length <= 2, src + " repeated on " + usages.join(", "));
    console.log(
      "PASS " +
        routes.length +
        " public routes, 12 distinct image assets used at most twice"
    );
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base + "/#/");
      await page.locator(".landing-poster h1").waitFor();
      for (const group of publicNavigation) {
        if (width <= 960)
          await page.getByRole("button", { name: "選單" }).click();
        const trigger = page.locator("#nav-" + group.id);
        await trigger.click();
        assert.equal(await trigger.getAttribute("aria-expanded"), "true");
        for (const link of group.links) {
          const item = page
            .locator("#panel-" + group.id)
            .getByRole("link", { name: link.label });
          assert.ok(await item.isVisible());
          assert.equal(await item.getAttribute("href"), "#" + link.to);
        }
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          "nav overflow " + width
        );
        await trigger.press("Escape");
        assert.equal(await trigger.getAttribute("aria-expanded"), "false");
        assert.equal(
          await page
            .locator(width <= 960 ? ".menu-toggle" : "#nav-" + group.id)
            .evaluate((el) => document.activeElement === el),
          true
        );
      }
      if (width <= 960)
        await page.getByRole("button", { name: "選單" }).click();
      await page.locator("#nav-resources").click();
      await page
        .locator("#panel-resources")
        .getByRole("link", { name: "材料指南" })
        .click();
      await page.locator(".info-page h1").waitFor();
      assert.equal(
        await page.locator("#nav-resources").getAttribute("aria-expanded"),
        "false"
      );
      assert.equal(
        await page.locator(".menu-toggle").getAttribute("aria-expanded"),
        "false"
      );
      assert.match(
        await page.locator("tr.recommended").innerText(),
        /PETG.*最推薦/s
      );
      assert.equal(await page.locator(".info-comparison tbody tr").count(), 6);
      // Choosing the current page must close the disclosure as well (no route change).
      if (width <= 960)
        await page.getByRole("button", { name: "選單" }).click();
      await page.locator("#nav-resources").click();
      await page
        .locator("#panel-resources")
        .getByRole("link", { name: "材料指南" })
        .click();
      assert.equal(
        await page.locator("#nav-resources").getAttribute("aria-expanded"),
        "false"
      );
      assert.equal(
        await page.locator(".menu-toggle").getAttribute("aria-expanded"),
        "false"
      );
      for (const route of [
        "/",
        "/services",
        "/for/business",
        "/about",
        "/materials",
        "/portal/login",
      ]) {
        await page.goto(base + "/#" + route);
        await page.locator(".public-site h1").waitFor();
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          route + " overflow " + width
        );
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: join(screenshots, route.replace(/\//g, "-") + width + ".png"),
            fullPage: true,
          });
      }
      console.log(
        "PASS corporate navigation, Escape/focus, route closing and layout at " +
          width +
          "px"
      );
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/#/");
    await page.locator("#nav-services").click();
    await page.locator(".poster-footnote").click();
    assert.equal(
      await page.locator("#nav-services").getAttribute("aria-expanded"),
      "false"
    );
    assert.equal(
      await page
        .getByRole("button", { name: "PETG", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    assert.deepEqual(errors, []);
    console.log("PASS no browser errors; screenshots: " + screenshots);
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
