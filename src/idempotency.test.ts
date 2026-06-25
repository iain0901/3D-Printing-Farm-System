import { describe, expect, it, vi } from "vitest";
import { idempotencyFingerprint, idempotencyKeyForAttempt } from "./idempotency";

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
});
