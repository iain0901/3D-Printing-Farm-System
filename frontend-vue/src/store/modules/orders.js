/**
 * @description 訂單 + 報價需求。被 Dashboard、Orders、Customers 等多個視圖共用，且接收 WS/SSE 的
 * state 帧增量推送。
 */

const state = () => ({
  list: [],
  quoteRequests: [],
})
const getters = {
  list: (state) => state.list,
  quoteRequests: (state) => state.quoteRequests,
}
const mutations = {
  setAll(state, orders) {
    state.list = Array.isArray(orders) ? orders : []
  },
  setQuoteRequests(state, quotes) {
    state.quoteRequests = Array.isArray(quotes) ? quotes : []
  },
  patchOne(state, order) {
    const index = state.list.findIndex((item) => item.id === order.id)
    if (index === -1) state.list.push(order)
    else state.list.splice(index, 1, { ...state.list[index], ...order })
  },
  patchQuote(state, quote) {
    const index = state.quoteRequests.findIndex((item) => item.id === quote.id)
    if (index === -1) state.quoteRequests.push(quote)
    else state.quoteRequests.splice(index, 1, { ...state.quoteRequests[index], ...quote })
  },
}
const actions = {
  setAll({ commit }, orders) {
    commit('setAll', orders)
  },
  setQuoteRequests({ commit }, quotes) {
    commit('setQuoteRequests', quotes)
  },
  patchOne({ commit }, order) {
    commit('patchOne', order)
  },
  patchQuote({ commit }, quote) {
    commit('patchQuote', quote)
  },
}
export default { state, getters, mutations, actions }
