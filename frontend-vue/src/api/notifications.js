import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createNotificationChannel(payload) {
  const key = 'notification-channel-create'
  return request({ url: '/api/notificationChannels', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateNotificationChannel(id, patch) {
  const key = `notification-channel-update:${id}`
  return request({ url: `/api/notificationChannels/${id}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { id, patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function testNotificationChannel(id) {
  return request({ url: `/api/notificationChannels/${id}/test`, method: 'post' })
}
