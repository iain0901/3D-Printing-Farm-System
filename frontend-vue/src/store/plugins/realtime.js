/**
 * @description Vuex 插件：管理登录态与实时连接（WS/SSE）的生命周期。
 * - accessToken 由空变为有值（登录，或刷新页面时已存在 token）：拉取一次 /api/state 全量快照，
 *   分发给各自的 Vuex 模块，然后启动 RealtimeClient 接收后续增量推送。
 * - accessToken 变为空（登出/token 失效）：断开 RealtimeClient。
 * 帧分发遵循计划中的模块划分：目前 printers/queue/files 拥有 Vuex 模块（随 Phase 推进逐步加入更多域），
 * 其余顶层 key 会被安全忽略，等对应视图在后续 Phase 拿到自己的模块后再接入。
 */

import RealtimeClient from '@/utils/realtime'
import { fetchState } from '@/api/realtime'

function applyStateSnapshot(store, data) {
  if (!data || typeof data !== 'object') return
  if (Array.isArray(data.printers)) store.commit('printers/setAll', data.printers)
  if (Array.isArray(data.queue)) store.commit('queue/setAll', data.queue)
  if (Array.isArray(data.todos)) store.commit('queue/setTodos', data.todos)
  if (Array.isArray(data.files)) store.commit('files/setAll', data.files)
  if (Array.isArray(data.fileFolders)) store.commit('files/setFolders', data.fileFolders)
  if (Array.isArray(data.orders)) store.commit('orders/setAll', data.orders)
  if (Array.isArray(data.quoteRequests)) store.commit('orders/setQuoteRequests', data.quoteRequests)
  if (Array.isArray(data.customers)) store.commit('customers/setAll', data.customers)
}

export default function realtimePlugin(store) {
  const client = new RealtimeClient({
    onStatusChange: (status) => store.commit('app/setBackendStatus', status),
    onFrame: (kind, payload) => {
      if (kind === 'state' && payload.state) applyStateSnapshot(store, payload.state)
      // event 帧（通知流）将在通知中心接入时（后续 Phase）在此分发给 notifications 模块
    },
  })

  async function start() {
    try {
      const data = await fetchState()
      applyStateSnapshot(store, data)
      store.commit('app/setBackendStatus', 'connected')
    } catch {
      store.commit('app/setBackendStatus', 'local')
    }
    client.connect()
  }

  function stop() {
    client.disconnect()
    store.commit('app/setBackendStatus', 'local')
  }

  if (store.getters['user/accessToken']) start()

  store.subscribe((mutation) => {
    if (mutation.type !== 'user/setAccessToken') return
    if (mutation.payload) start()
    else stop()
  })
}
