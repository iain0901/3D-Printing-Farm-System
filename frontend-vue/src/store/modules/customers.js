/**
 * @description 客戶名錄。被 Customers、Orders 等多個視圖共用，且接收 WS/SSE 的 state 帧增量推送。
 */

const state = () => ({
  list: [],
})
const getters = {
  list: (state) => state.list,
}
const mutations = {
  setAll(state, customers) {
    state.list = Array.isArray(customers) ? customers : []
  },
  patchOne(state, customer) {
    const index = state.list.findIndex((item) => item.id === customer.id)
    if (index === -1) state.list.push(customer)
    else state.list.splice(index, 1, { ...state.list[index], ...customer })
  },
  removeOne(state, customerId) {
    state.list = state.list.filter((item) => item.id !== customerId)
  },
}
const actions = {
  setAll({ commit }, customers) {
    commit('setAll', customers)
  },
  patchOne({ commit }, customer) {
    commit('patchOne', customer)
  },
  removeOne({ commit }, customerId) {
    commit('removeOne', customerId)
  },
}
export default { state, getters, mutations, actions }
