import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function fetchHistory() {
  return request({ url: '/api/history', method: 'get' })
}

export function reprintJob(jobId) {
  const key = `history-reprint:${jobId}`
  return request({ url: `/api/history/${jobId}/reprint`, method: 'post', data: {}, headers: idempotencyHeaders(key, { jobId }) }).then((r) => {
    clearIdempotency(key)
    return r
  })
}
