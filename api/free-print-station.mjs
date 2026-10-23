import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { fetchBridgeStatus } from "./hardware-bridge.mjs";
import { stationHardwareCommand } from "./free-print-hardware.mjs";

export const FREE_PRINT_COLLECTIONS = [
  "freePrintStations",
  "freePrintReservations",
  "freePrintCommands",
  "freePrintMail",
];
export function freePrintOwnsPrinter(data, printerId) {
  return (data.freePrintStations || []).some(
    (s) =>
      s.printerId === printerId &&
      (s.enabled ||
        (data.freePrintReservations || []).some(
          (r) =>
            r.stationId === s.id &&
            !["queued", "completed", "cancelled", "expired"].includes(r.status)
        ))
  );
}
const activeStates = [
  "notified",
  "preparing",
  "starting",
  "printing",
  "paused",
  "awaiting_removal",
  "attention",
];
const terminalStates = ["completed", "cancelled", "expired"];
const labels = {
  queued: "等待使用",
  notified: "輪到你了，請到站點",
  preparing: "準備列印",
  starting: "正在送交機台",
  printing: "列印中",
  paused: "已暫停",
  awaiting_removal: "列印結束，請取件",
  completed: "已完成",
  cancelled: "已取消",
  expired: "到場時間已過",
  attention: "請站點人員協助",
};
const fail = (code, message) => {
  throw Object.assign(new Error(message), { statusCode: code });
};
const configSchema = z
  .object({
    enabled: z.boolean(),
    printerId: z.string().max(100),
    profileName: z.string().max(500),
    nozzleTemperature: z.number().int().min(180).max(280),
    bedTemperature: z.number().int().min(0).max(110),
    minimumExtrudeTemperature: z.number().int().min(170).max(260),
    releaseBedTemperature: z.number().min(25).max(50).default(40),
    arrivalMinutes: z.number().int().min(5).max(120).default(20),
    preparationMinutes: z.number().int().min(5).max(120).default(30),
  })
  .strict();
function owns(item, customer) {
  return (
    item.customerId === customer.id &&
    item.workspaceId === (customer.workspaceId || "ws-default")
  );
}
function validToken(job, token) {
  if (
    typeof token !== "string" ||
    token.length > 200 ||
    !job.publicAccessTokenHash
  )
    return false;
  const a = Buffer.from(createHash("sha256").update(token).digest("hex")),
    b = Buffer.from(job.publicAccessTokenHash);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function registerFreePrintStation(
  app,
  {
    database,
    customerFromRequest,
    readFile,
    emailClient,
    fetchStatus = fetchBridgeStatus,
    hardwareCommand = stationHardwareCommand,
    clock = () => Date.now(),
    intervalMs = 5000,
  }
) {
  const data = () => database.data;
  const now = () => new Date(clock()).toISOString();
  function ensure() {
    for (const name of FREE_PRINT_COLLECTIONS) data()[name] ||= [];
    if (!data().freePrintStations.some((s) => s.id === "nthu-shuimu"))
      data().freePrintStations.push({
        id: "nthu-shuimu",
        workspaceId: "ws-default",
        name: "清華大學水木書苑",
        enabled: false,
        printerId: "",
        profileName: "",
        nozzleTemperature: 0,
        bedTemperature: 0,
        minimumExtrudeTemperature: 180,
        releaseBedTemperature: 40,
        arrivalMinutes: 20,
        preparationMinutes: 30,
      });
  }
  ensure();
  let tail = Promise.resolve();
  const serial = (fn) => {
    const next = tail.then(() => {
      ensure();
      return fn();
    });
    tail = next.catch(() => {});
    return next;
  };
  function station() {
    ensure();
    return data().freePrintStations.find((s) => s.id === "nthu-shuimu");
  }
  function setup(s) {
    const p = data().printers.find(
      (p) =>
        p.id === s.printerId &&
        (p.workspaceId || "ws-default") === s.workspaceId
    );
    const bridge = data().bridges.find(
      (b) =>
        b.printerId === p?.id &&
        b.enabled &&
        ["moonraker", "octoprint"].includes(b.kind) &&
        (b.workspaceId || "ws-default") === s.workspaceId
    );
    const reasons = [];
    if (!s.enabled) reasons.push("站點尚未開放");
    if (!p || !bridge) reasons.push("尚未設定支援的機台連線");
    if (
      !s.profileName ||
      !s.nozzleTemperature ||
      s.minimumExtrudeTemperature > s.nozzleTemperature
    )
      reasons.push("尚未完成 PETG 列印設定");
    if (!emailClient) reasons.push("尚未設定 Email 寄送");
    return { printer: p, bridge, reasons };
  }
  function records() {
    const s = station();
    return data().freePrintReservations.filter(
      (r) => r.stationId === s.id && r.workspaceId === s.workspaceId
    );
  }
  function active() {
    return records().find((r) => activeStates.includes(r.status));
  }
  function event(r, type, title, body) {
    const key = `free-print:${r.id}:${type}`;
    data().memberNotifications ||= [];
    if (!data().memberNotifications.some((n) => n.sourceKey === key))
      data().memberNotifications.unshift({
        id: randomUUID(),
        customerId: r.customerId,
        workspaceId: r.workspaceId,
        title,
        body,
        link: "/portal/free-print",
        sourceKey: key,
        createdAt: now(),
        readAt: null,
      });
    if (!data().freePrintMail.some((m) => m.key === key))
      data().freePrintMail.push({
        id: randomUUID(),
        key,
        reservationId: r.id,
        customerId: r.customerId,
        workspaceId: r.workspaceId,
        subject: `3DRFM｜${title}`,
        body,
        status: "pending",
        attempts: 0,
        nextAttemptAt: now(),
      });
  }
  function transition(r, status) {
    r.status = status;
    r.updatedAt = now();
    r.history ||= [];
    r.history.push({ status, at: now() });
  }
  let mailRunning = null,
    mailClosing = false;
  function scheduleMail() {
    if (!emailClient || mailClosing) return;
    if (!mailRunning)
      mailRunning = Promise.resolve()
        .then(deliver)
        .catch(() => {})
        .finally(() => {
          mailRunning = null;
          if (
            data().freePrintMail.some(
              (m) =>
                ["pending", "retry"].includes(m.status) &&
                Date.parse(m.nextAttemptAt) <= clock()
            )
          )
            scheduleMail();
        });
  }
  async function deliver() {
    if (!emailClient) return;
    for (const mail of data()
      .freePrintMail.filter(
        (m) =>
          ["pending", "retry"].includes(m.status) &&
          Date.parse(m.nextAttemptAt) <= clock()
      )
      .slice(0, 1)) {
      const c = data().customers.find(
        (c) =>
          c.id === mail.customerId &&
          (c.workspaceId || "ws-default") === mail.workspaceId
      );
      if (!c?.email) {
        mail.status = "failed";
        mail.lastError = "找不到會員 Email";
        continue;
      }
      mail.status = "sending";
      mail.claimedAt = now();
      mail.attempts++;
      await database.write();
      try {
        await emailClient.send({
          to: c.email,
          subject: mail.subject,
          text: `${
            mail.body
          }\n\n請登入 3DRFM 會員中心的「免費列印」查看操作步驟。${
            process.env.LAYERPILOT_PUBLIC_URL
              ? "\n" +
                process.env.LAYERPILOT_PUBLIC_URL.replace(/\/+$/, "") +
                "/#/portal/free-print"
              : ""
          }`,
        });
        mail.status = "sent";
        mail.sentAt = now();
      } catch {
        mail.status = mail.attempts >= 5 ? "failed" : "retry";
        mail.nextAttemptAt = new Date(
          clock() + Math.min(3600000, 30000 * 2 ** mail.attempts)
        ).toISOString();
        mail.lastError = "寄送失敗";
      }
      await database.write();
    }
  }
  async function telemetry() {
    const s = station(),
      { bridge, printer, reasons } = setup(s);
    if (!bridge || !printer) return null;
    try {
      const status = await fetchStatus(bridge, {
        fetchImpl: (url, init) =>
          fetch(url, { ...init, signal: AbortSignal.timeout(8000) }),
      });
      s.telemetry = { ...status, raw: undefined, at: now() };
      Object.assign(
        printer,
        Object.fromEntries(
          [
            "status",
            "progress",
            "nozzle",
            "bed",
            "targetNozzle",
            "targetBed",
            "job",
          ]
            .filter((k) => status[k] !== undefined)
            .map((k) => [k, status[k]])
        )
      );
      return s.telemetry;
    } catch {
      s.telemetry = { status: "offline", at: now() };
      printer.status = "offline";
      return s.telemetry;
    }
  }
  function matches(r, t) {
    return typeof t?.job === "string" && t.job.split("/").at(-1) === r.filename;
  }
  async function tickInternal() {
    const s = station();
    if (!s.enabled && !active()) {
      scheduleMail();
      return;
    }
    const t = await telemetry();
    let current = active();
    if (current) {
      if (
        ["notified", "preparing"].includes(current.status) &&
        Date.parse(current.leaseExpiresAt) <= clock()
      ) {
        // Never hand off a hot/occupied machine just because a timer elapsed.
        if (
          t?.status === "idle" &&
          t.nozzle < 60 &&
          t.bed <= s.releaseBedTemperature
        ) {
          transition(current, "expired");
          event(
            current,
            "expired",
            "免費列印時段已過",
            "你未在時限內完成準備，可重新排隊。"
          );
          current = null;
        } else {
          transition(current, "attention");
          event(
            current,
            "attention",
            "需要站點協助",
            "目前機台仍有溫度或狀態未確認，請聯絡站點人員。"
          );
        }
      } else if (
        ["starting", "printing", "paused"].includes(current.status) &&
        t
      ) {
        if (matches(current, t) && ["printing", "paused"].includes(t.status)) {
          current.observedPrintingAt ||= now();
          transitionIfChanged(current, t.status);
        } else if (
          matches(current, t) &&
          current.observedPrintingAt &&
          (t.jobState === "complete" ||
            (t.status === "idle" && t.progress >= 99))
        ) {
          transition(current, "awaiting_removal");
          current.finishedAt = now();
          event(
            current,
            "finished",
            "列印完成，請儘快取件",
            "你的列印已完成。請等待平台冷卻、取下列印件並清空平台，再於網站確認，下一位才能開始使用。"
          );
        } else if (
          t.status === "error" ||
          t.jobState === "error" ||
          t.jobState === "cancelled" ||
          (current.observedPrintingAt &&
            t.status === "idle" &&
            !matches(current, t))
        ) {
          transition(current, "attention");
          event(
            current,
            "attention",
            "列印狀態需要確認",
            "請到機台確認列印狀態，並聯絡站點人員；平台確認清空後才會通知下一位。"
          );
        } else if (
          current.status === "starting" &&
          clock() - Date.parse(current.startRequestedAt) > 120000 &&
          t.status !== "offline"
        ) {
          transition(current, "attention");
          event(
            current,
            "attention",
            "無法確認列印是否啟動",
            "請先查看機台並聯絡站點，不要重複啟動列印。"
          );
        }
      }
    }
    if (
      !active() &&
      !setup(s).reasons.length &&
      t?.status === "idle" &&
      t.nozzle < 60 &&
      t.bed <= s.releaseBedTemperature
    ) {
      const next = records()
        .filter((r) => r.status === "queued")
        .sort((a, b) => a.sequence - b.sequence)[0];
      if (next) {
        transition(next, "notified");
        next.notifiedAt = now();
        next.leaseExpiresAt = new Date(
          clock() + s.arrivalMinutes * 60000
        ).toISOString();
        event(
          next,
          "turn",
          "輪到你使用免費列印機",
          "現在可以到清華大學水木書苑列印。請在通知期限內到場，登入後依步驟準備並開始列印。"
        );
      }
    }
    for (const mail of data().freePrintMail)
      if (
        mail.status === "sending" &&
        clock() - Date.parse(mail.claimedAt) > 300000
      ) {
        mail.status = "retry";
        mail.nextAttemptAt = now();
      }
    await database.write();
    scheduleMail();
    await database.write();
  }
  function transitionIfChanged(r, status) {
    if (r.status !== status) transition(r, status);
  }
  async function publicState(customer, staff = false) {
    const s = station(),
      { reasons } = setup(s);
    const list = records(),
      current = active();
    const own = list
      .filter((r) => owns(r, customer))
      .map((r) => ({
        id: r.id,
        status: r.status,
        statusLabel: labels[r.status],
        createdAt: r.createdAt,
        sequence: r.sequence,
        position:
          r.status === "queued"
            ? list.filter(
                (x) => x.status === "queued" && x.sequence < r.sequence
              ).length + 1
            : 0,
        leaseExpiresAt: r.leaseExpiresAt,
        estimatedMinutes: r.estimatedMinutes,
        finishedAt: r.finishedAt,
        checks: r.checks || {},
        lastError: r.lastError,
        history: r.history,
        canControl: r.id === current?.id && !terminalStates.includes(r.status),
        email: data()
          .freePrintMail.filter((m) => m.reservationId === r.id)
          .map((m) => ({ subject: m.subject, status: m.status })),
      }));
    return {
      station: {
        id: s.id,
        name: s.name,
        open: !reasons.length,
        availability: reasons.length
          ? "站點尚未開放，請稍後再查看。"
          : current
          ? "有人使用中，依序通知。"
          : "可排隊使用",
        queueLength: list.filter((r) => r.status === "queued").length,
      },
      reservations: own,
      telemetry:
        current && owns(current, customer) && s.telemetry
          ? {
              ...s.telemetry,
              extrusionReady:
                s.telemetry.nozzle >= s.minimumExtrudeTemperature &&
                s.telemetry.nozzle <= s.nozzleTemperature + 15,
              minimumExtrudeTemperature: s.minimumExtrudeTemperature,
              homed: !!current.homedAt,
            }
          : null,
      ...(staff
        ? {
            config: { ...s, telemetry: undefined },
            readiness: reasons,
            printers: data()
              .printers.filter(
                (p) => (p.workspaceId || "ws-default") === s.workspaceId
              )
              .map((p) => ({ id: p.id, name: p.name })),
            profiles: [
              ...new Set(
                data()
                  .slicingQuotes.filter(
                    (j) =>
                      j.workspaceId === s.workspaceId &&
                      j.purpose === "free-print" &&
                      j.status === "completed"
                  )
                  .map((j) => j.profileName)
              ),
            ],
            allReservations: list.map((r) => ({ ...r, sliceToken: undefined })),
            mail: data().freePrintMail.map((m) => ({
              id: m.id,
              status: m.status,
              attempts: m.attempts,
              subject: m.subject,
              reservationId: m.reservationId,
            })),
          }
        : {}),
    };
  }
  function route(method, path, handler, staff = false) {
    app.route({
      method,
      url: path,
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
      handler: async (request, reply) =>
        serial(async () => {
          const customer = staff
            ? request.user
            : customerFromRequest(database, request).customer;
          if (!customer) return reply.code(401).send({ error: "請先登入會員" });
          if (staff && !["Owner", "Admin"].includes(customer.role))
            return reply.code(403).send({ error: "僅站點管理員可設定" });
          reply.header("cache-control", "no-store");
          try {
            return await handler(request, reply, customer);
          } catch (e) {
            return reply
              .code(e instanceof z.ZodError ? 400 : e.statusCode || 502)
              .send({
                error: e instanceof z.ZodError ? "請檢查操作欄位" : e.message,
              });
          }
        }),
    });
  }
  const root = "/api/customer/workspace/free-print";
  route("GET", `${root}/station`, async (req, reply, c) => {
    await tickInternal();
    return publicState(c);
  });
  route("POST", `${root}/reservations`, async (req, reply, c) => {
    const input = z
      .object({
        slicingQuoteId: z.string().max(100),
        sliceToken: z.string().max(200),
        stationId: z.literal("nthu-shuimu"),
      })
      .strict()
      .parse(req.body);
    const s = station(),
      job = data().slicingQuotes.find(
        (j) => j.id === input.slicingQuoteId && j.workspaceId === s.workspaceId
      );
    if ((c.workspaceId || "ws-default") !== s.workspaceId)
      fail(403, "此站點不屬於你的工作區。");
    if (
      !job ||
      !validToken(job, input.sliceToken) ||
      job.purpose !== "free-print" ||
      job.stationId !== s.id ||
      job.material !== "PETG" ||
      job.status !== "completed" ||
      !job.gcodeFileId
    )
      fail(400, "請先完成此站點的單色 PETG 切片。");
    const existing = records().find(
      (r) => owns(r, c) && !terminalStates.includes(r.status)
    );
    if (existing) {
      if (existing.slicingQuoteId === job.id)
        return { reservationId: existing.id, ...(await publicState(c)) };
      fail(409, "你已有免費列印排隊或使用中的時段。");
    }
    if (setup(s).reasons.length) fail(409, "站點尚未開放排隊，請稍後再試。");
    if (job.profileName !== s.profileName)
      fail(409, "此切片設定與現場機台不一致，請依站點設定重新切片。");
    const r = {
      id: randomUUID(),
      stationId: s.id,
      workspaceId: s.workspaceId,
      customerId: c.id,
      slicingQuoteId: job.id,
      gcodeFileId: job.gcodeFileId,
      profileName: job.profileName,
      estimatedMinutes: job.estimatedMinutes,
      status: "queued",
      sequence: Math.max(0, ...records().map((r) => r.sequence)) + 1,
      createdAt: now(),
      updatedAt: now(),
      checks: {},
      history: [],
    };
    r.filename = `3drfm-free-${r.id}.gcode`;
    records();
    data().freePrintReservations.push(r);
    transition(r, "queued");
    event(
      r,
      "queued",
      "已加入免費列印排隊",
      "已收到你的列印工作，輪到你時會寄 Email 通知，請先不要操作機台。"
    );
    await database.write();
    await tickInternal();
    return reply
      .code(201)
      .send({ reservationId: r.id, ...(await publicState(c)) });
  });
  route("POST", `${root}/reservations/:id/action`, async (req, reply, c) => {
    const input = z
      .object({
        action: z.enum([
          "checkin",
          "home",
          "jog",
          "preheat",
          "cooldown",
          "load",
          "unload",
          "checks",
          "start",
          "pause",
          "resume",
          "cancel",
          "release",
        ]),
        requestId: z.string().uuid(),
        axis: z.enum(["x", "y", "z"]).optional(),
        distance: z
          .union([z.literal(-10), z.literal(-1), z.literal(1), z.literal(10)])
          .optional(),
        checks: z
          .object({
            bedClear: z.boolean(),
            filamentReady: z.boolean(),
            areaClear: z.boolean(),
          })
          .optional(),
      })
      .strict()
      .parse(req.body);
    const r = records().find((r) => r.id === req.params.id && owns(r, c));
    if (!r) fail(404, "找不到你的使用時段");
    const previous = data().freePrintCommands.find(
      (x) => x.requestId === input.requestId && x.reservationId === r.id
    );
    if (previous) {
      if (previous.action !== input.action) fail(409, "操作編號已使用");
      return { command: previous, ...(await publicState(c)) };
    }
    if (input.action === "cancel" && r.status === "queued") {
      transition(r, "cancelled");
      await database.write();
      return publicState(c);
    }
    if (active()?.id !== r.id) fail(403, "尚未輪到你的時段，無法控制機台。");
    const s = station(),
      ready = setup(s);
    if (!ready.bridge || !s.enabled)
      fail(409, "機台目前暫停操作，請聯絡站點。");
    const t = await telemetry();
    if (!t || t.status === "offline")
      fail(409, "無法確認機台連線，請稍後再試。");
    const expires =
      ["notified", "preparing"].includes(r.status) &&
      Date.parse(r.leaseExpiresAt) <= clock();
    if (expires) {
      await tickInternal();
      fail(409, "使用時段已過，請重新排隊。");
    }
    if (input.action === "cancel" && r.status === "notified") {
      if (
        t.status !== "idle" ||
        t.nozzle >= 60 ||
        t.bed > s.releaseBedTemperature
      )
        fail(409, "機台狀態需先確認，請聯絡站點。");
      transition(r, "cancelled");
      await database.write();
      await tickInternal();
      return publicState(c);
    }
    if (input.action === "checkin") {
      if (r.status !== "notified") fail(409, "目前無法報到");
      if (t.status !== "idle") fail(409, "機台目前不在閒置狀態，請聯絡站點。");
      transition(r, "preparing");
      r.leaseExpiresAt = new Date(
        clock() + s.preparationMinutes * 60000
      ).toISOString();
    } else if (input.action === "checks") {
      if (r.status !== "preparing" || !input.checks) fail(409, "請先到場報到");
      r.checks = input.checks;
    } else if (input.action === "release") {
      if (!["awaiting_removal", "preparing"].includes(r.status))
        fail(409, "請等待列印結束再確認取件");
      if (
        t.status !== "idle" ||
        t.bed > s.releaseBedTemperature ||
        t.nozzle >= 60
      )
        fail(409, "請等待機台停止並冷卻，再清空平台。");
      if (!input.checks?.bedClear)
        fail(400, "請確認列印件已移除且平台已清空。");
      const cancelledBeforePrint = r.status === "preparing";
      transition(r, cancelledBeforePrint ? "cancelled" : "completed");
      r.releasedAt = now();
      event(
        r,
        "released",
        cancelledBeforePrint ? "已結束本次使用時段" : "本次免費列印已完成",
        "感謝你清空列印平台，系統將通知下一位使用者。"
      );
    } else {
      const printing = ["printing", "paused"].includes(r.status);
      if (["pause", "resume", "cancel"].includes(input.action) && !printing)
        fail(409, "目前沒有可暫停或停止的列印工作。");
      if (["pause", "resume", "cancel"].includes(input.action) && printing) {
        if (!matches(r, t))
          fail(409, "目前機台工作與你的列印不同，請聯絡站點。");
        if (
          (input.action === "pause" && t.status !== "printing") ||
          (input.action === "resume" && t.status !== "paused")
        )
          fail(409, "機台狀態已改變，請重新整理。");
      } else if (r.status !== "preparing" || t.status !== "idle")
        fail(409, "請先完成報到，並確認機台閒置。");
      if (input.action === "jog") {
        if (!input.axis || !input.distance || !r.homedAt)
          fail(400, "請先歸零，再選擇方向與距離。");
        if (t.homedAxes !== undefined && !t.homedAxes.includes(input.axis))
          fail(409, "此軸尚未完成歸零。");
        const position = t.position;
        if (!position || !Number.isFinite(position[input.axis]))
          fail(409, "無法取得軸位置，請重新歸零。");
        const next = position[input.axis] + input.distance,
          limit =
            ready.printer.buildVolume[["x", "y", "z"].indexOf(input.axis)];
        if (next < 0 || next > limit) fail(400, "這次移動會超出平台範圍。");
      }
      if (
        ["load", "unload"].includes(input.action) &&
        (t.nozzle < s.minimumExtrudeTemperature ||
          t.nozzle > s.nozzleTemperature + 15)
      )
        fail(409, "請先預熱，等待噴嘴達到進退料溫度。");
      if (
        input.action === "start" &&
        (!r.checks.bedClear ||
          !r.checks.filamentReady ||
          !r.checks.areaClear ||
          !r.homedAt)
      )
        fail(409, "請完成歸零與三項列印前確認。");
      if (
        input.action === "start" &&
        t.homedAxes !== undefined &&
        !["x", "y", "z"].every((a) => t.homedAxes.includes(a))
      )
        fail(409, "機台尚未完成各軸歸零，請重新歸零。");
      if (input.action === "start" && r.profileName !== s.profileName)
        fail(409, "站點設定已更新，請重新切片。");
      const record = {
        id: randomUUID(),
        reservationId: r.id,
        customerId: c.id,
        requestId: input.requestId,
        action: input.action,
        status: "sending",
        createdAt: now(),
      };
      data().freePrintCommands.push(record);
      if (input.action === "start") {
        transition(r, "starting");
        r.startRequestedAt = now();
      }
      await database.write();
      try {
        const job = data().slicingQuotes.find((j) => j.id === r.slicingQuoteId);
        if (
          !job ||
          job.gcodeFileId !== r.gcodeFileId ||
          job.status !== "completed"
        )
          fail(409, "切片結果已變更，請重新切片。");
        const file =
          input.action === "start"
            ? data().files.find(
                (f) =>
                  f.id === r.gcodeFileId &&
                  (f.workspaceId || "ws-default") === r.workspaceId
              )
            : null;
        if (input.action === "start" && !file) fail(409, "找不到列印檔案");
        await hardwareCommand(ready.bridge, {
          action: input.action,
          axis: input.axis,
          distance: input.distance,
          nozzle: input.action === "cooldown" ? 0 : s.nozzleTemperature,
          bed: input.action === "cooldown" ? 0 : s.bedTemperature,
          filename: r.filename,
          ...(file ? { bytes: await readFile(file) } : {}),
        });
        record.status = "accepted";
        record.completedAt = now();
        if (input.action === "home") {
          r.homedAt = now();
          r.checks.bedClear = false;
          r.checks.areaClear = false;
        }
        if (input.action === "jog") {
          r.checks.bedClear = false;
          r.checks.areaClear = false;
        }
        if (["load", "unload"].includes(input.action))
          r.checks.filamentReady = false;
        if (input.action === "cancel") {
          transition(r, "awaiting_removal");
          event(
            r,
            "cancelled-print",
            "列印已停止，請清空平台",
            "請等待機台冷卻、移除列印件，再確認取件。"
          );
        }
      } catch (e) {
        record.status = "uncertain";
        record.lastError = e.message;
        r.lastError = "機台操作結果未確認，請查看機台並聯絡站點人員。";
        transition(r, "attention");
        event(r, "attention", "機台操作需要確認", r.lastError);
        await database.write();
        fail(502, r.lastError);
      }
    }
    await database.write();
    await tickInternal();
    return publicState(c);
  });
  const admin = "/api/member-service/free-print-station";
  route(
    "GET",
    admin,
    async (req, reply, c) => {
      if ((c.workspaceId || "ws-default") !== station().workspaceId)
        fail(403, "此站點不屬於你的工作區");
      return publicState(c, true);
    },
    true
  );
  route(
    "PUT",
    admin,
    async (req, reply, c) => {
      const input = configSchema.parse(req.body);
      const s = station();
      if ((c.workspaceId || "ws-default") !== s.workspaceId)
        fail(403, "此站點不屬於你的工作區");
      if (active() && input.printerId !== s.printerId)
        fail(409, "有人使用中，無法更換機台");
      Object.assign(s, input);
      s.updatedAt = now();
      await database.write();
      await tickInternal();
      return publicState(c, true);
    },
    true
  );
  route(
    "POST",
    `${admin}/resolve`,
    async (req, reply, c) => {
      const { id, bedClear, note } = z
        .object({
          id: z.string().uuid(),
          bedClear: z.literal(true),
          note: z.string().min(5).max(1000),
        })
        .parse(req.body);
      const s = station();
      if ((c.workspaceId || "ws-default") !== s.workspaceId)
        fail(403, "工作區不符");
      const r = records().find(
        (r) => r.id === id && activeStates.includes(r.status)
      );
      if (!r) fail(404, "找不到使用時段");
      const t = await telemetry();
      if (
        !t ||
        t.status !== "idle" ||
        t.bed > s.releaseBedTemperature ||
        t.nozzle >= 60
      )
        fail(409, "請先確認機台停止並冷卻");
      transition(r, "completed");
      r.staffResolution = { by: c.id, note, at: now(), bedClear };
      await database.write();
      await tickInternal();
      return publicState(c, true);
    },
    true
  );
  const timer = setInterval(
    () => serial(tickInternal).catch(() => {}),
    intervalMs
  );
  timer.unref();
  app.addHook("onClose", async () => {
    mailClosing = true;
    clearInterval(timer);
    await tail;
    await mailRunning;
  });
  return {
    tick: () => serial(tickInternal),
    runExclusive: (fn) => serial(fn),
    flushMail: async () => {
      while (mailRunning) await mailRunning;
    },
  };
}
