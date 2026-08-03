import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createPrinter(payload) {
  return request({ url: '/api/printers', method: 'post', data: payload })
}

export function updatePrinter(id, payload) {
  return request({ url: `/api/printers/${id}`, method: 'patch', data: payload })
}

export function syncPrinter(id) {
  return request({ url: `/api/printers/${id}/sync`, method: 'post' })
}

// action: start | pause | resume | cancel | "home axes" | preheat | cooldown（見 api/server.mjs bridgeActionSchema）
// 帶 Idempotency-Key：同一台印表機、同一個尚未確定成功的動作重試時沿用同一把 key，避免重複觸發
export function sendPrinterAction(printerId, action) {
  const key = `printer-action:${printerId}:${action}`
  return request({
    url: '/api/actions',
    method: 'post',
    data: { printerId, action },
    headers: idempotencyHeaders(key, { printerId, action }),
  }).then((result) => {
    clearIdempotency(key)
    return result
  })
}
