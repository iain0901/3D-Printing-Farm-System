import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createMaintenance(payload) {
  const key = 'maintenance-create'
  return request({ url: '/api/maintenance', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateMaintenance(id, patch) {
  const key = `maintenance-update:${id}`
  return request({ url: `/api/maintenance/${id}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { id, patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}
