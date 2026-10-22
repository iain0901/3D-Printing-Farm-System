// Local-only browser regression checks. All customer data and writes are mocked.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const base = process.env.BASE_URL || "http://127.0.0.1:8799";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Only an isolated local server is allowed.");

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-members-"));
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    const errors = [],
      writes = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let empty = false,
      fail = false,
      slow = false,
      unauthorized = false;
    const cases = [
      {
        id: "case-1",
        caseNo: "RFM-20261022-001",
        project: "實驗室感測器外殼・第二版",
        status: "formal_quote_sent",
        parts: [{ name: "外殼" }, { name: "上蓋" }],
        quote: { total: 1280 },
      },
      {
        id: "case-2",
        caseNo: "RFM-20261021-002",
        project: "展覽模型・結構支架",
        status: "printing",
        parts: [{ name: "支架" }],
        quote: { total: 3600 },
      },
      {
        id: "case-3",
        caseNo: "RFM-20261018-003",
        project: "校園紀念品・測試樣品",
        status: "completed",
        parts: [{ name: "紀念品" }],
        quote: { total: 540 },
      },
    ];
    const quote = {
      id: "quote-1",
      project: "工作桌收納配件",
      material: "PETG",
      quantity: 3,
      quotedValue: 890,
      status: "quoted",
      confirmations: [
        {
          id: "detail-1",
          label: "表面紋理",
          value: "保留 FDM 層紋",
          status: "pending",
        },
      ],
      messages: [
        {
          id: "m1",
          author: "staff",
          authorName: "3DRFM 製作專員",
          body: "已收到模型，請確認表面紋理與報價。",
        },
      ],
    };
    const order = {
      id: "RFM-ORDER-003",
      status: "shipped",
      value: 540,
      due: "2026-10-25",
      payment: { status: "paid" },
    };
    let addresses = [
      {
        id: "address-1",
        label: "實驗室",
        recipient: "林同學",
        phone: "0912345678",
        line1: "光復路二段 101 號",
        line2: "工程館",
        city: "新竹市",
        postalCode: "300",
        isDefault: true,
      },
    ];
    await page.addInitScript(() =>
      localStorage.setItem("layerpilot-customer-token", "local-member-ui-test")
    );
    await page.route("**/api/customer**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname;
      assert.equal(req.headers().authorization, "Bearer local-member-ui-test");
      const reply = (data, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(data),
        });
      if (unauthorized) return reply({ error: "登入已失效" }, 401);
      if (slow) await new Promise((resolve) => setTimeout(resolve, 500));
      if (fail && path.endsWith("/cases"))
        return reply({ error: "暫時無法取得資料" }, 503);
      if (req.method() !== "GET")
        writes.push({ path, body: req.postDataJSON() });
      if (path.endsWith("/me"))
        return reply({
          customer: { id: "member-1", name: "林同學", loyaltyPoints: 260 },
        });
      if (path.endsWith("/logout")) return reply({ ok: true });
      if (path.endsWith("/cases")) return reply({ cases: empty ? [] : cases });
      if (path.endsWith("/cases/case-1/decision")) {
        cases[0].status = "accepted";
        return reply({ case: cases[0] });
      }
      if (path.endsWith("/quotes")) return reply(empty ? [] : [quote]);
      if (path.endsWith("/quotes/quote-1/decision")) {
        quote.status = "reviewing";
        return reply({ quoteRequest: quote });
      }
      if (path.endsWith("/confirmations/detail-1")) {
        quote.confirmations[0].status = "confirmed";
        return reply({ quoteRequest: quote });
      }
      if (path.endsWith("/messages")) {
        quote.messages.push({
          id: "m2",
          author: "customer",
          authorName: "林同學",
          body: req.postDataJSON().body,
        });
        return reply({ quoteRequest: quote });
      }
      if (path.endsWith("/orders")) return reply(empty ? [] : [order]);
      if (path.endsWith("/tracking"))
        return reply({ carrier: "宅配", trackingNumber: "TEST-123456" });
      if (path.endsWith("/payment-methods"))
        return reply({
          methods: [{ id: "linepay", name: "LINE Pay", configured: false }],
        });
      if (path.endsWith("/apply-coupon"))
        return reply({
          order: { ...order, discount: 50, value: 490 },
          discount: 50,
        });
      if (path.endsWith("/redeem-points"))
        return reply({ order: { ...order, value: 530 }, remainingPoints: 160 });
      if (path.endsWith("/reorder"))
        return reply({ ...order, id: "RFM-ORDER-004", status: "received" });
      if (path.endsWith("/addresses") && req.method() === "POST") {
        const a = { ...req.postDataJSON(), id: "address-2" };
        addresses.push(a);
        return reply(a);
      }
      if (path.endsWith("/addresses")) return reply(empty ? [] : addresses);
      if (path.endsWith("/addresses/address-1") && req.method() === "PATCH") {
        addresses[0] = { ...req.postDataJSON(), id: "address-1" };
        return reply(addresses[0]);
      }
      if (path.endsWith("/addresses/address-1") && req.method() === "DELETE") {
        addresses = addresses.filter((a) => a.id !== "address-1");
        return reply({ ok: true });
      }
      throw new Error(
        "Unhandled customer request: " + req.method() + " " + path
      );
    });
    const nav = (label) =>
      page
        .getByRole("navigation", { name: "會員導覽" })
        .getByRole("link", { name: label });
    const settle = () => page.locator(".member-panels").waitFor();
    const screenshot = async (name) => {
      await page.locator("#nprogress").waitFor({ state: "hidden" });
      await page.screenshot({ path: join(screenshots, name), fullPage: true });
    };
    const noOverflow = async () =>
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1
        ),
        "horizontal overflow"
      );
    await page.goto(base + "/#/portal/dashboard");
    await settle();
    await page.getByRole("heading", { name: /你好，林同學\s*。/ }).waitFor();
    assert.equal(await page.locator("main").count(), 1);
    assert.deepEqual(
      (await page.locator(".member-summary strong").allTextContents()).map(
        (text) => text.replace(/\s/g, "")
      ),
      ["2件", "2件", "1件", "260點"]
    );
    await screenshot("cases-desktop.png");
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      for (const label of [
        "列印案件",
        "報價與訊息",
        "訂單與配送",
        "收件地址",
      ]) {
        await nav(label).click();
        await page
          .locator(".section-heading h2")
          .filter({ hasText: label })
          .waitFor();
        await noOverflow();
        if ([1440, 390].includes(width))
          await screenshot(`${label}-${width}.png`);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await nav("列印案件").click();
    await page.getByRole("button", { name: "接受報價", exact: true }).click();
    await page.getByText("已接受報價", { exact: true }).waitFor();
    await nav("報價與訊息").click();
    await page.getByRole("button", { name: "確認無誤" }).click();
    await page.getByText("已確認", { exact: true }).waitFor();
    await page.getByPlaceholder("輸入訊息…").fill("收到，請協助確認交期。");
    await page.getByRole("button", { name: "送出", exact: true }).click();
    await page
      .locator(".message.customer")
      .filter({ hasText: "收到，請協助確認交期。" })
      .waitFor();
    await page.getByRole("button", { name: "要求修改", exact: true }).click();
    await page.getByText("專員確認中", { exact: true }).waitFor();
    await nav("訂單與配送").click();
    await page.getByRole("button", { name: "查詢物流" }).click();
    await page.getByText(/TEST-123456/).waitFor();
    await page.getByRole("button", { name: "結帳", exact: true }).click();
    const checkout = page.getByRole("dialog", { name: "結帳", exact: true });
    await checkout.waitFor();
    assert.equal(await checkout.getByRole("radio").isDisabled(), true);
    assert.equal(
      await checkout
        .getByRole("button", { name: "確認", exact: true })
        .isDisabled(),
      true
    );
    await noOverflow();
    await checkout.getByRole("button", { name: "取消", exact: true }).click();
    await nav("收件地址").click();
    await page.getByRole("button", { name: "編輯", exact: true }).click();
    const address = page.getByRole("dialog", { name: "編輯地址" });
    await address.waitFor();
    await address.locator("input").first().fill("學校實驗室");
    await noOverflow();
    await address.getByRole("button", { name: "儲存" }).click();
    await page.getByText("學校實驗室", { exact: true }).waitFor();
    await page.reload();
    await settle();
    assert.match(page.url(), /tab=addresses/);
    await page.goBack();
    await settle();
    fail = true;
    await page.getByRole("button", { name: "重新整理" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "暫時無法載入會員資料" })
      .waitFor();
    assert.equal(await page.locator(".empty-hint:visible").count(), 0);
    fail = false;
    slow = true;
    await page.getByRole("button", { name: "重新載入", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "正在整理" }).waitFor();
    await settle();
    slow = false;
    empty = true;
    await page.getByRole("button", { name: "重新整理" }).click();
    await settle();
    for (const label of ["列印案件", "報價與訊息", "訂單與配送", "收件地址"]) {
      await nav(label).click();
      await page.locator(".empty-hint:visible").waitFor();
      await noOverflow();
    }
    await nav("列印案件").click();
    await screenshot("empty-mobile.png");
    await page.getByRole("link", { name: "上傳模型並估價" }).click();
    await page.waitForURL("**/#/quote");
    await page.goto(base + "/#/portal/dashboard?tab=unknown");
    await settle();
    await page
      .locator(".section-heading h2")
      .filter({ hasText: "列印案件" })
      .waitFor();
    await page.getByRole("button", { name: "登出", exact: true }).click();
    await page.waitForURL("**/portal/login");
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("layerpilot-customer-token")
      ),
      null
    );
    await page.goto(base + "/#/portal/dashboard");
    await page.waitForURL("**/portal/login");
    unauthorized = true;
    await page.reload();
    await page.goto(base + "/#/portal/dashboard");
    await page.waitForURL("**/portal/login");
    assert.deepEqual(errors, []);
    assert.ok(writes.some((w) => w.path.endsWith("/decision")));
    assert.ok(writes.some((w) => w.path.endsWith("/messages")));
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          widths: [320, 390, 768, 1024, 1440],
          sections: 4,
          checks:
            "navigation, refresh, history, status, decisions, confirmations, messages, tracking, checkout, address editing, loading, errors, empty states, logout, 401",
          screenshots,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
