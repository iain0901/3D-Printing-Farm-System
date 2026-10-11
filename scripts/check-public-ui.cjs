// Browser regression checks for the public Vue UI. All case and auth mutations are intercepted.
// Requires Playwright and Chromium; see docs/public-ui-redesign.md.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const base = (process.env.BASE_URL || "http://127.0.0.1:8797").replace(
  /\/$/,
  ""
);
const screenshots = mkdtempSync(join(tmpdir(), "farmflow-public-ui-"));
async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/#/");
    await page.locator(".landing-poster h1").waitFor();
    await page.waitForTimeout(400);
    await page.screenshot({
      path: join(screenshots, "farmflow-home-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "PETG", exact: true }).click();
    assert.match(
      await page.locator(".material-details").innerText(),
      /多一點韌性/
    );
    await page.getByRole("button", { name: "TPU", exact: true }).click();
    assert.match(await page.locator(".material-details").innerText(), /彈性/);
    await page.locator(".faq-list summary").first().click();
    assert.equal(
      await page.locator(".faq-list details").first().getAttribute("open"),
      ""
    );
    await page
      .locator(".poster-actions")
      .getByRole("link", { name: "先看看能做什麼" })
      .click();
    await page.waitForFunction(
      () =>
        location.hash.endsWith("#services") &&
        Math.abs(
          document.querySelector("#services").getBoundingClientRect().top - 24
        ) < 5
    );
    console.log("PASS materials, FAQ and hash-router section navigation");
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of [
        "/",
        "/quote",
        "/portal/login",
        "/portal/register",
        "/portal/reset",
        "/portal/reset?resetToken=sample",
        "/login",
        "/404",
        "/401",
      ]) {
        await page.goto(base + "/#" + route);
        await page.locator(".public-site h1").waitFor();
        await page.waitForTimeout(350);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          ),
          `overflow at ${width}: ${route}`
        );
        if (width === 390 && route === "/")
          await page.screenshot({
            path: join(screenshots, "farmflow-home-mobile.png"),
            fullPage: true,
          });
        if (width === 1440 && route === "/portal/login")
          await page.screenshot({
            path: join(screenshots, "farmflow-login-desktop.png"),
            fullPage: true,
          });
        if (width === 390 && route === "/portal/register")
          await page.screenshot({
            path: join(screenshots, "farmflow-register-mobile.png"),
            fullPage: true,
          });
        if (width === 1440 && route === "/quote")
          await page.screenshot({
            path: join(screenshots, "farmflow-quote-desktop.png"),
            fullPage: true,
          });
      }
      console.log(
        `PASS public routes without horizontal overflow at ${width}px`
      );
    }
    await page.goto(base + "/#/portal/login");
    await page.getByRole("button", { name: "選單" }).click();
    await page.getByRole("button", { name: "技術資源" }).click();
    await page
      .locator(".public-nav")
      .getByRole("link", { name: "材料指南" })
      .click();
    await page.locator(".info-page h1").waitFor();
    assert.match(await page.title(), /FDM 材料指南/);
    assert.equal(
      await page
        .getByRole("button", { name: "選單" })
        .getAttribute("aria-expanded"),
      "false"
    );
    console.log("PASS mobile menu and materials guide route");
    await page.goto(base + "/#/quote?mode=agent&model=no");
    assert.equal(
      await page.locator(".mode-card").nth(1).getAttribute("aria-pressed"),
      "true"
    );
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("heading", { name: "告訴我們你想製作什麼" }).waitFor();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByText("請填寫用途或建模需求。", { exact: true }).waitFor();
    await page
      .locator(".step-content:visible textarea")
      .first()
      .fill("測試用桌面收納盒，僅驗證介面，不送到真實案件。");
    await page.getByRole("button", { name: "下一步" }).click();
    await page.route("**/api/customer-auth/register", (route) =>
      route.fulfill({
        status: 201,
        json: {
          token: "member-token",
          customer: {
            id: "cus-ui",
            name: "介面測試",
            email: "ui@example.com",
            phone: "",
            company: "",
          },
        },
      })
    );
    await page.getByRole("tab", { name: "建立帳號" }).click();
    await page.getByLabel("姓名", { exact: true }).fill("介面測試");
    await page.getByLabel("電子郵件", { exact: true }).fill("ui@example.com");
    await page.getByLabel("設定密碼", { exact: true }).fill("ui-test-password");
    await page.getByRole("button", { name: "建立帳號並帶入資料 ↗" }).click();
    await page.getByText("案件名稱將自動產生", { exact: true }).waitFor();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.route("**/api/public/cases/estimate", (route) =>
      route.fulfill({ json: { estimate: { total: 350, lines: [] } } })
    );
    await page.getByRole("button", { name: "下一步" }).click();
    await page.getByText("NT$ 350", { exact: true }).waitFor();
    let submitted;
    await page.route("**/api/public/cases", (route) => {
      submitted = route.request().postDataJSON();
      return route.fulfill({
        json: {
          case: {
            id: "ui-case",
            caseNo: "UI-001",
            project: "20261012・介面測試・需求001",
          },
          accessToken: "sample-token",
        },
      });
    });
    await page.getByRole("button", { name: "建立案件", exact: true }).click();
    await page
      .getByRole("heading", { name: "案件已建立", exact: true })
      .waitFor();
    assert.equal(submitted.mode, "agent");
    assert.equal(submitted.hasModel, false);
    assert.equal(submitted.customer.name, "介面測試");
    const caseUrl = await page.locator(".success-dialog input").inputValue();
    assert.equal(
      caseUrl,
      base + "/#/customer/cases/ui-case?token=sample-token"
    );
    await page.route("**/api/public/cases/ui-case?*", (route) =>
      route.fulfill({
        json: {
          case: {
            id: "ui-case",
            caseNo: "UI-001",
            project: "20261012・介面測試・需求001",
            status: "new",
            paymentStatus: "unpaid",
            parts: [],
          },
        },
      })
    );
    await page.goto(caseUrl);
    await page
      .getByRole("heading", { name: "20261012・介面測試・需求001" })
      .waitFor();
    console.log(
      "PASS quote validation, preselected service, estimate, submission and share link (mock API)"
    );
    await page.goto(base + "/#/portal/login");
    await page.getByRole("button", { name: "登入會員中心" }).click();
    await page.getByText("請輸入電子郵件與密碼", { exact: true }).waitFor();
    let loginPayload;
    await page.route("**/api/customer-auth/login", (route) => {
      loginPayload = route.request().postDataJSON();
      return route.fulfill({
        status: 401,
        json: { error: "電子郵件或密碼不正確" },
      });
    });
    await page.getByLabel("電子郵件", { exact: true }).fill("ui@example.com");
    await page.getByLabel("密碼", { exact: true }).fill("test-password");
    await page.getByLabel("密碼", { exact: true }).press("Enter");
    await page.getByText("電子郵件或密碼不正確", { exact: true }).waitFor();
    assert.deepEqual(loginPayload, {
      email: "ui@example.com",
      password: "test-password",
    });
    assert.equal(
      await page.getByRole("button", { name: "登入會員中心" }).isEnabled(),
      true
    );
    await page.goto(base + "/#/portal/register");
    await page.getByRole("button", { name: "建立我的帳號" }).click();
    await page
      .getByText("請填寫姓名、電子郵件，密碼至少 8 碼", { exact: true })
      .waitFor();
    let registerPayload;
    await page.route("**/api/customer-auth/register", (route) => {
      registerPayload = route.request().postDataJSON();
      return route.fulfill({
        status: 409,
        json: { error: "此電子郵件已註冊" },
      });
    });
    await page.getByLabel("姓名", { exact: true }).fill("介面測試");
    await page.getByLabel("電子郵件", { exact: true }).fill("ui@example.com");
    await page.getByLabel("密碼", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "建立我的帳號" }).click();
    await page.getByText("此電子郵件已註冊", { exact: true }).waitFor();
    assert.equal(registerPayload.name, "介面測試");
    assert.equal(
      await page.getByLabel("電子郵件", { exact: true }).inputValue(),
      "ui@example.com"
    );
    await page.goto(base + "/#/portal/reset");
    let resetPayload;
    await page.route("**/api/customer-auth/request-reset", (route) => {
      resetPayload = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    });
    await page.getByLabel("電子郵件", { exact: true }).fill("ui@example.com");
    await page.getByRole("button", { name: "寄送重設連結" }).click();
    await page
      .getByText("若該電子郵件已註冊，重設連結已寄出", { exact: true })
      .waitFor();
    assert.deepEqual(resetPayload, { email: "ui@example.com" });
    await page.goto(base + "/#/portal/reset?resetToken=sample");
    await page.route("**/api/customer-auth/reset", (route) => {
      resetPayload = route.request().postDataJSON();
      return route.fulfill({ json: { ok: true } });
    });
    await page.getByLabel("新密碼", { exact: true }).fill("changed-password");
    await page.getByRole("button", { name: "確認重設密碼" }).click();
    await page.waitForURL("**/#/portal/login");
    assert.deepEqual(resetPayload, {
      token: "sample",
      password: "changed-password",
    });
    await page.goto(base + "/#/login");
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        status: 409,
        json: { error: "請輸入驗證碼", requiresTwoFactor: true },
      })
    );
    await page
      .getByLabel("電子郵件", { exact: true })
      .fill("staff@example.com");
    await page.getByLabel("密碼", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "登入管理系統" }).click();
    await page.getByLabel("兩步驗證碼或復原碼", { exact: true }).waitFor();
    await page.getByLabel("兩步驗證碼或復原碼", { exact: true }).fill("123456");
    let staffPayload;
    await page.route("**/api/auth/login", (route) => {
      staffPayload = route.request().postDataJSON();
      return route.fulfill({ status: 401, json: { error: "驗證碼不正確" } });
    });
    await page.getByRole("button", { name: "驗證並登入" }).click();
    await page.getByText("驗證碼不正確", { exact: true }).waitFor();
    assert.equal(staffPayload.twoFactorCode, "123456");
    console.log(
      "PASS auth validation, Enter submit, error recovery, reset and staff 2FA (mock API)"
    );
    assert.deepEqual(errors, []);
    console.log("PASS no browser runtime exceptions");
    console.log(`Screenshots: ${screenshots}`);
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exit(1);
});
