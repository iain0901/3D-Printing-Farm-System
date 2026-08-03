import { baseURL } from '@/config'
import { fetchRealtimeTicket } from '@/api/realtime'

/**
 * @description 对接 api/server.mjs 的实时通道：先用 accessToken 换一次性 ticket
 * （POST /api/events/token），再用 ticket 建立 WebSocket（/api/events/ws），
 * 环境不支持 WebSocket 时退回 SSE（/api/events/stream）。
 * 帧种类固定为 state / event / heartbeat，与 src/App.tsx 的 handleRealtimePayload 语义一致。
 * 在 React 版本基础上新增了带退避的自动重连（React 版本断线后只是停留在 local 状态，不会自动重连）。
 */

function realtimeOrigin() {
  if (baseURL) {
    return baseURL.replace(/^http/i, 'ws')
  }
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}`
}

function httpOrigin() {
  return baseURL || window.location.origin
}

const MAX_RECONNECT_DELAY_MS = 30000

export default class RealtimeClient {
  constructor({ onFrame, onStatusChange } = {}) {
    this.onFrame = typeof onFrame === 'function' ? onFrame : () => {}
    this.onStatusChange = typeof onStatusChange === 'function' ? onStatusChange : () => {}
    this.socket = null
    this.source = null
    this.closed = true
    this.reconnectDelay = 1000
    this.reconnectTimer = null
  }

  connect() {
    if (!this.closed) return
    this.closed = false
    this._open()
  }

  disconnect() {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.socket) {
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket.close()
      this.socket = null
    }
    if (this.source) {
      this.source.close()
      this.source = null
    }
  }

  async _open() {
    if (this.closed) return
    try {
      const { token } = await fetchRealtimeTicket()
      if (this.closed) return
      if ('WebSocket' in window) {
        this._openWebSocket(token)
      } else {
        this._openEventSource(token)
      }
    } catch {
      this._scheduleReconnect()
    }
  }

  _openWebSocket(token) {
    const query = new URLSearchParams({ ticket: token })
    const socket = new WebSocket(`${realtimeOrigin()}/api/events/ws?${query.toString()}`)
    this.socket = socket
    socket.onopen = () => {
      this.reconnectDelay = 1000
    }
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        this._handleFrame(payload.event || '', payload.data || {})
      } catch {
        // 忽略无法解析的帧
      }
    }
    socket.onerror = () => this._handleDrop()
    socket.onclose = () => this._handleDrop()
  }

  _openEventSource(token) {
    const query = new URLSearchParams({ ticket: token })
    const source = new EventSource(`${httpOrigin()}/api/events/stream?${query.toString()}`)
    this.source = source
    source.addEventListener('state', (event) => this._handleFrame('state', JSON.parse(event.data || '{}')))
    source.addEventListener('event', (event) => this._handleFrame('event', JSON.parse(event.data || '{}')))
    source.onerror = () => this._handleDrop()
  }

  _handleFrame(kind, payload) {
    if (kind !== 'heartbeat') this.onStatusChange('connected')
    this.onFrame(kind, payload)
  }

  _handleDrop() {
    if (this.socket) {
      this.socket.onclose = null
      this.socket.onerror = null
      this.socket = null
    }
    if (this.source) {
      this.source.close()
      this.source = null
    }
    this.onStatusChange('local')
    this._scheduleReconnect()
  }

  _scheduleReconnect() {
    if (this.closed) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS)
      this._open()
    }, this.reconnectDelay)
  }
}
