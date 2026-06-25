export type IdempotencyAttempt = {
  fingerprint: string;
  key: string;
};

type RandomByteSource = {
  getRandomValues(buffer: Uint8Array): Uint8Array;
};

function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortedJson(item)])
  );
}

export function idempotencyFingerprint(value: unknown) {
  return JSON.stringify(sortedJson(value));
}

function randomHex(bytes = 12, randomSource: RandomByteSource | undefined = globalThis.crypto) {
  const buffer = new Uint8Array(bytes);
  if (randomSource?.getRandomValues) {
    randomSource.getRandomValues(buffer);
  } else {
    for (let index = 0; index < buffer.length; index += 1) {
      buffer[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createIdempotencyKey(prefix: string, randomSource?: RandomByteSource) {
  return `${prefix}-${Date.now().toString(36)}-${randomHex(12, randomSource)}`;
}

export function idempotencyKeyForAttempt(
  current: IdempotencyAttempt | null,
  prefix: string,
  fingerprint: string,
  randomSource?: RandomByteSource
): IdempotencyAttempt {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, key: createIdempotencyKey(prefix, randomSource) };
}
