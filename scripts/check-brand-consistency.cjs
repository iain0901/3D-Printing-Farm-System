// Computed-style and responsive checks against the actual build and an isolated API.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const base = process.env.BASE_URL || "http://127.0.0.1:8803";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Isolated local server only");

async function main() {
  const signup = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "品牌驗證會員",
      email: `brand-${Date.now()}@example.test`,
      password: "brand-check-123",
      phone: "0912345678",
    }),
  });
  assert.equal(signup.status, 201);
  const { token } = await signup.json();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-brand-consistency-"));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const errors = [],
    samples = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
    const publicRoutes = [
      "/",
      "/services",
      "/for/education",
      "/for/business",
      "/for/personal",
      "/services/small-batch",
      "/materials",
      "/guides/file-prep",
      "/about",
      "/contact",
      "/privacy",
      "/terms",
      "/free-print",
      "/free-print/nthu-shuimu",
      "/portal/login",
      "/portal/register",
      "/portal/reset",
      "/quote?mode=agent",
      "/quote",
      "/404",
    ];
    const { services } = await import(
      "../frontend-vue/src/content/fdmServices.mjs"
    );
    const { publicPages } = await import(
      "../frontend-vue/src/content/publicPages.mjs"
    );
    const allRoutes = [
      ...new Set([
        ...publicRoutes,
        ...services.map((s) => "/services/" + s.id),
        ...publicPages.map((p) => p.path),
        "/401",
        "/login",
      ]),
    ];
    for (const route of allRoutes) {
      await visit(route);
      await page.locator(".public-site h1").waitFor();
      const style = await page.evaluate(() => {
        const css = (selector) =>
          getComputedStyle(document.querySelector(selector));
        const logo = css(".public-header .rfm-brand-mark strong"),
          button = css(".public-nav .studio-button");
        return {
          logo: logo.color,
          font: logo.fontFamily,
          weight: logo.fontWeight,
          dot: css(".public-header .rfm-brand-mark strong span").color,
          primary: button.backgroundColor,
          radius: button.borderRadius,
          paper: css(".public-site").backgroundColor,
          utility: css(".public-utility").backgroundColor,
          footer: css(".public-footer").backgroundColor,
          family: css(".public-site").fontFamily,
          heading: css("h1").color,
        };
      });
      assert.equal(style.logo, "rgb(25, 46, 83)", route);
      assert.equal(style.dot, "rgb(196, 67, 36)", route);
      assert.equal(style.primary, style.logo, route);
      assert.equal(style.paper, "rgb(247, 243, 233)", route);
      assert.equal(style.radius, "4px", route);
      assert.equal(style.utility, style.logo, route);
      assert.equal(style.footer, style.logo, route);
      assert.equal(style.heading, style.logo, route);
      if (samples.length)
        assert.deepEqual(
          style,
          samples[0].style,
          route + " shared chrome differs"
        );
      samples.push({ route, style });
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        );
        assert.equal(
          await page
            .locator(".public-header .rfm-brand-mark strong")
            .evaluate((el) => getComputedStyle(el).fontSize),
          width <= 600 ? "28px" : "34px",
          route + " responsive wordmark"
        );
        if (
          [
            "/",
            "/services",
            "/materials",
            "/portal/login",
            "/free-print",
            "/quote",
          ].includes(route) &&
          [1440, 390].includes(width)
        )
          await page.screenshot({
            path: join(
              screenshots,
              `${route.replace(/\W/g, "-") || "home"}-${width}.png`
            ),
            fullPage: true,
          });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.evaluate(
      (token) => localStorage.setItem("layerpilot-customer-token", token),
      token
    );
    await page.reload(); // Rehydrate Vuex auth, not just the browser storage.
    for (const route of [
      "/portal/dashboard",
      "/portal/workspace?section=models",
      "/portal/workspace?section=settings",
      "/portal/workspace?section=notifications",
      "/cloud-slicer",
      "/free-print/nthu-shuimu/slicer",
    ]) {
      await visit(route);
      await page
        .locator(
          route.startsWith("/portal/") ? ".portal-layout" : ".slicer-lab"
        )
        .waitFor();
      await page.locator(".brand-surface .rfm-brand-mark").first().waitFor();
      await page.locator("h1").first().waitFor();
      if (route.startsWith("/portal/workspace")) {
        const section = new URLSearchParams(route.split("?")[1]).get("section");
        await page.locator(".member-hub").waitFor();
        await page
          .getByRole("heading", {
            name: {
              models: "我的模型",
              settings: "帳號設定",
              notifications: "通知中心",
            }[section],
            exact: true,
          })
          .waitFor();
        await page
          .locator(".member-hub > .hub-panel[role=status]")
          .waitFor({ state: "hidden" });
      } else if (route === "/portal/dashboard") {
        await page.locator(".portal-dashboard").waitFor();
        await page.locator(".loading-panel").waitFor({ state: "hidden" });
      }
      const theme = await page.evaluate(() => {
        const surface = getComputedStyle(
          document.querySelector(".brand-surface")
        );
        const logo = getComputedStyle(
          document.querySelector(".rfm-brand-mark strong")
        );
        return {
          primary: surface.getPropertyValue("--el-color-primary").trim(),
          font: surface.fontFamily,
          logo: logo.color,
          dot: getComputedStyle(
            document.querySelector(".rfm-brand-mark strong span")
          ).color,
        };
      });
      assert.equal(theme.primary, "#192e53", route);
      assert.equal(theme.logo, samples[0].style.logo, route);
      assert.equal(theme.dot, samples[0].style.dot, route);
      assert.equal(theme.font, samples[0].style.family, route);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        );
        if ([1440, 390].includes(width))
          await page.screenshot({
            path: join(
              screenshots,
              `${route.replace(/\W/g, "-")}-${width}.png`
            ),
            fullPage: true,
          });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    await page.goto(base + "/#/cloud-slicer");
    await page.getByRole("button", { name: "模型庫", exact: true }).click();
    const dialog = page.getByRole("dialog", {
      name: "從模型庫加入",
      exact: true,
    });
    await dialog.waitFor();
    assert.equal(
      await dialog.evaluate((el) =>
        getComputedStyle(el).getPropertyValue("--el-color-primary").trim()
      ),
      "#192e53"
    );
    await page.goto(base + "/offline.html");
    await page
      .getByRole("heading", { name: "目前無法連線", exact: true })
      .waitFor();
    assert.equal(
      await page
        .locator("body")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(247, 243, 233)"
    );
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          publicPages: samples.length,
          checks: [
            "same wordmark, palette, font, primary button and shell",
            "member and slicing surfaces",
            "teleported dialog theme",
            "320/390/768/1440px without overflow",
            "offline identity",
          ],
          screenshots,
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
        .screenshot({ path: join(screenshots, "failure.png"), fullPage: true })
        .catch(() => {});
      console.error("Screenshots:", screenshots);
    }
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
