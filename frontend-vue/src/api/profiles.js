import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createProfile(payload) {
  const key = 'profile-create'
  return request({ url: '/api/profiles', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function archiveProfile(profileId) {
  return request({ url: `/api/profiles/${profileId}`, method: 'delete' })
}

export function setDefaultProfile(profileId) {
  const key = `profile-default:${profileId}`
  return request({ url: `/api/profiles/${profileId}/default`, method: 'patch', headers: idempotencyHeaders(key, { profileId }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}
