import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createSpool(payload) {
  const key = 'spool-create'
  return request({ url: '/api/spools', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateSpool(spoolId, patch) {
  const key = `spool-update:${spoolId}`
  return request({
    url: `/api/spools/${spoolId}`,
    method: 'patch',
    data: patch,
    headers: idempotencyHeaders(key, { spoolId, patch }),
  }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function logSpoolUsage(spoolId, grams = 20) {
  const key = `spool-usage:${spoolId}`
  return request({
    url: `/api/spools/${spoolId}/usage`,
    method: 'patch',
    data: { grams },
    headers: idempotencyHeaders(key, { spoolId, grams }),
  }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function createPurchaseRequest(payload) {
  const key = 'purchase-request-create'
  return request({ url: '/api/purchaseRequests', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function receivePurchaseRequest(requestId, location = 'Rack Receiving') {
  const key = `purchase-request-receive:${requestId}`
  return request({
    url: `/api/purchaseRequests/${requestId}/receive`,
    method: 'post',
    data: { location },
    headers: idempotencyHeaders(key, { requestId, location }),
  }).then((r) => {
    clearIdempotency(key)
    return r
  })
}
