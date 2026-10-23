// Real local API + built frontend. Never runs against a deployed service.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const base = process.env.BASE_URL || "http://127.0.0.1:8801";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function run() {
  const three = resolve(__dirname, "../frontend-vue/node_modules/three");
  const { BoxGeometry, Mesh } = await import(
    pathToFileURL(join(three, "build/three.module.js"))
  );
  const { STLExporter } = await import(
    pathToFileURL(join(three, "examples/jsm/exporters/STLExporter.js"))
  );
  const cube = new BoxGeometry(20, 30, 40),
    bytes = Buffer.from(
      new STLExporter().parse(new Mesh(cube), { binary: true }).buffer
    );
  cube.dispose();
  const email = `member-browser-${Date.now()}@example.test`;
  const registration = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "測試會員",
      email,
      password: "browser-member-123",
      phone: "0912345678",
    }),
  });
  assert.equal(registration.status, 201);
  const member = await registration.json();
  async function api(path, method = "GET", data) {
    const response = await fetch(base + "/api/customer/workspace" + path, {
      method,
      headers: {
        authorization: `Bearer ${member.token}`,
        "content-type": "application/json",
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    const body = await response.json();
    assert.ok(response.ok, JSON.stringify(body));
    return body;
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const screenshots = mkdtempSync(join(tmpdir(), "3drfm-member-workspace-"));
  let passed = false;
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: "reduce",
    });
    await page.addInitScript(
      (token) =>
        window.localStorage.setItem("layerpilot-customer-token", token),
      member.token
    );
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const goto = async (section) => {
      await page.goto(`${base}/#/portal/workspace?section=${section}`);
      await page.locator(".member-hub .hub-panel").first().waitFor();
      await page
        .locator(".member-hub > div.hub-panel[role=status]")
        .waitFor({ state: "hidden" });
    };
    await goto("models");
    await page.locator(".upload-button input").setInputFiles({
      name: "測試外殼.stl",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
    await page
      .getByRole("heading", { name: "測試外殼.stl", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "3D 預覽", exact: true }).click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".preview-panel canvas")?.dataset
            .renderedTriangles
        ) > 0
    );
    await page.getByRole("button", { name: "收藏", exact: true }).click();
    await page.getByRole("button", { name: "取消收藏", exact: true }).waitFor();
    await page.screenshot({
      path: join(screenshots, "models-desktop.png"),
      fullPage: true,
    });
    await goto("projects");
    await page.getByLabel("專案名稱", { exact: true }).fill("機械系專題");
    await page.locator(".form-grid select").selectOption("school");
    await page.getByRole("button", { name: "建立專案", exact: true }).click();
    await page
      .getByRole("heading", { name: "機械系專題", exact: true })
      .waitFor();
    // The standalone slicer reuses the protected member model library and cloud drafts.
    await page.goto(base + "/#/cloud-slicer");
    await page.getByRole("button", { name: "模型庫", exact: true }).click();
    await page
      .locator(".library-row")
      .filter({ hasText: "測試外殼.stl" })
      .getByRole("button", { name: "加入平台", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".stage-canvas canvas")?.dataset
            .renderedTriangles
        ) === 12
    );
    await page.getByRole("button", { name: "縮放", exact: true }).click();
    await page.getByLabel("等比例縮放", { exact: true }).uncheck();
    await page.getByLabel("模型非等比縮放 X", { exact: true }).fill("125");
    await page.getByLabel("模型非等比縮放 X", { exact: true }).press("Tab");
    await page.getByRole("button", { name: "鏡像 X", exact: true }).click();
    await page.getByRole("button", { name: "雲端保存", exact: true }).click();
    const cloudDialog = page.getByRole("dialog", {
      name: "保存到會員雲端草稿",
      exact: true,
    });
    await cloudDialog
      .getByLabel("草稿名稱", { exact: true })
      .fill("切片工作區跨裝置測試");
    await cloudDialog
      .getByRole("button", { name: "保存雲端草稿", exact: true })
      .click();
    await cloudDialog
      .getByText("已保存到會員雲端草稿，可跨裝置繼續編輯。", { exact: true })
      .waitFor();
    const studioDraft = (await api("")).drafts.find(
      (d) => d.name === "切片工作區跨裝置測試"
    );
    assert.ok(studioDraft);
    const studioSaved = (await api("/drafts/" + studioDraft.id)).draft.manifest;
    assert.equal(studioSaved.models[0].sourceTransform.scaleX, 125);
    assert.equal(studioSaved.models[0].sourceTransform.mirrorX, true);
    await cloudDialog
      .getByRole("link", { name: "繼續配色或送出代印需求", exact: false })
      .click();
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".stage-canvas canvas")?.dataset
            .renderedTriangles
        ) === 12
    );
    await page.getByRole("button", { name: "縮放", exact: true }).click();
    await page.getByLabel("等比例縮放", { exact: true }).uncheck();
    assert.equal(
      await page.getByLabel("模型非等比縮放 X", { exact: true }).inputValue(),
      "125"
    );
    assert.equal(
      await page
        .getByRole("button", { name: "鏡像 X", exact: true })
        .getAttribute("aria-pressed"),
      "true"
    );
    await page.goto(base + "/#/");
    await page.locator(".brand-home h1").waitFor(); // Let the SPA actually unmount the previous draft before opening a fresh workspace.
    await page.goto(base + "/#/quote?new=1");
    await page.getByLabel("選擇 STL 模型").setInputFiles({
      name: "cloud-paint.stl",
      mimeType: "application/octet-stream",
      buffer: bytes,
    });
    const ready = () =>
      page.waitForFunction(
        () =>
          !!document.querySelector(".primary-button") &&
          !document.querySelector(".primary-button").disabled
      );
    await ready();
    assert.equal(
      await page.locator(".object-row").count(),
      1,
      "a fresh workbench must not reuse the previous cloud draft"
    );
    await page.getByRole("button", { name: "縮放", exact: true }).click();
    await page.getByLabel("模型等比縮放", { exact: true }).fill("110");
    await page.getByLabel("模型等比縮放", { exact: true }).press("Tab");
    await ready();
    await page.getByRole("radio", { name: "多色列印", exact: true }).check();
    await page.getByLabel("筆刷色槽", { exact: true }).selectOption("slot-2");
    await page.getByRole("button", { name: "筆刷上色", exact: true }).click();
    await page.getByLabel("筆刷半徑（mm）").fill("1");
    await page
      .locator(".stage-message")
      .filter({ hasText: "正在準備" })
      .waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "聚焦選取", exact: true }).click();
    const canvas = page.locator(".stage-canvas canvas");
    await canvas.scrollIntoViewIfNeeded();
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(() =>
      document
        .querySelector(".surface-tools [role=status]")
        ?.textContent.includes("已塗色 1／")
    );
    await page.getByRole("button", { name: "確認設定，帶入會員資料" }).click();
    await page.getByText("已登入會員", { exact: true }).waitFor();
    await page.getByLabel("草稿名稱", { exact: true }).fill("雲端上色還原測試");
    const project = (await api("")).projects.find(
      (p) => p.name === "機械系專題"
    );
    await page.getByLabel("所屬專案", { exact: true }).selectOption(project.id);
    await page
      .getByRole("button", { name: "保存雲端草稿", exact: true })
      .click();
    await page
      .locator(".cloud-draft-panel [role=status]")
      .filter({ hasText: "已保存" })
      .waitFor();
    let state = await api("");
    const draft = state.drafts.find((d) => d.name === "雲端上色還原測試");
    assert.ok(draft);
    const before = (await api("/drafts/" + draft.id)).draft;
    assert.equal(before.manifest.models[0].surfacePaint.faces.length, 1);
    await page.goto(base + "/#/quote?draft=" + draft.id);
    await ready();
    await page.waitForFunction(() =>
      document
        .querySelector(".surface-tools [role=status]")
        ?.textContent.includes("已塗色 1／")
    );
    await page.getByRole("button", { name: "縮放", exact: true }).click();
    assert.equal(
      await page.getByLabel("模型等比縮放", { exact: true }).inputValue(),
      "110"
    );
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "下載設定草稿（JSON）" }).click();
    const after = JSON.parse(
      readFileSync(await (await downloaded).path(), "utf8")
    );
    assert.deepEqual(
      after.models[0].surfacePaint,
      before.manifest.models[0].surfacePaint
    );
    assert.deepEqual(
      after.models[0].sourceTransform,
      before.manifest.models[0].sourceTransform
    );
    const count = state.models.length;
    await page.getByLabel("自動保存後續修改", { exact: false }).check();
    const saved = page.waitForResponse(
      (r) =>
        r.url().endsWith("/drafts/" + draft.id) &&
        r.request().method() === "PUT" &&
        r.status() === 200
    );
    await page.getByLabel("製作備註", { exact: true }).fill("跨裝置保存成功");
    await saved;
    assert.equal(
      (await api("")).models.length,
      count,
      "settings-only autosave must not consume another model version"
    );
    await page
      .getByLabel("我已確認材料、尺寸與配色；", { exact: false })
      .check();
    await page
      .getByRole("button", { name: "送交專員確認報價", exact: true })
      .click();
    await page
      .getByRole("link", { name: "查看已送出的案件", exact: false })
      .waitFor();
    await page
      .getByRole("link", { name: "查看已送出的案件", exact: false })
      .click();
    await page
      .getByRole("heading", { name: "和專員討論", exact: true })
      .waitFor();
    await page
      .getByLabel("給專員的訊息", { exact: true })
      .fill("請協助確認薄壁與支撐");
    await page.getByRole("button", { name: "送出訊息", exact: true }).click();
    await page.getByText("請協助確認薄壁與支撐", { exact: true }).waitFor();
    const caseId = new URLSearchParams(page.url().split("?")[1]).get("id");
    assert.ok(caseId);
    await page.screenshot({
      path: join(screenshots, "case-desktop.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "申請取消／售後", exact: true })
      .click();
    await page.getByLabel("問題說明", { exact: true }).fill("希望確認表面處理");
    await page.getByRole("button", { name: "提交申請", exact: true }).click();
    await page.getByText("希望確認表面處理", { exact: true }).waitFor();
    await goto("settings");
    await page.getByLabel("學校", { exact: true }).fill("國立清華大學");
    await page.getByLabel("系所／實驗室", { exact: true }).fill("機械系");
    await page
      .getByRole("button", { name: "儲存會員資料", exact: true })
      .click();
    await page
      .locator(".hub-notice")
      .filter({ hasText: "會員資料已更新" })
      .waitFor();
    await page.reload();
    await page.waitForFunction(() => document.querySelector("input[readonly]"));
    assert.equal(
      await page.getByLabel("學校", { exact: true }).inputValue(),
      "國立清華大學"
    );
    for (const section of [
      "models",
      "drafts",
      "projects",
      "notifications",
      "settings",
      "billing",
      "rewards",
      "support",
      "free-print",
    ]) {
      await goto(section);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 950 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth
          ),
          false,
          `overflow: ${section} ${width}`
        );
      }
    }
    await page.screenshot({
      path: join(screenshots, "station-mobile.png"),
      fullPage: true,
    });
    // Prepare a single-color PETG draft through the same cloud workbench and apply through the real UI.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(base + "/#/quote?draft=" + draft.id);
    await ready();
    await page.getByRole("radio", { name: "單色列印", exact: true }).check();
    await page.getByLabel("草稿名稱", { exact: true }).fill("水木書苑免費申請");
    await page.getByRole("button", { name: "另存新草稿", exact: true }).click();
    await page
      .locator(".cloud-draft-panel [role=status]")
      .filter({ hasText: "已保存" })
      .waitFor();
    const freeDraft = (await api("")).drafts.find(
      (d) => d.name === "水木書苑免費申請"
    );
    assert.ok(freeDraft);
    await goto("free-print");
    await page.locator(".station-panel select").selectOption(freeDraft.id);
    await page.getByLabel("我了解需由站點審核，", { exact: false }).check();
    await page
      .getByRole("button", { name: "送出免費列印申請", exact: true })
      .click();
    await page.getByText("待處理", { exact: true }).waitFor();
    assert.equal(
      (await api("")).requests.find((r) => r.type === "free_print").material,
      "3DSTU_PETG"
    );
    // Staff sees and answers the same request; this local seed account never leaves this test server.
    const login = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "demo@layerpilot.test",
        password: "layerpilot",
      }),
    });
    const owner = await login.json();
    const created = await fetch(base + "/api/users", {
      method: "POST",
      headers: {
        authorization: `Bearer ${owner.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "測試客服",
        email: `operator-${Date.now()}@example.test`,
        role: "Operator",
        location: "測試站點",
      }),
    });
    assert.equal(created.status, 201);
    const operator = await created.json();
    const operatorLogin = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: operator.user.email,
        password: operator.temporaryPassword,
      }),
    });
    const staff = await operatorLogin.json();
    const staffPage = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    await staffPage.addInitScript(
      (token) => localStorage.setItem("layerpilot-token", token),
      staff.token
    );
    staffPage.on("pageerror", (e) => errors.push(e.message));
    await staffPage.goto(base + "/#/member-service");
    await staffPage
      .getByRole("heading", { name: "會員服務工作台", exact: true })
      .waitFor();
    const freeCard = staffPage.locator("article").filter({
      has: staffPage.getByRole("heading", {
        name: "免費列印申請",
        exact: true,
      }),
    });
    await freeCard.locator("select").selectOption("ready_for_pickup");
    await freeCard
      .getByLabel("回覆會員", { exact: true })
      .fill("列印完成，請至水木書苑取件");
    await freeCard
      .getByRole("button", { name: "更新並通知會員", exact: true })
      .click();
    await freeCard.getByText(/取件碼：/).waitFor();
    await goto("free-print");
    await page.getByRole("button", { name: "重新整理", exact: true }).click();
    await page.getByText(/取件碼：/).waitFor();
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          checks: [
            "real upload and WebGL preview",
            "cloud save/restore transform and face paint",
            "slicer model library and cloud save with nonuniform scale/mirror",
            "autosave without duplicated model storage",
            "submit once and case conversation",
            "service request",
            "profile persistence",
            "nine sections at four widths",
            "station PETG application and staff pickup workflow",
          ],
          screenshots,
        },
        null,
        2
      )
    );
  } finally {
    if (!passed) {
      for (const [i, context] of browser.contexts().entries())
        for (const page of context.pages()) {
          await page
            .screenshot({
              path: join(screenshots, `failure-${i}.png`),
              fullPage: true,
            })
            .catch(() => {});
          console.error(
            "Failure page:",
            page.url(),
            (await page.locator("body").innerText()).slice(-1800)
          );
        }
      console.error("Screenshots:", screenshots);
    }
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
