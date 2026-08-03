/**
 * @description 路由拦截状态管理。本项目固定使用 intelligence 模式：asyncRoutes 在前端定义，
 * 按 store.getters['user/permissions']（即后端返回的 scopes）过滤后动态挂载，不使用后端下发路由表的 all 模式。
 */
import { asyncRoutes, constantRoutes } from '@/router'
import { filterAsyncRoutes } from '@/utils/handleRoutes'

const state = () => ({
  routes: [],
})
const getters = {
  routes: (state) => state.routes,
}
const mutations = {
  setRoutes(state, routes) {
    state.routes = constantRoutes.concat(routes)
  },
}
const actions = {
  async setRoutes({ commit }, permissions) {
    const accessedRoutes = filterAsyncRoutes(asyncRoutes, permissions)
    commit('setRoutes', accessedRoutes)
    return accessedRoutes
  },
}
export default { state, getters, mutations, actions }
