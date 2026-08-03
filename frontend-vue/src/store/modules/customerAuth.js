/**
 * @description 客戶端（Customer Portal）獨立登入態，token 存在單獨的 localStorage key，
 * 與員工端 store/modules/user.js 完全隔離。
 */

const TOKEN_KEY = 'layerpilot-customer-token'

function getToken() {
  return window.localStorage.getItem(TOKEN_KEY) || ''
}

const state = () => ({
  accessToken: getToken(),
  customer: null,
})
const getters = {
  accessToken: (state) => state.accessToken,
  customer: (state) => state.customer,
}
const mutations = {
  setAccessToken(state, token) {
    state.accessToken = token
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  },
  setCustomer(state, customer) {
    state.customer = customer
  },
}
const actions = {
  setSession({ commit }, { token, customer }) {
    commit('setAccessToken', token)
    commit('setCustomer', customer)
  },
  resetAccessToken({ commit }) {
    commit('setAccessToken', '')
    commit('setCustomer', null)
  },
}
export default { state, getters, mutations, actions }
