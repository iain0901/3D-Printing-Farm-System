/**
 * @description 员工端登录态：token、当前用户、由后端角色映射出的 scopes（作为 permissions 使用）
 */

import { ElNotification } from 'element-plus'
import { getUserInfo, login, logout } from '@/api/auth'
import { getAccessToken, removeAccessToken, setAccessToken } from '@/utils/accessToken'
import { resetRouter } from '@/router'
import { title } from '@/config'

const state = () => ({
  accessToken: getAccessToken(),
  currentUser: null,
  // 后端 sanitizeUser() 返回的 scopes（Owner/Admin 为 ['*']），驱动 asyncRoutes 过滤与 v-permissions 指令
  permissions: [],
  // Viewer 角色的 scopes 合法地为空数组，不能用 permissions.length 判断"是否已加载过用户信息"，
  // 否则路由守卫会对 Viewer 每次导航都重新拉取 /api/auth/me，见 src/config/permission.js
  userInfoLoaded: false,
})
const getters = {
  accessToken: (state) => state.accessToken,
  currentUser: (state) => state.currentUser,
  permissions: (state) => state.permissions,
  userInfoLoaded: (state) => state.userInfoLoaded,
  username: (state) => state.currentUser?.name || state.currentUser?.email || '',
  email: (state) => state.currentUser?.email || '',
  role: (state) => state.currentUser?.role || '',
}
const mutations = {
  setAccessToken(state, accessToken) {
    state.accessToken = accessToken
    setAccessToken(accessToken)
  },
  setCurrentUser(state, user) {
    state.currentUser = user
    state.userInfoLoaded = Boolean(user)
  },
  setPermissions(state, permissions) {
    state.permissions = permissions
  },
}
const actions = {
  setPermissions({ commit }, permissions) {
    commit('setPermissions', permissions)
  },
  // 返回后端登录响应；409（需要两步验证）/401/423 等错误由调用方（登录页）捕获处理。
  // 注意：这里只设置 accessToken，不提前设置 currentUser/permissions/userInfoLoaded ——
  // 路由守卫（src/config/permission.js）依赖 userInfoLoaded 是否已置位来判断"是否需要拉取
  // /api/auth/me 并注册 asyncRoutes"；若在此处提前置位会导致守卫误判为已注册，
  // 从而跳过 router.addRoute()，登录后主界面的动态路由永远不会被挂载。
  async login({ commit }, credentials) {
    const data = await login(credentials)
    commit('setAccessToken', data.token)
    const hour = new Date().getHours()
    const greeting = hour < 8 ? '早上好' : hour <= 11 ? '上午好' : hour <= 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好'
    ElNotification({
      title: `欢迎登录${title}`,
      message: `${greeting}，${data.user?.name || data.user?.email}！`,
      position: 'top-right',
      type: 'success',
    })
    return data
  },
  async getUserInfo({ commit }) {
    const data = await getUserInfo()
    if (!data?.user) return false
    commit('setCurrentUser', data.user)
    commit('setPermissions', data.user.scopes || [])
    return data.user.scopes || []
  },
  async logout({ dispatch }) {
    try {
      await logout()
    } catch {
      // 网络异常等情况下仍然清空本地登录态
    }
    await dispatch('resetAccessToken')
    await resetRouter()
  },
  resetAccessToken({ commit }) {
    commit('setPermissions', [])
    commit('setCurrentUser', null)
    commit('setAccessToken', '')
    removeAccessToken()
  },
}
export default { state, getters, mutations, actions }
