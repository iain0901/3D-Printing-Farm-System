import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createQueueJob(payload) {
  const key = 'queue-create'
  return request({ url: '/api/queue', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

// dryRun=true 只做試算不落地，用於 Queue 頁面的「預覽配對」
export function matchQueueJobs(dryRun) {
  const payload = { dryRun, maxActiveSlots: 3, respectMaterial: true, respectBuildVolume: true }
  const key = `queue-match:${dryRun ? 'dry-run' : 'commit'}`
  return request({ url: '/api/queue/match', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

export function scheduleQueueJob(jobId, printerId, scheduledStart = '13:00') {
  const payload = { printerId, scheduledStart }
  const key = `queue-schedule:${jobId}`
  return request({
    url: `/api/queue/${jobId}/schedule`,
    method: 'patch',
    data: payload,
    headers: idempotencyHeaders(key, { jobId, ...payload }),
  }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

export function updateQueueStatus(jobId, status) {
  const key = `queue-status:${jobId}`
  return request({
    url: `/api/queue/${jobId}/status`,
    method: 'patch',
    data: { status },
    headers: idempotencyHeaders(key, { jobId, status }),
  }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

export function updateQueuePriority(jobId, priority) {
  const key = `queue-priority:${jobId}`
  return request({
    url: `/api/queue/${jobId}/priority`,
    method: 'patch',
    data: { priority },
    headers: idempotencyHeaders(key, { jobId, priority }),
  }).then((result) => {
    clearIdempotency(key)
    return result
  })
}
