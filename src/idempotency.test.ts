import { describe, expect, it, vi } from "vitest";
import { idempotencyFingerprint, idempotencyHeadersForAttempt, idempotencyKeyForAttempt } from "./idempotency";

describe("browser idempotency helpers", () => {
  it("reuses a key for the same payload and rotates when the payload changes", () => {
    vi.setSystemTime(new Date("2026-06-25T04:30:00Z"));
    let fill = 10;
    const randomSource = {
      getRandomValues(buffer: Uint8Array) {
        buffer.fill(fill);
        fill += 1;
        return buffer;
      }
    };
    const firstFingerprint = idempotencyFingerprint({ project: "Bracket", quantity: 2 });
    const reorderedFingerprint = idempotencyFingerprint({ quantity: 2, project: "Bracket" });
    const changedFingerprint = idempotencyFingerprint({ project: "Bracket", quantity: 3 });

    const first = idempotencyKeyForAttempt(null, "public-quote", firstFingerprint, randomSource);
    const replay = idempotencyKeyForAttempt(first, "public-quote", reorderedFingerprint, randomSource);
    const changed = idempotencyKeyForAttempt(first, "public-quote", changedFingerprint, randomSource);

    expect(replay.key).toBe(first.key);
    expect(changed.key).not.toBe(first.key);
    expect(first.key).toMatch(/^public-quote-/);
  });

  it("builds stable Idempotency-Key headers for repeated browser actions", () => {
    vi.setSystemTime(new Date("2026-06-25T09:12:00Z"));
    let fill = 12;
    const randomSource = {
      getRandomValues(buffer: Uint8Array) {
        buffer.fill(fill);
        fill += 1;
        return buffer;
      }
    };

    const first = idempotencyHeadersForAttempt(null, "settings", { label: "Security", patch: { requireAdmin2fa: true } }, randomSource);
    const retry = idempotencyHeadersForAttempt(first.attempt, "settings", { patch: { requireAdmin2fa: true }, label: "Security" }, randomSource);
    const changed = idempotencyHeadersForAttempt(first.attempt, "settings", { label: "Security", patch: { requireAdmin2fa: false } }, randomSource);

    expect(first.headers["Idempotency-Key"]).toBe(first.attempt.key);
    expect(retry.headers["Idempotency-Key"]).toBe(first.headers["Idempotency-Key"]);
    expect(changed.headers["Idempotency-Key"]).not.toBe(first.headers["Idempotency-Key"]);
    expect(first.headers["Idempotency-Key"]).toMatch(/^settings-/);
  });
});
