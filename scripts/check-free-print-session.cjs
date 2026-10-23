const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const base = process.env.BASE_URL || "http://127.0.0.1:8808";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function main() {
  const { testStl } = await import(
    pathToFileURL(resolve(__dirname, "../api/test-helpers/stl.mjs"))
  );
  const registration = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "自助列印測試",
      email: `station-browser-${Date.now()}@example.test`,
      password: "station-browser-123",
    }),
  });
  assert.equal(registration.status, 201);
  const member = await registration.json();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const output = mkdtempSync(join(tmpdir(), "3drfm-free-session-"));
  let page,
    passed = false;
  try {
    page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await page.addInitScript(
      (token) => localStorage.setItem("layerpilot-customer-token", token),
      member.token
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const preview = {
      layers: [
        {
          z: 0.2,
          segments: [
            {
              from: [125, 125, 0.2],
              to: [135, 125, 0.2],
              role: "outer",
              speed: 20,
              tool: 0,
              width: 0.42,
              height: 0.2,
            },
          ],
        },
      ],
      roles: { outer: "外壁" },
      bounds: { min: [125, 125, 0.2], max: [135, 125, 0.2] },
      segmentCount: 1,
    };
    await page.route("**/api/public/slicing-quotes**", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify(
          r.request().url().endsWith("/toolpaths")
            ? { preview }
            : {
                accessToken: "local-only",
                slicingQuote: {
                  id: "local-completed",
                  status: "completed",
                  createdAt: new Date().toISOString(),
                  estimatedMinutes: 5,
                  totalGrams: 1,
                  modelGrams: 1,
                  supportGrams: 0,
                  otherGrams: 0,
                },
              }
        ),
      })
    );
    const waitModel = async () => {
      await page.locator(".object-row").first().waitFor();
      await page.waitForFunction(
        () =>
          !document.querySelector(".studio-preparing") &&
          !!document.querySelector(".object-row")
      );
      await page.getByRole("button", { name: "移動", exact: true }).click();
      await page.getByLabel("模型位置 X", { exact: true }).waitFor();
    };
    await page.goto(base + "/#/cloud-slicer");
    await page.getByLabel("選擇 STL 模型", { exact: true }).setInputFiles({
      name: "session-model.stl",
      mimeType: "application/octet-stream",
      buffer: testStl(),
    });
    await waitModel();
    await page.getByLabel("切片填充密度", { exact: true }).fill("-1");
    assert.equal(
      await page.getByRole("button", { name: /^開始切片/ }).isDisabled(),
      true
    );
    await page.getByLabel("切片填充密度", { exact: true }).fill("15");
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page.locator(".toolpath-viewer").waitFor();
    await page.getByRole("button", { name: /返回編輯模型與參數/ }).click();
    await page
      .getByRole("button", { name: "隱藏 session-model.stl", exact: true })
      .click();
    assert.equal(
      await page.locator(".lab-result").count(),
      1,
      "visibility keeps sliced result"
    );
    await page
      .getByRole("button", { name: "顯示 session-model.stl", exact: true })
      .click();
    await page.getByLabel("切片填充密度", { exact: true }).fill("20");
    await page.waitForFunction(() => !document.querySelector(".lab-result"));
    await page
      .getByRole("button", { name: "送出代印需求 ↗", exact: true })
      .click();
    await page.locator(".quote-workbench").waitFor();
    await waitModel();
    assert.equal(
      await page.locator(".object-row").count(),
      1,
      "handoff retains source STL"
    );
    await page.getByLabel("模型位置 X", { exact: true }).fill("5");
    await page.getByLabel("模型位置 X", { exact: true }).press("Tab");
    // Incomplete layouts are still downloadable and may be saved as drafts.
    assert.equal(
      await page
        .getByRole("button", { name: "下載完整專案 ZIP", exact: true })
        .isEnabled(),
      true
    );
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("button", { name: "下載完整專案 ZIP", exact: true })
        .click(),
    ]);
    const archive = await download.path();
    page.on("dialog", (d) => d.accept());
    await page.reload();
    await page.locator(".quote-workbench").waitFor();
    await waitModel();
    assert.equal(
      await page.getByLabel("模型位置 X", { exact: true }).inputValue(),
      "5",
      "reload preserves unfinished position"
    );
    await page.getByLabel("模型位置 X", { exact: true }).fill("130");
    await page.getByLabel("模型位置 X", { exact: true }).press("Tab");
    await page
      .getByLabel("開啟完整代印專案", { exact: true })
      .setInputFiles(archive);
    await waitModel();
    await page.waitForFunction(
      () => document.querySelector('[aria-label="模型位置 X"]')?.value === "5"
    );
    await page.screenshot({
      path: join(output, "workspace-recovered.png"),
      fullPage: true,
    });
    // Real member API verifies that an unfinished layout is saved, but not submitted.
    await page
      .getByRole("button", { name: "03 登入與確認", exact: false })
      .click();
    await page
      .getByRole("button", { name: "保存雲端草稿", exact: true })
      .click();
    await page.getByText(/已保存・/).waitFor();
    const currentId = crypto.randomUUID();
    let phase = "notified",
      homed = false;
    const actions = [];
    let temperature = {
      nozzle: 25,
      bed: 25,
      status: "idle",
      position: { x: 20, y: 20, z: 20 },
      progress: 0,
    };
    const view = () => ({
      station: {
        id: "nthu-shuimu",
        name: "清華大學水木書苑",
        open: true,
        availability: "有人使用中，依序通知。",
      },
      reservations: [
        {
          id: currentId,
          status: phase,
          statusLabel: {
            notified: "輪到你了，請到站點",
            preparing: "準備列印",
            printing: "列印中",
            awaiting_removal: "列印結束，請取件",
            completed: "已完成",
          }[phase],
          estimatedMinutes: 10,
          canControl: phase !== "completed",
          leaseExpiresAt: new Date(Date.now() + 1200000).toISOString(),
          email: [{ subject: "3DRFM｜輪到你使用免費列印機", status: "sent" }],
        },
      ],
      telemetry: {
        ...temperature,
        homed,
        extrusionReady: temperature.nozzle >= 220,
        minimumExtrudeTemperature: 220,
      },
    });
    await page.route(
      "**/api/customer/workspace/free-print/**",
      async (route) => {
        if (route.request().url().endsWith("/camera-session"))
          return route.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ camera: { state: "unconfigured" } }),
          });
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON();
          if (route.request().url().endsWith("/reservations")) {
            assert.equal(body.stationId, "nthu-shuimu");
            assert.equal(body.slicingQuoteId, "local-completed");
            assert.equal(body.sliceToken, "local-only");
            return route.fulfill({
              status: 201,
              contentType: "application/json",
              body: JSON.stringify({ reservationId: currentId, ...view() }),
            });
          }
          actions.push(body);
          if (body.action === "checkin") phase = "preparing";
          if (body.action === "home") homed = true;
          if (body.action === "preheat")
            temperature = { ...temperature, nozzle: 240, bed: 75 };
          if (body.action === "start") {
            phase = "printing";
            temperature = { ...temperature, status: "printing", progress: 12 };
          }
          if (body.action === "release") phase = "completed";
        }
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify(view()),
        });
      }
    );
    await page.goto(base + "/#/free-print/nthu-shuimu/slicer");
    await page
      .getByRole("heading", { name: "水木書苑・雲端切片", exact: true })
      .waitFor();
    await page.getByLabel("選擇 STL 模型", { exact: true }).setInputFiles({
      name: "guided-station.stl",
      mimeType: "application/octet-stream",
      buffer: testStl(),
    });
    await waitModel();
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page.locator(".toolpath-viewer").waitFor();
    await page
      .getByRole("button", { name: "加入免費列印排隊", exact: true })
      .click();
    await page
      .getByRole("button", { name: "確認加入排隊", exact: true })
      .click();
    await page.waitForURL(/portal\/free-print/);
    await page
      .getByRole("button", { name: "我已到場，開始準備", exact: true })
      .click();
    await page
      .getByRole("button", { name: "機台範圍已淨空，執行歸零", exact: true })
      .click();
    await page.getByRole("button", { name: "預熱耗材", exact: true }).click();
    await page.getByRole("button", { name: "進料 10 mm", exact: true }).click();
    await page.getByRole("button", { name: "退料 10 mm", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "確認完成，開始列印", exact: true })
        .isDisabled(),
      true
    );
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      await page.screenshot({
        path: join(output, `guided-preparation-${width}.png`),
        fullPage: true,
      });
    }
    await page
      .getByRole("checkbox", {
        name: "平台上的列印件已移除，平台已清空。",
        exact: true,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: "指定耗材已就位，進料正常。",
        exact: true,
      })
      .check();
    await page
      .getByRole("checkbox", {
        name: "手、工具與雜物已離開機台移動範圍。",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "確認完成，開始列印", exact: true })
      .click();
    await page.getByRole("button", { name: "暫停列印", exact: true }).waitFor();
    phase = "awaiting_removal";
    temperature = {
      ...temperature,
      status: "idle",
      nozzle: 25,
      bed: 30,
      progress: 100,
    };
    await page.getByRole("button", { name: "更新狀態", exact: true }).click();
    await page
      .getByRole("checkbox", {
        name: "我已取走列印件，並清空平台。",
        exact: true,
      })
      .check();
    await page
      .getByRole("button", { name: "確認取件，交給下一位", exact: true })
      .click();
    await page.getByRole("heading", { name: "已完成", exact: true }).waitFor();
    assert.equal(actions.filter((a) => a.action === "start").length, 1);
    assert.equal(
      actions.some((a) => a.action === "release"),
      true
    );
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify({
        passed,
        output,
        actions: actions.map((a) => a.action),
        checks: [
          "return-to-edit",
          "hide-keeps-result",
          "parameter-validation",
          "handoff",
          "local-recovery",
          "project-ZIP",
          "unfinished-cloud-draft",
          "guided-hardware-controls",
          "320/390px",
          "removal-handoff",
        ],
      })
    );
  } finally {
    if (!passed && page)
      console.error(
        "Browser diagnostics",
        JSON.stringify({
          url: page.url(),
          alerts: await page.getByRole("alert").allTextContents(),
        })
      );
    if (!passed && page)
      await page
        .screenshot({ path: join(output, "failure.png"), fullPage: true })
        .catch(() => {});
    await browser.close();
    if (!passed) console.error("Screenshots:", output);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
