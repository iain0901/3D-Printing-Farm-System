// Local-only browser verification: real WebGL/worker geometry + deterministic API stage contracts.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const JSZip = require("jszip");
const base = process.env.BASE_URL || "http://127.0.0.1:8805";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function main() {
  const { resolveSlicerHelp, slicerHelpTopics } = await import(
    pathToFileURL(
      resolve(__dirname, "../frontend-vue/src/utils/slicer-help.mjs")
    )
  );
  const { slicerSettingFields } = await import(
    pathToFileURL(
      resolve(__dirname, "../frontend-vue/src/utils/slicer-settings.mjs")
    )
  );
  const { prepareStationModel } = await import(
    pathToFileURL(
      resolve(__dirname, "../frontend-vue/src/utils/prepare-station-model.js")
    )
  );
  const threeRoot = resolve(__dirname, "../frontend-vue/node_modules/three");
  const { BoxGeometry, Mesh } = await import(
    pathToFileURL(join(threeRoot, "build/three.module.js"))
  );
  const { STLExporter } = await import(
    pathToFileURL(join(threeRoot, "examples/jsm/exporters/STLExporter.js"))
  );
  const geometry = new BoxGeometry(10, 20, 30);
  const bytes = Buffer.from(
    new STLExporter().parse(new Mesh(geometry), { binary: true }).buffer
  );
  geometry.dispose();
  const file = (name) => ({
    name,
    buffer: bytes,
    mimeType: "application/octet-stream",
  });
  const shots = mkdtempSync(join(tmpdir(), "3drfm-interactions-"));
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  });
  const errors = [],
    submissions = [],
    opened = new Set();
  page.on("pageerror", (e) => errors.push(e.message));
  let status = "queued",
    cancelCompletes = false,
    queryError = false,
    pathsError = false,
    holdCreate,
    holdPaths,
    releaseCreate,
    releasePaths;
  const preview = {
    layers: [
      {
        z: 0.2,
        segments: [
          {
            from: [10, 10, 0.2],
            to: [30, 10, 0.2],
            role: "outer",
            speed: 40,
            tool: 0,
          },
        ],
      },
    ],
    roles: { outer: "外壁", travel: "空走" },
    segmentCount: 1,
    bounds: { min: [10, 10, 0.2], max: [30, 10, 0.2] },
    warning: "",
    truncated: false,
  };
  await page.route("**/api/public/slicing-quotes**", async (route) => {
    const request = route.request();
    const reply = (body, code = 200) =>
      route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const job = {
      id: "interaction-test",
      status,
      createdAt: new Date().toISOString(),
      engine: "OrcaSlicer",
      profileName: "local contract fixture",
      estimatedMinutes: 3,
      totalGrams: 1,
    };
    if (request.method() === "POST") {
      submissions.push({
        payload: JSON.parse(
          request
            .postDataBuffer()
            .toString()
            .match(/name="payload"\r\n\r\n([^\r]+)/)[1]
        ),
        bytes: request.postDataBuffer(),
      });
      if (holdCreate) await holdCreate;
      return reply({ slicingQuote: job, accessToken: "local-only" }, 202);
    }
    if (request.method() === "DELETE") {
      status = cancelCompletes ? "completed" : "cancelled";
      return reply({ slicingQuote: { ...job, status } });
    }
    if (request.url().endsWith("/toolpaths")) {
      if (holdPaths) await holdPaths;
      return pathsError
        ? reply({ error: "測試路徑讀取失敗" }, 503)
        : reply({ preview });
    }
    return queryError
      ? reply({ error: "測試進度查詢中斷" }, 503)
      : reply({ slicingQuote: job });
  });
  const ready = () =>
    page.waitForFunction(
      () =>
        Number(
          document.querySelector(".stage-canvas canvas")?.dataset
            .renderedTriangles
        ) >= 12 && !document.querySelector(".studio-preparing")
    );
  const save = async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "保存專案", exact: true }).click(),
    ]);
    const zip = await JSZip.loadAsync(readFileSync(await download.path()));
    return JSON.parse(await zip.file("project.json").async("string"));
  };
  const closeHelp = async () => {
    await page.keyboard.press("Escape");
    await page.locator(".rfm-feature-dialog").waitFor({ state: "hidden" });
  };
  // Audit every currently mounted control; click each distinct contextual help topic.
  async function auditHelp(scope) {
    const labels = await page.locator(scope).evaluate((root) =>
      [
        ...root.querySelectorAll(
          'button,input:not([type="file"]),select,textarea,summary'
        ),
      ]
        .filter(
          (el) =>
            el.checkVisibility() &&
            (!el.closest("details:not([open])") || el.tagName === "SUMMARY")
        )
        .map((el, index) => {
          el.dataset.helpTest = String(index);
          return {
            index,
            label: (
              el.getAttribute("data-help") ||
              el.getAttribute("aria-label") ||
              (el.matches("input,select,textarea")
                ? el.closest("label")?.textContent
                : el.textContent) ||
              ""
            )
              .replace(/\s+/g, " ")
              .trim(),
          };
        })
    );
    const unknown = labels.filter(({ label }) => !resolveSlicerHelp(label));
    assert.deepEqual(
      unknown,
      [],
      "every visible workbench function must have specific help"
    );
    for (const { index, label } of labels) {
      const topic = resolveSlicerHelp(label);
      if (opened.has(topic.id)) continue;
      const control = page.locator(scope + ' [data-help-test="' + index + '"]');
      await control.hover();
      const question = page.locator(
        '.rfm-feature-question[data-help-topic="' + topic.id + '"]'
      );
      await question.waitFor();
      assert.equal(
        await question.evaluate(
          (el) => getComputedStyle(el).transitionDuration
        ),
        "0s",
        "help must not inherit drifting theme animations"
      );
      await question.click();
      assert.equal(
        await page.locator(".rfm-help-copy").innerText(),
        topic.description
      );
      await closeHelp();
      opened.add(topic.id);
      console.log("HELP OK", topic.id);
    }
    return labels.length;
  }
  let audited = 0;
  try {
    await page.goto(base + "/#/cloud-slicer");
    await page
      .getByRole("heading", { name: "雲端切片工作區", exact: true })
      .waitFor();
    audited += await auditHelp(".slicer-lab"); // includes disabled controls
    await page
      .getByLabel("選擇 STL 模型")
      .setInputFiles([file("direction-a.stl"), file("direction-b.stl")]);
    await ready();
    // Exercise every basic setting and verify persisted values, not just DOM controls.
    for (const material of ["PLA", "ASA", "TPU", "PETG"]) {
      await page.getByLabel("切片材料", { exact: true }).selectOption(material);
      assert.equal((await save()).settings.material, material);
    }
    await page.getByLabel("切片層高", { exact: true }).selectOption("0.16");
    await page.getByLabel("切片填充密度", { exact: true }).fill("25");
    await page.getByLabel("切片外壁圈數", { exact: true }).fill("3");
    await page.getByLabel("自動產生支撐", { exact: true }).uncheck();
    const basics = (await save()).settings;
    assert.equal(basics.layerHeight, 0.16);
    assert.equal(basics.infill, 25);
    assert.equal(basics.walls, 3);
    assert.equal(basics.autoSupports, false);
    await page.getByLabel("自動產生支撐", { exact: true }).check();
    const before = await save();
    await page
      .getByRole("button", { name: "立即自動朝向", exact: true })
      .click();
    await ready();
    const after = await save();
    for (const model of after.models) {
      assert.equal(model.transform.layFlat, true);
      const transformed = prepareStationModel(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        model.transform
      );
      assert.equal(
        transformed.dimensions[2],
        10,
        "orientation changes live/upload geometry before slicing"
      );
    }
    assert.match(
      await page.locator(".transform-heading").innerText(),
      /10.0 mm$/
    );
    assert.equal(
      submissions.length,
      0,
      "immediate orientation must not create a slice job"
    );
    await page
      .getByRole("button", { name: "復原模型操作", exact: true })
      .click();
    await ready();
    assert.deepEqual(
      (await save()).models,
      before.models,
      "one undo restores orientation AND positions"
    );
    await page
      .getByRole("button", { name: "重做模型操作", exact: true })
      .click();
    await ready();
    assert.deepEqual((await save()).models, after.models);
    await page
      .getByRole("button", { name: "立即自動朝向", exact: true })
      .click();
    await ready();
    assert.deepEqual(
      (await save()).models,
      after.models,
      "repeated orientation is stable"
    );
    // Camera changes must never silently become model transforms.
    for (const name of [
      "等角視圖",
      "上視圖",
      "前視圖",
      "後視圖",
      "左視圖",
      "右視圖",
      "下視圖",
      "適合視窗",
      "聚焦選取",
      "建構體積",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      assert.deepEqual(
        (await save()).models,
        after.models,
        name + " does not alter geometry"
      );
    }
    audited += await auditHelp(".slicer-lab");
    await page.getByRole("button", { name: "旋轉", exact: true }).click();
    audited += await auditHelp(".stage-inspector");
    await page.getByRole("button", { name: "縮放", exact: true }).click();
    await page.getByLabel("等比例縮放", { exact: true }).uncheck();
    audited += await auditHelp(".stage-inspector");
    await page.getByRole("button", { name: "選取", exact: true }).click();
    const input = page.getByLabel("模型位置 X", { exact: true });
    const position = await input.inputValue();
    await input.focus();
    await page.keyboard.press("F1");
    assert.equal(
      await page.locator(".rfm-help-copy").innerText(),
      resolveSlicerHelp("模型位置 X").description
    );
    await closeHelp();
    await input.press("Tab");
    assert.equal(
      await page
        .locator(".rfm-feature-question")
        .evaluate((el) => el === document.activeElement),
      true
    );
    await page.keyboard.press("Enter");
    await page.locator(".rfm-feature-dialog").waitFor();
    assert.equal(
      await page.locator(".rfm-help-copy").innerText(),
      resolveSlicerHelp("模型位置 X").description,
      "stationary mouse must not replace the keyboard help target after modal close"
    );
    await closeHelp();
    assert.equal(
      await input.inputValue(),
      position,
      "help never modifies field values"
    );
    assert.equal(
      await input.evaluate((el) => el === document.activeElement),
      true,
      "focus returns to the explained function"
    );
    await page.locator(".slicer-parameters summary").click();
    for (const field of slicerSettingFields) {
      await page.getByLabel("搜尋切片參數").fill(field.label);
      audited += await auditHelp(".slicer-parameters");
      const control = page
        .locator(".slicer-parameters")
        .getByLabel(field.label, { exact: true });
      const value = field.choices
        ? String(field.choices[0][0])
        : String(field.min + field.step);
      if (field.choices) await control.selectOption(value);
      else {
        await control.fill(value);
        await control.press("Tab");
      }
      const saved = await save();
      assert.equal(
        String(saved.settings.advanced[field.id]),
        value,
        field.id + " is persisted"
      );
      if (!field.choices) {
        await control.fill(String(field.max + 1));
        await control.press("Tab");
        assert.equal(
          (await save()).settings.advanced[field.id],
          Number(value),
          field.id + " rejects invalid values"
        );
      }
    }
    await page
      .getByRole("button", { name: "還原所有進階參數", exact: true })
      .click();
    assert.deepEqual((await save()).settings.advanced, {});
    await page.getByLabel("搜尋切片參數").fill("");
    await page.locator(".slicer-parameters summary").click();
    // Hold server response so immediate upload UI can be asserted reliably.
    holdCreate = new Promise((r) => {
      releaseCreate = r;
    });
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page.locator('.slicing-progress[data-phase="upload"]').waitFor();
    assert.ok(
      await page.getByRole("progressbar").isVisible(),
      "progress is visible immediately"
    );
    await page.screenshot({ path: join(shots, "upload-progress.png") });
    releaseCreate();
    holdCreate = null;
    await page.locator('.slicing-progress[data-phase="queued"]').waitFor();
    assert.equal(
      await page.getByRole("progressbar").getAttribute("aria-valuenow"),
      null
    );
    assert.equal(submissions.at(-1).payload.autoOrient, false);
    assert.equal(submissions.at(-1).payload.autoArrange, false);
    assert.deepEqual(
      submissions.at(-1).payload.placements,
      after.models.map((m) => m.position)
    );
    const expected = prepareStationModel(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
      after.models[0].transform
    );
    assert.ok(
      submissions.at(-1).bytes.includes(Buffer.from(expected.buffer)),
      "upload contains the already-oriented binary STL"
    );
    status = "processing";
    await page.locator('.slicing-progress[data-phase="processing"]').waitFor();
    queryError = true;
    await page.locator('.slicing-progress[data-phase="paused"]').waitFor();
    assert.equal(
      await page.getByRole("progressbar").getAttribute("aria-valuenow"),
      null
    );
    queryError = false;
    await page
      .getByRole("button", { name: "重新查詢原工作", exact: true })
      .click();
    await page.locator('.slicing-progress[data-phase="processing"]').waitFor();
    assert.equal(submissions.length, 1, "retry must not re-upload");
    holdPaths = new Promise((r) => {
      releasePaths = r;
    });
    status = "completed";
    await page.locator('.slicing-progress[data-phase="preview"]').waitFor();
    assert.equal(
      await page.getByRole("progressbar").getAttribute("aria-valuenow"),
      null,
      "engine finished is not preview 100%"
    );
    releasePaths();
    holdPaths = null;
    await page.locator('.slicing-progress[data-phase="completed"]').waitFor();
    assert.equal(
      await page.getByRole("progressbar").getAttribute("aria-valuenow"),
      "100"
    );
    audited += await auditHelp(".toolpath-viewer");
    await page.reload();
    await page.locator('.slicing-progress[data-phase="completed"]').waitFor();
    assert.equal(submissions.length, 1, "reload resumes original job");
    // Recovered job with no local models can still retry its preview, without resubmitting.
    pathsError = true;
    await page.reload();
    await page.locator('.slicing-progress[data-phase="paused"]').waitFor();
    pathsError = false;
    await page
      .getByRole("button", { name: "重新查詢原工作", exact: true })
      .click();
    await page.locator('.slicing-progress[data-phase="completed"]').waitFor();
    // New layout invalidates result; terminal failure and cancellation stop indeterminate motion.
    await page.getByLabel("選擇 STL 模型").setInputFiles(file("retry.stl"));
    await ready();
    status = "failed";
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page.locator('.slicing-progress[data-phase="failed"]').waitFor();
    status = "queued";
    await page.getByRole("button", { name: /^重新切片/ }).click();
    await page.locator('.slicing-progress[data-phase="queued"]').waitFor();
    await page
      .getByRole("button", { name: "取消切片工作", exact: true })
      .click();
    await page.locator('.slicing-progress[data-phase="cancelled"]').waitFor();
    assert.equal(await page.locator(".progress-track.running").count(), 0);
    status = "queued";
    cancelCompletes = true;
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page.locator('.slicing-progress[data-phase="queued"]').waitFor();
    await page
      .getByRole("button", { name: "取消切片工作", exact: true })
      .click();
    await page.locator('.slicing-progress[data-phase="completed"]').waitFor();
    assert.match(
      await page.locator(".lab-notice").innerText(),
      /取消前引擎已完成/
    );
    // Paid workbench uses the same immediate geometry tools and covers color/paint help.
    await page.goto(base + "/#/quote");
    await page
      .getByRole("heading", { name: "把想法，放上列印平台。", exact: true })
      .waitFor();
    await page.getByLabel("選擇 STL 模型").setInputFiles(file("color.stl"));
    await ready();
    await page.getByLabel("多色列印", { exact: true }).check();
    await page
      .getByRole("button", { name: "color.stl 新增換色區間", exact: true })
      .click();
    if (!(await page.locator(".print-settings").evaluate((el) => el.open))) {
      await page.getByText("列印品質與排列偏好", { exact: true }).click();
    }
    audited += await auditHelp(".workbench-wrap");
    assert.equal(
      await page
        .getByRole("button", { name: "立即自動朝向", exact: true })
        .isDisabled(),
      true,
      "height bands protect orientation"
    );
    await page
      .getByRole("button", { name: "color.stl 移除區間 1", exact: true })
      .click();
    await page
      .getByRole("button", { name: "立即自動朝向", exact: true })
      .click();
    await ready();
    assert.match(
      await page.locator(".transform-heading").innerText(),
      /10.0 mm$/
    );
    await page
      .getByRole("button", { name: "確認設定，帶入會員資料 ↗", exact: true })
      .click();
    audited += await auditHelp(".quote-account");
    await page.getByRole("button", { name: "建立帳號", exact: true }).click();
    audited += await auditHelp(".quote-account");
    // Touch users have a persistent searchable help directory, not hover-only help.
    const touch = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      reducedMotion: "reduce",
    });
    const mobile = await touch.newPage();
    await mobile.goto(base + "/#/cloud-slicer");
    await mobile
      .getByRole("button", { name: "功能說明目錄", exact: true })
      .tap();
    await mobile.getByLabel("搜尋功能說明").fill("自動朝向");
    await mobile
      .locator(".rfm-help-topics")
      .getByRole("button", { name: "立即自動朝向", exact: true })
      .tap();
    assert.match(
      await mobile.locator(".rfm-help-copy").innerText(),
      /不必開始切片/
    );
    await mobile.screenshot({
      path: join(shots, "help-mobile.png"),
      fullPage: true,
    });
    for (const width of [390, 320]) {
      await mobile.setViewportSize({ width, height: 844 });
      assert.equal(
        await mobile.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          auditedControls: audited,
          openedHelpTopics: opened.size,
          catalogueTopics: slicerHelpTopics.length,
          checks: [
            "immediate orientation + binary upload",
            "undo/redo/repeated orientation",
            "all 18 advanced settings + invalid bounds + reset",
            "hover help incl disabled controls",
            "F1/Tab/Enter/Escape and focus restoration",
            "upload/queue/processing/preview/complete/failure/cancel",
            "query and preview error retry",
            "reload without resubmit",
            "paid workbench + height-band guard",
            "touch help + 390/320px",
          ],
          screenshots: shots,
        },
        null,
        2
      )
    );
    await touch.close();
  } catch (error) {
    await page
      .screenshot({ path: join(shots, "failure.png"), fullPage: true })
      .catch(() => {});
    console.error("Screenshots:", shots);
    throw error;
  } finally {
    releaseCreate?.();
    releasePaths?.();
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
