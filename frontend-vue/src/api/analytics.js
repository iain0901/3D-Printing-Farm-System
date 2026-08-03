import request from '@/utils/request'

export function fetchAnalytics() {
  return request({ url: '/api/analytics', method: 'get' })
}
