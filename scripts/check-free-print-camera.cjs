// Local UI verification only: camera and printer responses are explicit fixtures.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const base = process.env.BASE_URL || "http://127.0.0.1:8809";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function main() {
  const registration = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "影像介面測試",
      email: `camera-${Date.now()}@example.test`,
      password: "camera-browser-123",
    }),
  });
  assert.equal(registration.status, 201);
  const { token } = await registration.json();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const output = mkdtempSync(join(tmpdir(), "3drfm-camera-"));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    reducedMotion: "reduce",
  });
  let passed = false;
  try {
    await page.addInitScript(
      (token) => localStorage.setItem("layerpilot-customer-token", token),
      token
    );
    const errors = [],
      actions = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let phase = "queued",
      mode = "unconfigured",
      sessions = 0,
      frames = 0,
      homed = false,
      status = "idle",
      delay = 0;
    const view = () => ({
      station: {
        id: "nthu-shuimu",
        name: "清華大學水木書苑",
        open: true,
        availability: "依序通知使用",
        queueLength: 2,
      },
      reservations: [
        {
          id: "camera-own",
          sequence: 12,
          status: phase,
          statusLabel: {
            queued: "等待使用",
            preparing: "準備列印",
            printing: "列印中",
            completed: "已完成",
          }[phase],
          position: 2,
          estimatedMinutes: 25,
          canControl: !["queued", "completed"].includes(phase),
          leaseExpiresAt: new Date(Date.now() + 1800000).toISOString(),
        },
      ],
      telemetry: {
        status,
        nozzle: 25,
        bed: 25,
        homed,
        position: { x: 10, y: 10, z: 10 },
        progress: 15,
      },
    });
    const json = (route, body, code = 200) =>
      route.fulfill({
        status: code,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    await page.route(
      "**/api/customer/workspace/free-print/**",
      async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/camera-session")) {
          sessions++;
          const savedMode = mode;
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          if (savedMode === "unconfigured")
            return json(route, { camera: { state: "unconfigured" } });
          return json(route, {
            camera: {
              state: "ready",
              kind: savedMode === "mjpeg" ? "mjpeg" : "snapshot",
              mediaUrl:
                savedMode === "invalid"
                  ? "http://camera.local/private"
                  : "/api/customer/workspace/free-print/reservations/camera-own/camera/frame?ticket=fixture",
              expiresAt: new Date(Date.now() + 10000).toISOString(),
            },
          });
        }
        if (url.pathname.includes("/camera/frame")) {
          frames++;
          if (mode !== "mjpeg")
            assert.equal(
              route.request().headers().authorization,
              `Bearer ${token}`,
              "snapshot uses member auth"
            );
          if (mode === "broken")
            return json(route, { error: "影像連線中斷" }, 502);
          return route.fulfill({
            contentType: "image/png",
            body: Buffer.from(
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2kAAAAASUVORK5CYII=",
              "base64"
            ),
          });
        }
        if (url.pathname.endsWith("/action")) {
          const action = route.request().postDataJSON();
          actions.push(action);
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (action.action === "home") homed = true;
          if (action.action === "pause") phase = "paused";
          if (action.action === "resume") phase = "printing";
        }
        return json(route, view());
      }
    );
    const refresh = async () => {
      const response = page.waitForResponse((r) =>
        r.url().endsWith("/free-print/station")
      );
      await page.getByRole("button", { name: "更新狀態", exact: true }).click();
      await response;
    };
    const connect = () =>
      page.getByRole("button", { name: "連接即時影像", exact: true }).click();
    await page.goto(base + "/#/portal/free-print");
    await page.getByText("輪到你時才能觀看", { exact: true }).waitFor();
    assert.equal(sessions, 0, "queued member never requests a camera session");
    phase = "preparing";
    await refresh();
    await page.getByText("攝影機尚未連接", { exact: true }).waitFor();
    assert.equal(
      await page.locator(".camera-screen img, .camera-screen video").count(),
      0
    );
    mode = "snapshot";
    delay = 400;
    await connect();
    await page.getByText("正在連接站點攝影機", { exact: true }).waitFor();
    await page.getByText("正在接收影像", { exact: true }).waitFor();
    delay = 0;
    await page.waitForFunction(
      () => document.querySelector(".camera-screen img")?.naturalWidth === 1
    );
    await page.getByRole("button", { name: "填滿畫面", exact: true }).click();
    assert.equal(await page.locator(".camera-screen.contain").count(), 0);
    await page.getByRole("button", { name: "完整畫面", exact: true }).click();
    const fullscreen = page.getByRole("button", {
      name: "全螢幕",
      exact: true,
    });
    if (await fullscreen.count()) {
      await fullscreen.click();
      await page.waitForFunction(() => !!document.fullscreenElement);
      await page.evaluate(() => document.exitFullscreen());
    }
    await page.locator(".printer-camera summary").click();
    await page.screenshot({
      path: join(output, "desktop-camera-fixture.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "暫停觀看", exact: true }).click();
    await page.getByText("影像已暫停", { exact: true }).waitFor();
    const pausedFrames = frames;
    await page.waitForTimeout(1200);
    assert.equal(frames, pausedFrames, "pausing stops frame polling");
    assert.equal(
      actions.length,
      0,
      "viewing controls never send hardware commands"
    );
    mode = "invalid";
    await connect();
    await page.getByText("目前無法取得影像", { exact: true }).waitFor();
    assert.equal(
      await page.locator(".camera-screen img").count(),
      0,
      "rejects raw camera URLs"
    );
    mode = "broken";
    await connect();
    await page.getByText("目前無法取得影像", { exact: true }).waitFor();
    mode = "mjpeg";
    await connect();
    await page.getByText("正在接收影像", { exact: true }).waitFor();
    const beforeRenewal = sessions;
    await page.waitForTimeout(7400);
    assert.ok(
      sessions > beforeRenewal,
      "short-lived media authorization renews"
    );
    await page.getByText("正在接收影像", { exact: true }).waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false,
        "no mobile overflow"
      );
      await page.screenshot({
        path: join(output, `mobile-${width}.png`),
        fullPage: true,
      });
    }
    // Camera failure does not turn off valid printer controls; offline telemetry does.
    await page
      .getByRole("button", { name: "機台範圍已淨空，執行歸零", exact: true })
      .click();
    await page
      .getByText("歸零正在處理，請勿重複操作…", { exact: true })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "機台範圍已淨空，執行歸零", exact: true })
        .isDisabled(),
      true
    );
    await page
      .getByText("已收到歸零操作回應。請再查看現場機台是否已停止移動。", {
        exact: true,
      })
      .waitFor();
    status = "offline";
    await refresh();
    assert.equal(
      await page
        .getByRole("button", { name: "預熱耗材", exact: true })
        .isDisabled(),
      true
    );
    status = "printing";
    phase = "printing";
    await refresh();
    await page
      .getByRole("button", { name: "停止這次列印", exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "保留列印", exact: true }).click();
    assert.equal(
      actions.some((a) => a.action === "cancel"),
      false,
      "cancel confirmation does not send cancel"
    );
    // An in-flight response from an ended slot must not restore its media.
    await page.getByRole("button", { name: "暫停觀看", exact: true }).click();
    mode = "snapshot";
    delay = 800;
    await connect();
    await page.getByText("正在連接站點攝影機", { exact: true }).waitFor();
    phase = "completed";
    await refresh();
    await page.getByRole("heading", { name: "已完成", exact: true }).waitFor();
    assert.equal(
      await page.locator(".printer-camera").count(),
      0,
      "ending a slot removes media"
    );
    const endedFrames = frames;
    await page.waitForTimeout(1200);
    assert.equal(frames, endedFrames);
    assert.equal(
      await page.locator(".camera-screen img, .camera-screen video").count(),
      0,
      "late camera response cannot restore access"
    );
    delay = 0;
    phase = "preparing";
    mode = "snapshot";
    await refresh();
    await page.getByText("正在接收影像", { exact: true }).waitFor();
    await page.getByRole("button", { name: "登出會員", exact: true }).click();
    await page.waitForFunction(
      () => !document.querySelector(".printer-camera")
    );
    assert.equal(
      await page.locator(".camera-screen img, .camera-screen video").count(),
      0,
      "logout removes media"
    );
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify({
        passed,
        output,
        sessions,
        frames,
        actions: actions.map((a) => a.action),
        checks: [
          "queue-lock",
          "unconfigured",
          "loading",
          "snapshot-auth",
          "mjpeg-source",
          "fit",
          "fullscreen",
          "pause",
          "retry",
          "bad-source",
          "renewal",
          "mobile-320/390",
          "pending-command",
          "offline-control-lock",
          "cancel-confirmation",
          "end-slot",
          "late-response-revocation",
          "logout",
        ],
      })
    );
  } finally {
    if (!passed) {
      console.error(
        await page
          .locator(".station-session")
          .innerText()
          .catch(() => "No station page")
      );
      await page
        .screenshot({ path: join(output, "failure.png"), fullPage: true })
        .catch(() => {});
    }
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
