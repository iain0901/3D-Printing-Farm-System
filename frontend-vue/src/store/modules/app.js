/**
 * @description 与具体业务域无关的全局 UI/连接状态。backendStatus 语义与 src/App.tsx 保持一致：
 * 'connected' = 已从后端拿到数据（初始快照成功，或 WS/SSE 收到过非心跳帧）；
 * 'local' = 初始快照失败或实时连接断开，界面停留在最近一次已知数据上。
 */

const state = () => ({
  backendStatus: 'local',
})
const getters = {
  backendStatus: (state) => state.backendStatus,
}
const mutations = {
  setBackendStatus(state, status) {
    state.backendStatus = status
  },
}
const actions = {
  setBackendStatus({ commit }, status) {
    commit('setBackendStatus', status)
  },
}
export default { state, getters, mutations, actions }
