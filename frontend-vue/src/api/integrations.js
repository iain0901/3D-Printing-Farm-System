import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createBridge(payload) {
  const key = `bridge-save:${payload.printerId}`
  return request({ url: '/api/bridges', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function testBridge(id) {
  return request({ url: `/api/bridges/${id}/test`, method: 'post' })
}

export function createWebhook(payload) {
  const key = 'webhook-create'
  return request({ url: '/api/webhooks', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateWebhook(id, patch) {
  const key = `webhook-update:${id}`
  return request({ url: `/api/webhooks/${id}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { id, patch }) }).then(
    (r) => {
      clearIdempotency(key)
      return r
    }
  )
}

export function testWebhook(id) {
  return request({ url: `/api/webhooks/${id}/test`, method: 'post' })
}

export function fetchChatwootStatus() {
  return request({ url: '/api/integrations/chatwoot/status', method: 'get' })
}

export function testChatwootHealth() {
  return request({ url: '/api/integrations/chatwoot/health', method: 'get' })
}
