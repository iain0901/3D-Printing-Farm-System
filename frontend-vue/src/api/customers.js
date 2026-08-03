import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createCustomer(payload) {
  const key = 'customer-create'
  return request({ url: '/api/customers', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function updateCustomer(customerId, patch) {
  const key = `customer-update:${customerId}`
  return request({ url: `/api/customers/${customerId}`, method: 'patch', data: patch, headers: idempotencyHeaders(key, { customerId, patch }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}

export function deleteCustomer(customerId) {
  return request({ url: `/api/customers/${customerId}`, method: 'delete' })
}
