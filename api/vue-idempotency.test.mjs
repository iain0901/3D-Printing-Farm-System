import { describe, expect, it } from "vitest";
import { clearIdempotency, idempotencyFingerprint, idempotencyHeaders } from "../frontend-vue/src/utils/idempotency.js";

describe("Vue frontend idempotency helpers", () => {
  it("keeps a key for equivalent payloads and rotates it after success", () => {
    const action = "case-payment";
    clearIdempotency(action);
    expect(idempotencyFingerprint({ amount: 500, status: "paid" })).toBe(idempotencyFingerprint({ status: "paid", amount: 500 }));
    const first = idempotencyHeaders(action, { amount: 500, status: "paid" })["Idempotency-Key"];
    const retry = idempotencyHeaders(action, { status: "paid", amount: 500 })["Idempotency-Key"];
    expect(retry).toBe(first);
    clearIdempotency(action);
    expect(idempotencyHeaders(action, { amount: 500, status: "paid" })["Idempotency-Key"]).not.toBe(first);
  });
});
