import request from '@/utils/request'

// 短效 ticket，用于 WS/SSE 连接鉴权（不能直接用长期 accessToken 暴露在 URL query 中）
export function fetchRealtimeTicket() {
  return request({
    url: '/api/events/token',
    method: 'post',
  })
}

// 登录后拉取一次完整快照；此后由 WS/SSE 的 state 帧增量刷新，见 utils/realtime.js
export function fetchState() {
  return request({
    url: '/api/state',
    method: 'get',
  })
}
