/**
 * @description 逐行移植自 src/idempotency.ts（React 版），供重试安全的写入操作（如打印机控制）
 * 附带 Idempotency-Key header。與 React 版不同的是這裡用一個模組級 Map 取代 React 的 useRef 當快取，
 * 語意相同：同一個 action 在 payload（fingerprint）不變時重用同一把 key，變了就換新 key。
 */

function sortedJson(value) {
  if (Array.isArray(value)) return value.map(sortedJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortedJson(item)])
  )
}

export function idempotencyFingerprint(value) {
  return JSON.stringify(sortedJson(value))
}

function randomHex(bytes = 12) {
  const buffer = new Uint8Array(bytes)
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buffer)
  } else {
    for (let index = 0; index < buffer.length; index += 1) buffer[index] = Math.floor(Math.random() * 256)
  }
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createIdempotencyKey(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomHex(12)}`
}

const attempts = new Map()

// 返回可直接放進 axios config.headers 的物件；action 相同 + payload 不變時重用同一把 key
export function idempotencyHeaders(action, payload) {
  const fingerprint = idempotencyFingerprint(payload)
  const current = attempts.get(action)
  const attempt = current?.fingerprint === fingerprint ? current : { fingerprint, key: createIdempotencyKey(action) }
  attempts.set(action, attempt)
  return { 'Idempotency-Key': attempt.key }
}

// 操作成功後呼叫，讓下一次同 action 的呼叫換新 key（避免誤用舊 key 覆蓋後續不同語意的請求）
export function clearIdempotency(action) {
  attempts.delete(action)
}
