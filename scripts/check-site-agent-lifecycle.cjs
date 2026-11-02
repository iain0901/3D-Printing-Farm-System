// Local fixtures only: no OpenAI calls, permanent credentials or hardware commands.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const base = process.env.BASE_URL || "http://127.0.0.1:8811";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
  throw new Error("Local-only test");
async function main() {
  const response = await fetch(base + "/api/customer-auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Lifecycle fixture",
      email: `lifecycle-${Date.now()}@example.test`,
      password: "lifecycle-test-123",
    }),
  });
  assert.equal(response.status, 201);
  const { token } = await response.json();
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
  });
  const page = await browser.newPage();
  const errors = [];
  const evidence = mkdtempSync(join(tmpdir(), "3drfm-continuation-evidence-"));
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.addInitScript((token) => {
      localStorage.setItem("layerpilot-customer-token", token);
      sessionStorage.setItem("3drfm-purpose-asked", "1");
    }, token);
    await page.route("**/api/customer/agent/realtime-session", (r) =>
      r.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ value: "local-fixture" }),
      })
    );
    await page.route("https://api.openai.com/v1/realtime/calls", (r) =>
      r.fulfill({
        contentType: "application/sdp",
        body: "fixture-sdp",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST,OPTIONS",
          "access-control-allow-headers": "authorization,content-type",
        },
      })
    );
    await page.goto(base + "/#/cloud-slicer");
    await page
      .getByRole("button", { name: "詢問列印助理", exact: true })
      .click();
    await page.evaluate(() => {
      window.testVoice = {
        microphones: [],
        peers: [],
        holdOffer: false,
        holdRemote: false,
      };
      window.Audio = class {
        play() {
          if (window.testVoice.holdAudio) {
            window.testVoice.holdAudio = false;
            return new Promise((_, reject) => {
              window.testVoice.rejectAudio = reject;
            });
          }
          return Promise.resolve();
        }
        pause() {}
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value: () =>
          new Promise((resolve) => {
            const m = {
              stopped: false,
              resolve: () =>
                resolve({
                  getTracks: () => [
                    {
                      stop: () => {
                        m.stopped = true;
                      },
                    },
                  ],
                }),
            };
            window.testVoice.microphones.push(m);
          }),
      });
      window.RTCPeerConnection = class {
        constructor() {
          this.id = window.testVoice.peers.length;
          window.testVoice.peers.push(this);
        }
        addTrack() {}
        createDataChannel() {
          return (this.channel = { send: () => {} });
        }
        async createOffer() {
          if (window.testVoice.holdOffer) {
            window.testVoice.holdOffer = false;
            await new Promise((resolve) => {
              this.releaseOffer = resolve;
            });
          }
          return { type: "offer", sdp: "fixture" };
        }
        async setLocalDescription() {}
        async setRemoteDescription() {
          if (window.testVoice.holdRemote) {
            window.testVoice.holdRemote = false;
            await new Promise((resolve) => {
              this.releaseRemote = resolve;
            });
          }
          this.channel.onopen();
        }
        close() {
          this.closed = true;
          this.connectionState = "closed";
        }
      };
    });
    const call = () =>
      page.getByRole("button", { name: "語音通話", exact: true }).click();
    const hangup = () =>
      page.getByRole("button", { name: "掛斷", exact: true }).click();
    const mic = async (index) => {
      await page.waitForFunction(
        (i) => window.testVoice.microphones.length > i,
        index
      );
      await page.evaluate(
        (i) => window.testVoice.microphones[i].resolve(),
        index
      );
    };
    const connected = () =>
      page.getByText("語音通話中 · 麥克風開啟", { exact: true }).waitFor();
    await call();
    await page.waitForFunction(() => window.testVoice.microphones.length === 1);
    await hangup();
    await call();
    await mic(1);
    await connected();
    await page.evaluate(() => window.testVoice.microphones[0].resolve());
    await page.waitForFunction(() => window.testVoice.microphones[0].stopped);
    assert.equal(
      await page.evaluate(() => window.testVoice.peers[0].closed || false),
      false
    );
    await hangup();
    await page.evaluate(() => {
      window.testVoice.holdOffer = true;
    });
    await call();
    await mic(2);
    await page.waitForFunction(() => !!window.testVoice.peers[1]?.releaseOffer);
    await hangup();
    await call();
    await mic(3);
    await connected();
    await page.evaluate(() => {
      const p = window.testVoice.peers[1];
      p.releaseOffer();
      p.onconnectionstatechange();
      p.ontrack({ streams: [{}] });
    });
    assert.equal(
      await page.evaluate(() => window.testVoice.peers[2].closed || false),
      false
    );
    await hangup();
    await page.evaluate(() => {
      window.testVoice.holdRemote = true;
    });
    await call();
    await mic(4);
    await page.waitForFunction(
      () => !!window.testVoice.peers[3]?.releaseRemote
    );
    await hangup();
    await call();
    await mic(5);
    await connected();
    await page.evaluate(() => window.testVoice.peers[3].releaseRemote());
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(() => window.testVoice.peers[4].closed || false),
      false
    );
    await page.evaluate(() => {
      window.testVoice.holdAudio = true;
      window.testVoice.peers[4].ontrack({ streams: [{}] });
    });
    await hangup();
    await call();
    await mic(6);
    await connected();
    await page.evaluate(() =>
      window.testVoice.rejectAudio(new Error("fixture audio canceled"))
    );
    await page.waitForTimeout(50);
    assert.equal(
      await page
        .getByRole("button", { name: "恢復語音播放", exact: true })
        .count(),
      0
    );
    await hangup();
    let releaseA, releaseB;
    await page.route("**/api/customer/agent/review", async (route) => {
      const purpose = route.request().postDataJSON().purpose;
      await new Promise((resolve) => {
        if (purpose === "A") releaseA = resolve;
        else releaseB = resolve;
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          verdict: "discuss",
          message: `fixture-${purpose}`,
          suggestedInfill: purpose === "A" ? 10 : 20,
        }),
      });
    });
    const trigger = (purpose) =>
      page.evaluate(
        (p) =>
          window.dispatchEvent(
            new CustomEvent("3drfm:before-slice", {
              detail: {
                purpose: p,
                settings: { infill: 5, walls: 2, material: "PETG" },
                resolve: (value) => {
                  window["review" + p] = value;
                },
              },
            })
          ),
        purpose
      );
    await trigger("A");
    while (!releaseA) await page.waitForTimeout(20);
    await trigger("B");
    while (!releaseB) await page.waitForTimeout(20);
    releaseA();
    await page.waitForTimeout(150);
    assert.equal(await page.getByText("fixture-A", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.reviewA.proceed), false);
    releaseB();
    await page.getByText("fixture-B", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "依目前設定繼續切片", exact: true })
      .click();
    assert.equal(await page.evaluate(() => window.reviewB.proceed), true);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        passed: true,
        evidence,
        checks: [
          "cancel-before-microphone",
          "late-microphone-cleanup",
          "late-offer",
          "stale-peer-events",
          "late-remote-description",
          "stale-audio-play-rejection",
          "overlapping-review-isolation",
        ],
      })
    );
  } finally {
    await browser.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
