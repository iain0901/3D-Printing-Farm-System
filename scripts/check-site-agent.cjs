const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");
const base = process.env.BASE_URL || "http://127.0.0.1:8810";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function main() {
  const response = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "助理測試",
      email: `agent-${Date.now()}@example.test`,
      password: "agent-browser-123",
    }),
  });
  assert.equal(response.status, 201);
  const { token } = await response.json();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const output = mkdtempSync(join(tmpdir(), "3drfm-agent-ui-"));
  const errors = [];
  let passed = false;
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.addInitScript(
      (token) => localStorage.setItem("layerpilot-customer-token", token),
      token
    );
    await page.goto(base + "/#/portal/workspace?section=agent");
    await page
      .getByRole("heading", { name: "MCP 與模型 skills", exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "建立 MCP 連線", exact: true })
      .click();
    const config = JSON.parse(
      await page.getByLabel("MCP 連線設定", { exact: true }).inputValue()
    );
    assert.equal(
      new URL(config.mcpServers["3drfm"].url).pathname,
      "/api/customer/agent/mcp"
    );
    await page.getByRole("button", { name: "隱藏憑證", exact: true }).click();
    assert.equal(
      await page.getByLabel("MCP 連線設定", { exact: true }).count(),
      0
    );
    await page.getByRole("button", { name: "撤銷連線", exact: true }).click();
    await page.getByText(/我的 Agent · 已撤銷/).waitFor();
    await page
      .getByRole("button", { name: "下載 SKILL.md", exact: true })
      .click();
    await page.goto(base + "/#/cloud-slicer");
    const { testStl } = await import(
      pathToFileURL(resolve(__dirname, "../api/test-helpers/stl.mjs"))
    );
    await page.getByLabel("選擇 STL 模型", { exact: true }).setInputFiles({
      name: "agent-test.stl",
      mimeType: "application/octet-stream",
      buffer: testStl(),
    });
    await page.locator(".object-row").first().waitFor();
    const launcher = page.getByRole("button", {
      name: "詢問列印助理",
      exact: true,
    });
    if (await launcher.count()) await launcher.click();
    await page.route("**/api/customer/agent/chat", async (route) => {
      const body = route.request().postDataJSON();
      const target = body.context.controls.find((x) =>
        /切片填充密度/.test(x.label)
      );
      assert.ok(target, "actual slicer field is exposed");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          message: "將目前平台的填充修改成20%，請確認。",
          actions: [{ target: target.id, operation: "fill", value: "20" }],
        }),
      });
    });
    await page
      .getByLabel("給助理的訊息", { exact: true })
      .fill("請把填充修改成20%");
    await page.getByRole("button", { name: "傳送", exact: true }).click();
    await page.getByRole("button", { name: "確認操作", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="切片填充密度"]')?.value === "20"
    );
    // Exercise voice tool wiring with an explicit fake peer; no microphone/audio provider is contacted.
    await page.route("**/api/customer/agent/realtime-session", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ value: "local-voice-fixture" }),
      })
    );
    await page.route("https://api.openai.com/v1/realtime/calls", (r) =>
      r.fulfill({
        contentType: "application/sdp",
        body: "local-sdp-fixture",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "authorization,content-type",
        },
      })
    );
    await page.evaluate(() => {
      window.__agentVoiceEvents = [];
      window.__agentMicStops = 0;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: async () => ({
          getTracks: () => [{ stop: () => window.__agentMicStops++ }],
        }),
      });
      window.RTCPeerConnection = class {
        addTrack() {}
        createDataChannel() {
          return (window.__agentChannel = {
            send: (text) => window.__agentVoiceEvents.push(JSON.parse(text)),
          });
        }
        async createOffer() {
          return { type: "offer", sdp: "local-offer" };
        }
        async setLocalDescription() {}
        async setRemoteDescription() {
          window.__agentChannel.onopen();
        }
        close() {
          this.connectionState = "closed";
        }
      };
    });
    await page.getByRole("button", { name: "語音通話", exact: true }).click();
    await page.getByRole("button", { name: "掛斷", exact: true }).waitFor();
    await page.getByRole("button", { name: "麥克風靜音", exact: true }).click();
    await page.getByRole("button", { name: "開啟麥克風", exact: true }).click();
    await page.evaluate(() =>
      window.__agentChannel.onmessage({
        data: JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "get_page_context",
          call_id: "fixture-context",
          arguments: "{}",
        }),
      })
    );
    await page.evaluate(() => {
      const result = window.__agentVoiceEvents.find(
        (e) => e.item?.call_id === "fixture-context"
      );
      const target = JSON.parse(result.item.output).controls.find((c) =>
        /切片填充密度/.test(c.label)
      );
      window.__agentChannel.onmessage({
        data: JSON.stringify({
          type: "response.function_call_arguments.done",
          name: "propose_ui_action",
          call_id: "fixture-action",
          arguments: JSON.stringify({
            target: target.id,
            operation: "fill",
            value: "25",
          }),
        }),
      });
    });
    await page.getByRole("button", { name: "確認操作", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="切片填充密度"]')?.value === "25"
    );
    await page.getByRole("button", { name: "掛斷", exact: true }).click();
    assert.ok(await page.evaluate(() => window.__agentMicStops > 0));
    await page
      .getByRole("button", { name: "關閉列印助理", exact: true })
      .click();
    // A real slicer button triggers a mocked judgement; applying advice returns to editing.
    await page.route("**/api/customer/agent/review", async (r) => {
      assert.equal(r.request().postDataJSON().purpose, "室內花盆支架");
      await r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          verdict: "discuss",
          message: "此為測試建議，不能保證承重。",
          suggestedInfill: 15,
        }),
      });
    });
    await page
      .getByLabel("模型用途（選填）", { exact: false })
      .fill("室內花盆支架");
    await page.getByLabel("切片填充密度", { exact: true }).fill("5");
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page
      .getByRole("button", { name: "套用建議後返回檢查", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector('[aria-label="切片填充密度"]')?.value === "15"
    );
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
                accessToken: "local-fixture",
                slicingQuote: {
                  id: "agent-completed-fixture",
                  status: "completed",
                  estimatedMinutes: 5,
                  totalGrams: 1,
                  modelGrams: 1,
                  supportGrams: 0,
                  otherGrams: 0,
                  createdAt: new Date().toISOString(),
                },
              }
        ),
      })
    );
    await page.route("**/api/customer/agent/illustration", async (r) => {
      assert.ok(
        r.request().postDataJSON().image.startsWith("data:image/png;base64,")
      );
      await r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          image:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB2kAAAAASUVORK5CYII=",
        }),
      });
    });
    await page
      .getByRole("checkbox", { name: /切片完成後自動生成 AI 成品示意/ })
      .check();
    await page.getByRole("button", { name: /^開始切片/ }).click();
    await page
      .getByRole("button", { name: "依目前設定繼續切片", exact: true })
      .click();
    await page
      .getByAltText("AI 生成的 FDM 成品示意", { exact: true })
      .waitFor();
    if (await launcher.count()) await launcher.click();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 950 });
      const panel = await page.locator(".agent-window").boundingBox();
      assert.ok(
        panel.x >= 0 && panel.x + panel.width <= width,
        "assistant panel fits viewport, including padding"
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth
        ),
        false
      );
      await page.screenshot({
        path: join(output, `agent-${width}.png`),
        fullPage: true,
      });
    }
    await page
      .getByRole("button", { name: "關閉列印助理", exact: true })
      .click();
    assert.deepEqual(errors, []);
    passed = true;
    console.log(
      JSON.stringify({
        passed: true,
        output,
        checks: [
          "MCP-create-hide-revoke",
          "skill-download",
          "actual-Vue-infill-update",
          "voice-tool-proposal-and-microphone-cleanup-fixture",
          "purpose-review-apply-and-continue-fixture",
          "automatic-illustration-from-real-model-capture-fixture",
          "320/390/1440px",
          "close-assistant",
        ],
      })
    );
  } finally {
    if (!passed) {
      console.error(
        await page
          .locator(".site-agent")
          .innerText()
          .catch(() => "No agent")
      );
      await page.screenshot({
        path: join(output, "failure.png"),
        fullPage: true,
      });
    }
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
