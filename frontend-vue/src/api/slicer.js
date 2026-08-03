import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function fetchSlicerJobs() {
  return request({ url: '/api/slicer/jobs', method: 'get' })
}

export function runSlicerJob(settings) {
  const key = `slicer-job:${settings.fileId}`
  return request({ url: '/api/slicer/jobs', method: 'post', data: settings, headers: idempotencyHeaders(key, settings) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}
