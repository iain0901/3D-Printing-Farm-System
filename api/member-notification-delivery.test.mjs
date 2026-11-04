import { describe, expect, it, vi } from "vitest";
import { createMemberNotificationDelivery } from "./member-notification-delivery.mjs";

function fixture(send = vi.fn(async () => {})) {
  let now = Date.now();
  const notification = {
    id: "notification",
    customerId: "customer",
    workspaceId: "ws-default",
    title: "進度",
    body: "更新",
    delivery: {
      email: { status: "pending", attempts: 0 },
      line: { status: "pending", attempts: 0 },
    },
  };
  const database = {
    data: {
      customers: [
        {
          id: "customer",
          email: "test@example.test",
          workspaceId: "ws-default",
        },
      ],
      memberNotifications: [notification],
      memberPreferences: [],
    },
    write: vi.fn(async () => {}),
  };
  const service = createMemberNotificationDelivery({
    database,
    emailClient: { send },
    clock: () => now,
    timeoutMs: 15,
  });
  return {
    notification,
    database,
    send,
    service,
    advance: () => {
      now += 3600001;
    },
  };
}
describe("durable member notification delivery", () => {
  it("claims before send, serializes concurrent ticks, and never resends sent records", async () => {
    const f = fixture();
    f.send.mockImplementation(async () => {
      expect(f.notification.delivery.email.status).toBe("sending");
      expect(f.database.write).toHaveBeenCalled();
    });
    await Promise.all([f.service.tick(), f.service.tick()]);
    await f.service.tick();
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(f.notification.delivery.email.status).toBe("sent");
    expect(f.notification.delivery.line.status).toBe("skipped");
  });
  it("backs off definite SMTP temporary rejection and stops after five attempts", async () => {
    const f = fixture(
      vi.fn(async () => {
        throw Object.assign(new Error("temporary"), { responseCode: 451 });
      })
    );
    await f.service.tick();
    await f.service.tick();
    expect(f.send).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) {
      f.advance();
      await f.service.tick();
    }
    expect(f.notification.delivery.email).toMatchObject({
      status: "failed",
      attempts: 5,
    });
    f.advance();
    await f.service.tick();
    expect(f.send).toHaveBeenCalledTimes(5);
  });
  it("does not retry permanent or ambiguous failures without operator acknowledgment", async () => {
    const f = fixture(
      vi.fn(async () => {
        throw Object.assign(new Error("connection lost after acceptance"), {
          code: "ECONNECTION",
        });
      })
    );
    await f.service.tick();
    f.advance();
    await f.service.tick();
    expect(f.notification.delivery.email.status).toBe("uncertain");
    expect(f.send).toHaveBeenCalledTimes(1);
    expect(
      await f.service.retry("notification", "email", "other-workspace", "admin")
    ).toBe(false);
    expect(
      await f.service.retry("notification", "email", "ws-default", "admin")
    ).toBe(true);
    f.send.mockResolvedValue(undefined);
    await f.service.tick();
    expect(f.notification.delivery.email).toMatchObject({
      status: "sent",
      retriedBy: "admin",
    });
  });
  it("recovers interrupted sends conservatively, leaving legacy channels untouched", async () => {
    const f = fixture();
    f.notification.delivery.email.status = "sending";
    const legacy = {
      ...structuredClone(f.notification),
      sourceKey: "free-print:fixture",
    };
    f.database.data.memberNotifications.push(legacy);
    await f.service.recover();
    await f.service.tick();
    expect(f.notification.delivery.email.status).toBe("uncertain");
    expect(legacy.delivery.email.status).toBe("sending");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("does not send when persistence fails before the claim", async () => {
    const f = fixture();
    f.database.write.mockRejectedValueOnce(new Error("disk unavailable"));
    await expect(f.service.tick()).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.notification.delivery.email.status).toBe("pending");
  });
  it("leaves missing transport pending and honors member opt-out and workspace ownership", async () => {
    const f = fixture();
    f.database.data.customers[0].workspaceId = "other";
    await f.service.tick();
    expect(f.send).not.toHaveBeenCalled();
    f.database.data.customers[0].workspaceId = "ws-default";
    const service = createMemberNotificationDelivery({ database: f.database });
    await service.tick();
    expect(f.notification.delivery.email.status).toBe("pending");
    f.database.data.memberPreferences.push({
      customerId: "customer",
      notifications: { email: false, line: false },
    });
    await f.service.tick();
    expect(f.notification.delivery.email.status).toBe("skipped");
    expect(f.send).not.toHaveBeenCalled();
  });
  it("marks timeout uncertain and does not retry after a late success", async () => {
    let finish;
    const f = fixture(
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          })
      )
    );
    await f.service.tick();
    expect(f.notification.delivery.email.status).toBe("uncertain");
    finish();
    await f.service.tick();
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it("uses current database after restore and leaves historic unqueued notifications alone", async () => {
    const f = fixture();
    const replacement = structuredClone(f.database.data);
    f.database.data = replacement;
    replacement.memberNotifications.push({ id: "old", customerId: "customer" });
    await f.service.tick();
    expect(replacement.memberNotifications[0].delivery.email.status).toBe(
      "sent"
    );
    expect(f.notification.delivery.email.status).toBe("pending");
    expect(f.send).toHaveBeenCalledTimes(1);
  });
});
