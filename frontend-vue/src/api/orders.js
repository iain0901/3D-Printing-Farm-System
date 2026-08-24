import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createOrder(payload) {
  const key = 'order-create'
  return request({ url: '/api/orders', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

// status: received | queued | printing | on_hold | packed | shipped | completed | cancelled
export function updateOrderStatus(orderId, status) {
  const key = `order-status:${orderId}`
  return request({ url: `/api/orders/${orderId}/status`, method: 'patch', data: { status }, headers: idempotencyHeaders(key, { orderId, status }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateOrderTracking(orderId, patch) {
  const key = `order-tracking:${orderId}`
  return request({ url: `/api/orders/${orderId}/tracking`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { orderId, ...patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function generateJobsForOrder(orderId, dryRun = false) {
  return request({ url: `/api/orders/${orderId}/generate-jobs`, method: 'post', data: { dryRun } })
}

export function updateQuoteRequest(quoteId, patch) {
  const key = `quote-update:${quoteId}`
  return request({ url: `/api/quoteRequests/${quoteId}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { quoteId, patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function convertQuoteRequest(quoteId, payload = { createJob: true }) {
  return request({ url: `/api/quoteRequests/${quoteId}/convert-order`, method: 'post', data: payload })
}

// 專員回覆報價對話（可附最多 3 張圖片）
export function replyQuoteMessage(quoteId, body, files = []) {
  if (!files.length) {
    return request({ url: `/api/quoteRequests/${quoteId}/messages`, method: 'post', data: { body } })
  }
  const form = new FormData()
  form.append('body', body)
  files.forEach((file) => form.append('files', file, file.name))
  return request({ url: `/api/quoteRequests/${quoteId}/messages`, method: 'post', data: form, headers: { 'Content-Type': undefined } })
}

// 建立生產細節確認項目（label/value/note），客戶端會逐項確認
export function createQuoteConfirmations(quoteId, items) {
  const key = `quote-confirm:${quoteId}`
  return request({ url: `/api/quoteRequests/${quoteId}/confirmations`, method: 'post', data: { items }, headers: idempotencyHeaders(key, { quoteId, items }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

// 訊息圖片（員工授權）；回傳 arraybuffer 供 <img> blob 使用
export function fetchMessageAttachment(quoteId, messageId, index) {
  return request({ url: `/api/quote-messages/${quoteId}/${messageId}/attachments/${index}`, method: 'get', responseType: 'blob' })
}
