/**
 * @description 打印机列表。被 Dashboard/Printers/Queue/Scheduler 等多个视图共用，且接收 WS/SSE 的
 * state 帧增量推送，因此按计划的 Vuex 模块划分规则纳入 store（而非各视图各自拉取）。
 */

const state = () => ({
  list: [],
})
const getters = {
  list: (state) => state.list,
}
const mutations = {
  setAll(state, printers) {
    state.list = Array.isArray(printers) ? printers : []
  },
  // 写操作 API 直接回传了最新的单笔资料时，先本地合并一次，不用等下一个 WS state 帧
  patchOne(state, printer) {
    const index = state.list.findIndex((item) => item.id === printer.id)
    if (index === -1) state.list.push(printer)
    else state.list.splice(index, 1, { ...state.list[index], ...printer })
  },
}
const actions = {
  setAll({ commit }, printers) {
    commit('setAll', printers)
  },
  patchOne({ commit }, printer) {
    commit('patchOne', printer)
  },
}
export default { state, getters, mutations, actions }
