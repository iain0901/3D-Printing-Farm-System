// Durable per-notification claims. Unknown SMTP outcomes are never blindly resent.
export function createMemberNotificationDelivery({
  database,
  emailClient,
  lineClient,
  clock = Date.now,
  timeoutMs = 25000,
}) {
  let running = null;
  let stopped = false;
  const stamp = () => new Date(clock()).toISOString();
  const internalSource = (n) => /^(quote:|free-print:)/.test(n.sourceKey || "");
  const records = () => database.data.memberNotifications || [];
  async function recover() {
    let changed = false;
    for (const n of records().filter((n) => !internalSource(n)))
      for (const d of Object.values(n.delivery || {})) {
        if (d.status === "sending") {
          d.status = "uncertain";
          d.at = stamp();
          d.reason = "interrupted";
          changed = true;
        }
      }
    if (changed) await database.write();
  }
  async function deliver() {
    let attempted = 0;
    for (const n of [...records()].reverse()) {
      if (internalSource(n)) continue;
      const c = (database.data.customers || []).find(
        (c) =>
          c.id === n.customerId &&
          (c.workspaceId || "ws-default") === (n.workspaceId || "ws-default")
      );
      if (!c) continue;
      const prefs = (database.data.memberPreferences || []).find(
        (p) =>
          p.customerId === c.id &&
          (p.workspaceId || "ws-default") === (c.workspaceId || "ws-default")
      )?.notifications || { email: true, line: false };
      for (const channel of ["email", "line"]) {
        if (stopped) return;
        const d = n.delivery?.[channel];
        if (
          !d ||
          !["pending", "retry"].includes(d.status) ||
          Date.parse(d.nextAttemptAt || "") > clock()
        )
          continue;
        if (!prefs[channel]) {
          d.status = "skipped";
          d.reason = "preference";
          d.at = stamp();
          await database.write();
          continue;
        }
        const available =
          channel === "email"
            ? emailClient && c.email
            : lineClient?.configured &&
              /^U[0-9a-f]{32}$/i.test(c.lineUserId || "");
        if (!available) continue;
        if (attempted++ >= 100) return;
        const previous = { ...d };
        Object.assign(d, {
          status: "sending",
          at: stamp(),
          attempts: (d.attempts || 0) + 1,
          reason: "",
        });
        try {
          await database.write();
        } catch (e) {
          Object.assign(d, previous);
          throw e;
        }
        let timer;
        try {
          const send = async () => {
            if (channel === "email")
              await emailClient.send({
                to: c.email,
                subject: `3DRFM｜${n.title}`,
                text: `${n.body}\n\n請登入 3DRFM 會員中心查看完整內容。`,
                messageId: `<member-${n.id}@notifications.3drfm.com>`,
              });
            else {
              const result = await lineClient.push(
                c.lineUserId,
                `3DRFM｜${n.title}\n${n.body}`
              );
              if (!result.sent) throw new Error("unknown delivery");
            }
          };
          await Promise.race([
            send(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("delivery timeout")),
                timeoutMs
              );
            }),
          ]);
          Object.assign(d, {
            status: "sent",
            at: stamp(),
            nextAttemptAt: null,
          });
        } catch (e) {
          // ECONNECTION / ETIMEDOUT may happen after SMTP accepted DATA: these are ambiguous.
          const rejectedTransient =
            channel === "email" &&
            ((Number(e.responseCode) >= 400 && Number(e.responseCode) < 500) ||
              e.code === "EDNS");
          const rejectedPermanent =
            channel === "email" &&
            ((Number(e.responseCode) >= 500 && Number(e.responseCode) < 600) ||
              e.code === "EAUTH");
          d.status = rejectedTransient
            ? d.attempts < 5
              ? "retry"
              : "failed"
            : rejectedPermanent
            ? "failed"
            : "uncertain";
          d.reason = rejectedTransient
            ? "temporary_rejection"
            : rejectedPermanent
            ? "rejected"
            : "delivery_unknown";
          d.at = stamp();
          d.nextAttemptAt =
            d.status === "retry"
              ? new Date(
                  clock() + Math.min(3600000, 30000 * 2 ** (d.attempts - 1))
                ).toISOString()
              : null;
        } finally {
          clearTimeout(timer);
        }
        await database.write();
      }
    }
  }
  return {
    recover,
    stop() {
      stopped = true;
    },
    tick() {
      if (!running)
        running = deliver().finally(() => {
          running = null;
        });
      return running;
    },
    async retry(id, channel, workspaceId, actorId) {
      if (running) await running;
      const n = records().find(
        (n) => n.id === id && (n.workspaceId || "ws-default") === workspaceId
      );
      if (!n || internalSource(n) || !["email", "line"].includes(channel))
        return false;
      const d = n.delivery?.[channel];
      if (!d || !["failed", "uncertain"].includes(d.status)) return false;
      Object.assign(d, {
        status: "pending",
        attempts: 0,
        nextAttemptAt: null,
        retriedBy: actorId,
        retriedAt: stamp(),
      });
      await database.write();
      return true;
    },
  };
}
