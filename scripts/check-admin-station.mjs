// Isolated browser fixtures only. No real login, printer, email or external AI calls.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const directory = await mkdtemp(path.join(tmpdir(), "admin-station-"));
const app = Fastify();
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL("../frontend-vue/dist/", import.meta.url)),
});
const base = await app.listen({ host: "127.0.0.1", port: 0 });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({ reducedMotion: "reduce" });
context.setDefaultTimeout(15000);
const page = await context.newPage(),
  errors = [],
  actions = [];
page.on("pageerror", (e) => errors.push(e.message));
let role = "Admin",
  failStation = false,
  stationReads = 0;
const reservation = {
  id: "own",
  status: "queued",
  statusLabel: "等待中",
  sequence: 1,
  position: 1,
  estimatedMinutes: 20,
  canControl: false,
  leaseExpiresAt: new Date(Date.now() + 600000).toISOString(),
  printFile: {
    id: "file-own",
    name: "本次排隊模型.gcode",
    material: "3DSTU_PETG",
  },
  history: [],
};
const telemetry = {
  status: "idle",
  nozzle: 240,
  bed: 75,
  homed: true,
  extrusionReady: true,
  position: { x: 10, y: 20, z: 30 },
  progress: 20,
};
const stationState = () => ({
  station: {
    name: "清華大學水木書苑",
    queueLength: 2,
    availability: "依序通知",
    camera: { configured: false },
  },
  reservations: [{ ...reservation }],
  telemetry: { ...telemetry },
});
const staffStation = {
  station: stationState().station,
  readiness: [],
  config: { printerId: "p", profileName: "測試設定", enabled: false },
  printers: [{ id: "p", name: "測試機台" }],
  profiles: [],
  allReservations: [
    {
      id: "attention",
      sequence: 2,
      status: "attention",
      filename: "測試排隊.gcode",
      customerId: "fixture",
      lastError: "機台需現場確認",
    },
  ],
  mail: [],
};
await context.route("**/api/**", async (route) => {
  const url = new URL(route.request().url()),
    p = url.pathname;
  if (p === "/api/auth/me")
    return route.fulfill({
      json: {
        user: {
          id: "staff",
          name: "測試管理員",
          role,
          scopes: role === "Admin" ? ["*"] : [],
          twoFactorEnabled: true,
        },
      },
    });
  if (p === "/api/state")
    return route.fulfill({
      json: {
        printers: [
          { id: "p", name: "Creality Hi", status: "offline", model: "Hi" },
        ],
        queue: [
          {
            id: "j",
            file: "急件模型",
            priority: "Rush",
            status: "queued",
            due: "Today 16:00",
          },
        ],
        todos: [],
        files: [],
        orders: [],
        customers: [],
      },
    });
  if (p === "/api/events/token")
    return route.fulfill({ json: { token: "fixture" } });
  if (p === "/api/member-service/free-print-station") {
    stationReads++;
    return route.fulfill(
      failStation
        ? { status: 400, json: { error: "測試讀取失敗" } }
        : { json: staffStation }
    );
  }
  if (p === "/api/customer-auth/me")
    return route.fulfill({
      json: { customer: { id: "member", name: "測試會員" } },
    });
  if (p.endsWith("/free-print/station"))
    return route.fulfill(
      failStation
        ? { status: 400, json: { error: "狀態更新失敗" } }
        : { json: stationState() }
    );
  if (p.endsWith("/camera-session"))
    return route.fulfill({
      json: { reservationId: "own", camera: { state: "unconfigured" } },
    });
  if (p.endsWith("/action")) {
    const body = route.request().postDataJSON();
    actions.push(body);
    if (body.action === "checkin") {
      reservation.status = "preparing";
      reservation.statusLabel = "準備中";
    }
    if (body.action === "start") {
      reservation.status = "printing";
      reservation.statusLabel = "列印中";
    }
    if (body.action === "release") {
      reservation.status = "completed";
      reservation.statusLabel = "已完成";
      reservation.canControl = false;
    }
    return route.fulfill({ json: stationState() });
  }
  if (p.endsWith("/status") && p.includes("agent"))
    return route.fulfill({ json: { tokens: [] } });
  if (p.endsWith("/tokens") && p.includes("agent"))
    return route.fulfill({ json: { token: "synthetic-test-token" } });
  return route.fulfill({
    json: { tokens: [], requests: [], conversations: [], documents: [] },
  });
});
try {
  await page.goto(base);
  await page.evaluate(() => {
    localStorage.setItem("layerpilot-token", "fixture");
    localStorage.setItem("layerpilot-customer-token", "fixture");
  });
  await page.goto(base + "/#/dashboard");
  await page.reload();
  await page
    .getByRole("heading", { name: "今天的營運，從這裡開始。" })
    .waitFor();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(2300);
    if (width === 390) assert.equal(await page.locator(".mask").count(), 0);
    await page.screenshot({
      path: path.join(directory, `admin-${width}.png`),
      fullPage: true,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      ),
      true
    );
  }
  for (const [name, pathEnd] of [
    ["免費列印站", "/free-print-admin"],
    ["MCP 與建模 Skill", "/agent-tools"],
  ]) {
    await page.goto(base + "/#/dashboard");
    await page
      .locator(".operations-tools")
      .getByRole("link", { name: new RegExp(name) })
      .click();
    await page.waitForURL("**/#" + pathEnd);
    await page
      .getByRole("heading", {
        name: pathEnd.includes("agent") ? "MCP 與建模 Skill" : "免費列印站管理",
        exact: true,
      })
      .waitFor();
  }
  await page
    .getByRole("button", { name: "建立 MCP 連線", exact: true })
    .click();
  await page.getByLabel("MCP 連線設定").waitFor();
  assert.ok(
    (await page.getByLabel("MCP 連線設定").inputValue()).includes(
      "/api/staff-agent/mcp"
    )
  );
  role = "Viewer";
  const previousReads = stationReads;
  await page.goto(base + "/#/dashboard");
  await page.reload();
  await page
    .getByRole("heading", { name: "今天的營運，從這裡開始。" })
    .waitFor();
  assert.equal(
    await page
      .locator('.operations-tools a[href="#/free-print-admin"]')
      .count(),
    0
  );
  assert.equal(stationReads, previousReads);
  console.log(
    "PASS admin dashboard, new destinations, staff MCP URL, viewer restrictions and mobile bounds"
  );
  await page.goto(base + "/#/portal/free-print");
  await page
    .getByRole("button", { name: "取消這次排隊", exact: true })
    .waitFor();
  assert.equal(await page.locator(".printer-camera").count(), 0);
  assert.equal(
    await page.getByRole("button", { name: "進料 10 mm", exact: true }).count(),
    0
  );
  reservation.status = "notified";
  reservation.statusLabel = "已通知";
  reservation.canControl = true;
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await page
    .getByRole("button", { name: "我已到場，開始準備", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "選擇本次排隊的檔案", exact: true })
    .waitFor();
  const start = page.getByRole("button", {
    name: "確認完成，開始列印",
    exact: true,
  });
  assert.equal(await start.isDisabled(), true);
  await page.getByRole("radio").check();
  await page.getByText("需要調整位置？展開各軸微調", { exact: true }).click();
  await page
    .getByRole("button", { name: "X 軸增加 1 mm", exact: true })
    .click();
  assert.equal(actions.at(-1).axis, "x");
  assert.equal(actions.at(-1).distance, 1);
  await page.getByRole("button", { name: "進料 10 mm", exact: true }).click();
  assert.equal(actions.at(-1).action, "load");
  for (const label of [
    "平台上的列印件已移除，平台已清空。",
    "指定耗材已就位，進料正常。",
    "手、工具與雜物已離開機台移動範圍。",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({
    path: path.join(directory, "member-preparing-390.png"),
    fullPage: true,
  });
  await start.click();
  await page.getByRole("button", { name: "暫停列印", exact: true }).waitFor();
  assert.deepEqual(
    actions.slice(-2).map((a) => a.action),
    ["checks", "start"]
  );
  assert.equal(actions.at(-1).selectedFileId, "file-own");
  assert.equal(
    await page.getByRole("button", { name: "進料 10 mm", exact: true }).count(),
    0
  );
  failStation = true;
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await page
    .locator(".station-error")
    .getByText("狀態更新失敗", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".printer-camera").count(), 0);
  failStation = false;
  reservation.status = "preparing";
  reservation.leaseExpiresAt = new Date(Date.now() - 1000).toISOString();
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await page.waitForTimeout(300);
  assert.equal(
    await page.getByRole("button", { name: "進料 10 mm", exact: true }).count(),
    0
  );
  reservation.status = "awaiting_removal";
  reservation.statusLabel = "等待取件";
  await page.getByRole("button", { name: "更新狀態", exact: true }).click();
  await page
    .getByLabel("我已取走列印件，並清空平台。", { exact: true })
    .check();
  await page
    .getByRole("button", { name: "確認取件，交給下一位", exact: true })
    .click();
  await page.getByRole("heading", { name: "已完成", exact: true }).waitFor();
  assert.equal(await page.locator(".printer-camera").count(), 0);
  assert.deepEqual(errors, []);
  console.log(
    "PASS queue/check-in/file/jog/load/start/printing/stale/expiry/release controls and zero JS errors"
  );
  console.log("Screenshots: " + directory);
} finally {
  await browser.close();
  await app.close();
}
