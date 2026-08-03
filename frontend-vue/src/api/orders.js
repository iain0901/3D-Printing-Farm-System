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
