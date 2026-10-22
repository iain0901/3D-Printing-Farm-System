const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { tmpdir } = require("node:os");
const { pathToFileURL } = require("node:url");
const JSZip = require("jszip");
const base = process.env.BASE_URL || "http://127.0.0.1:8802",
  real = process.env.REAL_SLICE === "1";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function main() {
  const root = resolve(__dirname, "../frontend-vue/node_modules/three"),
    { BoxGeometry, Mesh } = await import(
      pathToFileURL(join(root, "build/three.module.js"))
    ),
    { STLExporter } = await import(
      pathToFileURL(join(root, "examples/jsm/exporters/STLExporter.js"))
    );
  const mesh = new BoxGeometry(10, 20, 30),
    bytes = Buffer.from(
      new STLExporter().parse(new Mesh(mesh), { binary: true }).buffer
    );
  mesh.dispose();
  const file = (name) => ({
    name,
    mimeType: "application/octet-stream",
    buffer: bytes,
  });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ["--enable-unsafe-swiftshader"],
  });
  const shots = mkdtempSync(join(tmpdir(), "3drfm-slicer-studio-"));
  let passed = false,
    scenario = "success",
    actualPreview,
    actualResult;
  try {
    const page = await browser.newPage({
        viewport: { width: 1440, height: 1000 },
        reducedMotion: "reduce",
      }),
      errors = [],
      forbidden = [],
      submissions = [];
    page.on("pageerror", (e) => errors.push(e.message));
    if (real)
      page.on("response", async (response) => {
        if (
          !response.ok() ||
          !response.url().includes("/api/public/slicing-quotes/")
        )
          return;
        try {
          const body = await response.json();
          if (response.url().endsWith("/toolpaths"))
            actualPreview = body.preview;
          if (body.slicingQuote?.status === "completed")
            actualResult = body.slicingQuote;
        } catch {}
      });
    page.on("request", (r) => {
      if (/\/api\/(?:printers|queue|public\/cases)/.test(r.url()))
        forbidden.push(r.url());
    });
    if (!real) {
      let polls = 0,
        current = {},
        cancelled = false;
      const preview = {
        layers: [0.2, 0.4, 0.6, 0.8].map((z, index) => ({
          z,
          segments: [
            {
              from: [110, 110, z],
              to: [140, 110, z],
              role: "outer",
              speed: 40,
              tool: 0,
            },
            {
              from: [140, 110, z],
              to: [140, 140, z],
              role: "inner",
              speed: 70,
              tool: 0,
            },
            {
              from: [140, 140, z],
              to: [110, 140, z],
              role: "infill",
              speed: 100,
              tool: 0,
            },
            {
              from: [110, 140, z],
              to: [110, 110, z],
              role: "support",
              speed: 60,
              tool: 0,
            },
          ],
        })),
        roles: {
          outer: "外壁",
          inner: "內壁",
          infill: "填充",
          support: "支撐",
          travel: "空走",
        },
        segmentCount: 16,
        bounds: { min: [110, 110, 0.2], max: [140, 140, 0.8] },
        warning: "",
        truncated: false,
      };
      await page.route("**/api/public/slicing-quotes**", async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname;
        const reply = (data, status = 200) =>
          route.fulfill({
            status,
            contentType: "application/json",
            body: JSON.stringify(data),
          });
        if (req.method() === "POST") {
          const payload = JSON.parse(
            req
              .postDataBuffer()
              .toString()
              .match(/name="payload"\r\n\r\n([^\r]+)/)[1]
          );
          submissions.push(payload);
          if (scenario === "upload-error")
            return reply({ error: "切片服務暫時無法接收工作" }, 503);
          current = {
            id: "studio-local-job",
            purpose: payload.purpose,
            status: "queued",
            material: payload.material,
            materialLabel:
              payload.purpose === "free-print"
                ? "3DSTU_PETG"
                : payload.material,
            createdAt: new Date().toISOString(),
            engine: "OrcaSlicer",
            engineVersion: "browser-contract",
            estimatedMinutes: 12,
            totalGrams: 3,
            modelGrams: 2,
            supportGrams: 0.5,
            otherGrams: 0.5,
            profileName: "Local contract fixture",
          };
          polls = 0;
          cancelled = false;
          return reply(
            { slicingQuote: current, accessToken: "local-studio-token" },
            202
          );
        }
        assert.equal(req.headers()["x-slicing-token"], "local-studio-token");
        if (req.method() === "DELETE") {
          cancelled = true;
          return reply({ slicingQuote: { ...current, status: "cancelled" } });
        }
        if (path.endsWith("/toolpaths")) return reply({ preview });
        return reply({
          slicingQuote: {
            ...current,
            status: cancelled
              ? "cancelled"
              : scenario === "failed"
              ? "failed"
              : scenario === "waiting"
              ? "queued"
              : ++polls < 2
              ? "processing"
              : "completed",
          },
        });
      });
    }
    const ready = async () => {
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector(".stage-canvas canvas")?.dataset
              .renderedTriangles
          ) >= 12 && !document.querySelector(".studio-preparing")
      );
      await page
        .locator(".stage-message")
        .filter({ hasText: "正在準備" })
        .waitFor({ state: "hidden" });
    };
    const save = async () => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "保存專案", exact: true }).click(),
      ]);
      const path = await download.path(),
        zip = await JSZip.loadAsync(readFileSync(path));
      return {
        zip,
        path,
        project: JSON.parse(await zip.file("project.json").async("string")),
      };
    };
    await page.goto(base + "/#/cloud-slicer");
    await page
      .getByRole("heading", { name: "雲端切片工作區", exact: true })
      .waitFor();
    await page.screenshot({
      path: join(shots, "empty-desktop.png"),
      fullPage: true,
    });
    await page
      .getByLabel("選擇 STL 模型")
      .setInputFiles([file("studio-a.stl"), file("studio-b.stl")]);
    await ready();
    assert.equal(await page.locator(".object-row").count(), 2);
    await page
      .getByRole("button", { name: "選取 studio-a.stl", exact: true })
      .click();
    await page.getByRole("button", { name: "縮放", exact: true }).click();
    await page.getByLabel("等比例縮放", { exact: true }).uncheck();
    for (const [axis, value] of [
      ["X", "150"],
      ["Y", "80"],
      ["Z", "120"],
    ]) {
      await page
        .getByLabel("模型非等比縮放 " + axis, { exact: true })
        .fill(value);
      await page
        .getByLabel("模型非等比縮放 " + axis, { exact: true })
        .press("Tab");
      await ready();
    }
    await page.getByRole("button", { name: "鏡像 X", exact: true }).click();
    await ready();
    assert.match(
      await page.locator(".transform-heading").innerText(),
      /15.0 × 16.0 × 36.0/
    );
    await page.getByRole("button", { name: "旋轉", exact: true }).click();
    await page.getByLabel("模型旋轉 Z", { exact: true }).fill("90");
    await page.getByLabel("模型旋轉 Z", { exact: true }).press("Tab");
    await ready();
    assert.match(
      await page.locator(".transform-heading").innerText(),
      /16.0 × 15.0 × 36.0/
    );
    await page
      .getByRole("region", { name: "3D 切片工作區", exact: true })
      .focus();
    await page.keyboard.press("Control+z");
    await ready();
    assert.match(
      await page.locator(".transform-heading").innerText(),
      /15.0 × 16.0 × 36.0/
    );
    await page.keyboard.press("Control+Shift+z");
    await ready();
    await page
      .getByRole("button", { name: "複製選取模型", exact: true })
      .click();
    await ready();
    assert.equal(await page.locator(".object-row").count(), 3);
    await page
      .getByRole("button", { name: "選取 studio-a.stl", exact: true })
      .click();
    await page
      .getByRole("button", { name: "選取 studio-b.stl", exact: true })
      .click({ modifiers: ["Control"] });
    assert.match(
      await page.locator(".stage-inspector").innerText(),
      /已選 2 個模型/
    );
    const before = (await save()).project;
    await page
      .getByRole("region", { name: "3D 切片工作區", exact: true })
      .focus();
    await page.keyboard.press("ArrowRight");
    const afterMove = (await save()).project;
    for (const name of ["studio-a.stl", "studio-b.stl"])
      assert.equal(
        afterMove.models.find((m) => m.name === name).position.x,
        before.models.find((m) => m.name === name).position.x + 1
      );
    await page
      .getByRole("button", { name: "隱藏 studio-b.stl", exact: true })
      .click();
    assert.equal(
      (await save()).project.models.find((m) => m.name === "studio-b.stl")
        .hidden,
      true
    );
    await page
      .getByRole("button", { name: "顯示 studio-b.stl", exact: true })
      .click();
    await page
      .getByRole("button", { name: "選取 studio-a.stl", exact: true })
      .click();
    await page.getByRole("button", { name: "聚焦選取", exact: true }).click();
    await page.getByRole("button", { name: "按面放平", exact: true }).click();
    const canvas = page.locator(".stage-canvas canvas");
    const box = await canvas.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await ready();
    assert.equal(
      await page
        .getByRole("button", { name: "按面放平", exact: true })
        .getAttribute("aria-pressed"),
      "false"
    );
    await page.getByRole("button", { name: "自動排版", exact: true }).click();
    await ready();
    await page.getByText("進階參數", { exact: false }).first().click();
    await page.getByRole("button", { name: "強度", exact: true }).click();
    await page.getByLabel("填充圖案", { exact: true }).selectOption("gyroid");
    await page.getByLabel("搜尋切片參數", { exact: true }).fill("回抽");
    await page.getByLabel("回抽距離", { exact: true }).fill("0.8");
    await page.getByLabel("回抽距離", { exact: true }).press("Tab");
    await page.getByLabel("回抽速度", { exact: true }).fill("35");
    await page.getByLabel("回抽速度", { exact: true }).press("Tab");
    const saved = await save();
    assert.equal(saved.project.settings.advanced.infillPattern, "gyroid");
    assert.equal(saved.project.models[0].transform.mirrorX, true);
    assert.equal(
      (await saved.zip.file("sources/0.stl").async("nodebuffer")).length,
      bytes.length
    );
    await page.getByRole("button", { name: "適合視窗", exact: true }).click();
    await page.screenshot({
      path: join(shots, "models-desktop.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "開始切片", exact: false }).click();
    await page
      .getByRole("region", { name: "三維切片路徑預覽", exact: true })
      .waitFor({ timeout: real ? 180000 : 30000 });
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .visibleSegments
        ) > 0
    );
    await page.screenshot({
      path: join(shots, "toolpaths-all-layers.png"),
      fullPage: true,
    });
    if (real) {
      assert.ok(actualPreview?.segmentCount > 0);
      assert.equal(actualResult?.engine, "OrcaSlicer");
      assert.ok(
        actualResult.totalGrams > 0 && actualResult.estimatedMinutes > 0
      );
      const { prepareStationModel } = await import(
        pathToFileURL(
          resolve(
            __dirname,
            "../frontend-vue/src/utils/prepare-station-model.js"
          )
        )
      );
      const layer = actualPreview.layers.find(
        (l) => Math.abs(l.z - 0.4) < 0.001
      );
      assert.ok(layer, "real second layer is present");
      for (const model of saved.project.models) {
        const prepared = prepareStationModel(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
          model.transform
        );
        const [w, d] = prepared.dimensions,
          { x, y } = model.position;
        assert.ok(
          layer.segments.some(
            (s) =>
              s.role === "outer" &&
              Math.abs(s.to[0] - x) <= w / 2 + 0.5 &&
              Math.abs(s.to[1] - y) <= d / 2 + 0.5
          ),
          `real G-code retains manual placement for ${model.name}`
        );
      }
    }
    await page.getByLabel("路徑結束層", { exact: true }).fill("0");
    await page.getByLabel("只顯示目前層", { exact: true }).check();
    await page.getByLabel("路徑線段進度", { exact: true }).fill("50");
    await page.waitForFunction(() => {
      const total = Number(
        document
          .querySelector(".path-legend p")
          ?.textContent.replace(/[^0-9]/g, "")
      );
      return (
        total > 0 &&
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .visibleSegments
        ) === Math.floor(total / 2)
      );
    });
    const half = await page
      .locator(".toolpath-canvas canvas")
      .getAttribute("data-visible-segments");
    await page.getByLabel("路徑線段進度", { exact: true }).fill("100");
    await page.waitForFunction(
      (n) =>
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .visibleSegments
        ) > Number(n),
      half
    );
    await page.getByRole("button", { name: "播放路徑", exact: true }).click();
    await page
      .getByRole("button", { name: "暫停路徑播放", exact: true })
      .click();
    await page.getByLabel("路徑線段進度", { exact: true }).fill("100");
    await page.waitForFunction(
      () =>
        Number(
          document.querySelector(".toolpath-canvas canvas")?.dataset
            .visibleSegments
        ) > 0
    );
    await page.screenshot({
      path: join(shots, "toolpaths-desktop.png"),
      fullPage: true,
    });
    for (const width of [1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false,
        `overflow ${width}`
      );
    }
    await page.screenshot({
      path: join(shots, "toolpaths-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    page.once("dialog", (d) => d.accept());
    await page
      .getByLabel("開啟切片專案", { exact: true })
      .setInputFiles(saved.path);
    await ready();
    assert.equal(await page.locator(".object-row").count(), 3);
    assert.equal((await save()).project.settings.advanced.retractionSpeed, 35);
    if (!real) {
      assert.equal(submissions[0].purpose, "studio");
      assert.equal(submissions[0].advanced.infillPattern, "gyroid");
      await page.goto(base + "/#/free-print/nthu-shuimu/slicer");
      await page.getByText("3DSTU_PETG", { exact: true }).waitFor();
      assert.equal(await page.getByLabel("切片材料").count(), 0);
      await page.getByLabel("選擇 STL 模型").setInputFiles(file("free.stl"));
      await ready();
      await page
        .getByRole("button", { name: "開始切片", exact: false })
        .click();
      await page
        .getByRole("region", { name: "三維切片路徑預覽", exact: true })
        .waitFor();
      assert.equal(submissions.at(-1).material, "PETG");
      assert.equal(submissions.at(-1).stationId, "nthu-shuimu");
      const count = submissions.length;
      await page.reload();
      await page
        .getByRole("region", { name: "三維切片路徑預覽", exact: true })
        .waitFor();
      assert.equal(
        submissions.length,
        count,
        "session resume must not submit twice"
      );
      await page.getByLabel("切片層高", { exact: true }).selectOption("0.16");
      await page
        .getByRole("region", { name: "三維切片路徑預覽", exact: true })
        .waitFor({ state: "hidden" });
      await page.getByLabel("選擇 STL 模型").setInputFiles(file("retry.stl"));
      await ready();
      scenario = "failed";
      await page
        .getByRole("button", { name: "開始切片", exact: false })
        .click();
      await page
        .getByText("切片未完成，請檢查模型及設定後重試。", { exact: true })
        .waitFor();
      scenario = "upload-error";
      await page
        .getByRole("button", { name: "重新切片", exact: false })
        .click();
      await page
        .getByRole("alert")
        .filter({ hasText: "切片服務暫時無法接收工作" })
        .waitFor();
      scenario = "waiting";
      await page
        .getByRole("button", { name: "開始切片", exact: false })
        .click();
      await page
        .getByRole("button", { name: "取消切片工作", exact: true })
        .click();
      await page
        .getByText("已取消工作，晚到的結果不會採用。", { exact: true })
        .waitFor();
      await page.getByRole("button", { name: "移動", exact: true }).click();
      await page.getByLabel("模型位置 X", { exact: true }).fill("1");
      await page.getByLabel("模型位置 X", { exact: true }).press("Tab");
      assert.equal(
        await page
          .getByRole("button", { name: "開始切片", exact: false })
          .isDisabled(),
        true
      );
      await page
        .getByRole("button", { name: "刪除選取模型", exact: true })
        .click();
      assert.equal(await page.locator(".object-row").count(), 0);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(forbidden, []);
    passed = true;
    console.log(
      JSON.stringify(
        {
          result: "PASS",
          realSlice: real,
          ...(real
            ? {
                engine: actualResult.engine,
                engineVersion: actualResult.engineVersion,
                totalGrams: actualResult.totalGrams,
                estimatedMinutes: actualResult.estimatedMinutes,
                layers: actualPreview.layers.length,
                segments: actualPreview.segmentCount,
              }
            : {}),
          checks: [
            "multi-model WebGL bed",
            "nonuniform scaling and mirror",
            "rotation undo/redo",
            "clone and Ctrl multi-select",
            "keyboard batch move",
            "hide/restore",
            "clicked-face grounding",
            "advanced engine settings",
            "project ZIP roundtrip",
            "3D G-code layer ranges and playback",
            "responsive",
            ...(real
              ? ["real OrcaSlicer engine result"]
              : [
                  "free PETG lock",
                  "session resume, invalidation, failed/upload recovery, cancellation and boundary validation",
                ]),
            "no printer or order mutation",
          ],
          screenshots: shots,
        },
        null,
        2
      )
    );
  } finally {
    if (!passed)
      for (const context of browser.contexts())
        for (const page of context.pages()) {
          await page
            .screenshot({ path: join(shots, "failure.png"), fullPage: true })
            .catch(() => {});
          console.error(
            page.url(),
            (await page.locator("body").innerText()).slice(-2400)
          );
        }
    if (!passed) console.error("Screenshots:", shots);
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
