import request from '@/utils/request'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

const BASE_OPTIONS = { includeBusyPrinters: true, respectMaterial: true, respectBuildVolume: true, startMinute: 8 * 60 }

export function autoSchedule() {
  const key = 'schedule-auto'
  return request({ url: '/api/schedule/auto', method: 'post', data: BASE_OPTIONS, headers: idempotencyHeaders(key, BASE_OPTIONS) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

// strategy: 'material-color' | 'due-priority' | 'load-balance'
export function optimizeSchedule(strategy) {
  const payload = { strategy, ...BASE_OPTIONS }
  const key = `schedule-optimize:${strategy}`
  return request({ url: '/api/schedule/optimize', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

// objective: 'changeover-min' | 'due-risk' | 'balanced-cost'
export function solveConstraintSchedule(objective) {
  const payload = { objective, ...BASE_OPTIONS, maxJobs: 80 }
  const key = `schedule-constraint:${objective}`
  return request({ url: '/api/schedule/constraint', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}
