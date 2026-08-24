import baseMessage from '@/utils/baseMessage'
import axios from 'axios'
import { baseURL, contentType, requestTimeout } from '@/config'
import store from '@/store'
import router from '@/router'

/**
 * @description 客戶端（Customer Portal）獨立的 axios 實例：獨立 token 來源、獨立 401 導向，
 * 確保 customerAuth/accessToken 絕不會被夾帶到員工端（utils/request.js）的請求上，反之亦然。
 */

const instance = axios.create({
  baseURL,
  timeout: requestTimeout,
  headers: { 'Content-Type': contentType },
})

instance.interceptors.request.use((config) => {
  const token = store.getters['customerAuth/accessToken']
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

instance.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const { response } = error
    if (!response) {
      baseMessage('連線異常，請稍後再試', 'error')
      return Promise.reject(error)
    }
    const message = response.data && response.data.error
    if (response.status === 401) {
      store.dispatch('customerAuth/resetAccessToken').catch(() => {})
      if (router.currentRoute.path !== '/portal/login') router.push('/portal/login').catch(() => {})
    }
    baseMessage(message || `請求失敗（${response.status}）`, 'error')
    return Promise.reject(error)
  }
)

export default instance
