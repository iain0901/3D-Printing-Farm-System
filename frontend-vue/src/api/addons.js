import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function updateAddon(id, patch) {
  const key = `addon-update:${id}`
  return request({ url: `/api/addons/${id}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { id, patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}
