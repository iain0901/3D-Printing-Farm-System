import Vue from 'vue'
import axios from 'axios'
import { baseURL, contentType, invalidCode, lockedCode, loginInterception, noPermissionCode, requestTimeout } from '@/config'
import store from '@/store'
import router from '@/router'

/**
 * @description api/server.mjs 不使用 {code,msg,data} 信封：
 * 成功时响应体就是业务数据本身；失败时响应体是 { error, ...extra }，
 * 语义完全由 HTTP 状态码表达（401 未登录、403 无权限、423 账户锁定等）。
 * 因此这里不能照搬模板原版按 body.code 判断成功/失败的拦截器，必须按状态码分流。
 */

const retryConfig = {
  retry: 3,
  retryDelay: 1000,
}

const instance = axios.create({
  baseURL,
  timeout: requestTimeout,
  headers: {
    'Content-Type': contentType,
  },
})

instance.defaults.retry = retryConfig.retry
instance.defaults.retryDelay = retryConfig.retryDelay

// 请求拦截器：附加 Authorization: Bearer <token>
instance.interceptors.request.use(
  (config) => {
    const accessToken = store.getters['user/accessToken']
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

function redirectToLogin() {
  const current = router.currentRoute
  if (current && current.path === '/login') return
  const redirect = current && current.fullPath !== '/' ? current.fullPath : undefined
  router.push({ path: '/login', query: redirect ? { redirect } : undefined }).catch(() => {})
}

// 响应拦截器：成功直接返回 response.data（无信封），失败按 HTTP 状态码分流
instance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const { config, response } = error

    // 仅对网络层错误（无响应）或 5xx 做重试，401/403/423 等业务错误不重试
    const shouldRetry = config && config.retry && (!response || response.status >= 500)
    if (shouldRetry) {
      config.__retryCount = config.__retryCount || 0
      if (config.__retryCount < config.retry) {
        config.__retryCount += 1
        return new Promise((resolve) => setTimeout(resolve, config.retryDelay || 1000)).then(() => instance(config))
      }
    }

    if (!response) {
      const message = error.message === 'Network Error' ? '后端接口连接异常' : error.message && error.message.includes('timeout') ? '后端接口请求超时' : '后端接口未知异常'
      Vue.prototype.$baseMessage(message, 'error')
      return Promise.reject(error)
    }

    const { status, data } = response
    const serverMessage = data && data.error

    switch (status) {
      case invalidCode: // 401：未登录或 token 失效
        Vue.prototype.$baseMessage(serverMessage || '登录状态已失效，请重新登录', 'error')
        if (loginInterception) {
          store.dispatch('user/resetAccessToken').catch(() => {})
          redirectToLogin()
        }
        break
      case noPermissionCode: // 403：已登录但无权限，不登出
        Vue.prototype.$baseMessage(serverMessage || '没有权限执行此操作', 'error')
        break
      case lockedCode: // 423：账户临时锁定
        Vue.prototype.$baseMessage(serverMessage || '账户已被临时锁定，请稍后再试', 'error')
        break
      default:
        Vue.prototype.$baseMessage(serverMessage || `后端接口 ${status} 异常`, 'error')
        break
    }
    return Promise.reject(error)
  }
)

export default instance
