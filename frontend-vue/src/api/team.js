import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function inviteUser(payload) {
  const key = 'team-invite'
  return request({ url: '/api/users', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateUser(id, patch) {
  const key = `team-update:${id}`
  return request({ url: `/api/users/${id}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { id, patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function resetUserPassword(id, requireChange = true) {
  return request({ url: `/api/users/${id}/reset-password`, method: 'post', data: { requireChange } })
}
