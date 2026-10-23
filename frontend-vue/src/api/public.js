import axios from 'axios'
import { baseURL, contentType, requestTimeout } from '@/config'

/**
 * @description 公開端點（行銷網站報價表單/報價狀態查詢）不需要任何登入態，
 * 刻意不共用員工端 utils/request.js 或客戶端 utils/customerRequest.js 的攔截器，
 * 避免不小心把已登入使用者的 token 夾帶到匿名請求上。
 */
const publicRequest = axios.create({
  baseURL,
  timeout: requestTimeout,
  headers: { 'Content-Type': contentType },
})

export function createStationSlice(file, settings, onUploadProgress) {
  const data = new FormData()
  data.append('payload', JSON.stringify({ ...settings, purpose: 'free-print', quantity: 1 }))
  for (const model of Array.isArray(file) ? file : [file]) data.append('file', model)
  return publicRequest
    .post('/api/public/slicing-quotes', data, { headers: { 'Content-Type': undefined }, timeout: 120000, onUploadProgress })
    .then((r) => r.data)
}

export function fetchStationSlice(id, token, layers = false) {
  return publicRequest
    .get(`/api/public/slicing-quotes/${encodeURIComponent(id)}${layers ? '/layers' : ''}`, {
      headers: { 'x-slicing-token': token },
    })
    .then((r) => r.data)
}
export function createStudioSlice(files, settings, onUploadProgress) {
  const data = new FormData()
  data.append('payload', JSON.stringify({ ...settings, purpose: 'studio', quantity: 1 }))
  for (const file of files) data.append('file', file)
  return publicRequest
    .post('/api/public/slicing-quotes', data, { headers: { 'Content-Type': undefined }, timeout: 120000, onUploadProgress })
    .then((r) => r.data)
}
export function fetchToolpaths(id, token) {
  return publicRequest
    .get(`/api/public/slicing-quotes/${encodeURIComponent(id)}/toolpaths`, { headers: { 'x-slicing-token': token } })
    .then((r) => r.data)
}

export function cancelStationSlice(id, token) {
  return publicRequest
    .delete(`/api/public/slicing-quotes/${encodeURIComponent(id)}`, { headers: { 'x-slicing-token': token } })
    .then((r) => r.data)
}

// file 是可選的瀏覽器 File 物件；有帶檔案時走 multipart（後端 parsePublicQuoteRequestPayload 會解析並做
// 模型解析/分件偵測），沒有檔案時走一般 JSON（維持原本免上傳也能送出估價需求的路徑）。
export function submitPublicQuoteRequest(payload, file) {
  if (!file) return publicRequest.post('/api/public/quoteRequests', payload).then((r) => r.data)
  const formData = new FormData()
  formData.append('file', file)
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    // partColors 是物件陣列（{index, color}），要整個 JSON 序列化成一個欄位；其他陣列欄位（如 postProcessing）維持逗號分隔字串
    if (key === 'partColors') {
      formData.append(key, JSON.stringify(value))
    } else {
      formData.append(key, Array.isArray(value) ? value.join(',') : String(value))
    }
  })
  return publicRequest.post('/api/public/quoteRequests', formData, { headers: { 'Content-Type': undefined } }).then((r) => r.data)
}

export function fetchPublicQuoteStatus(id, token) {
  return publicRequest.get(`/api/public/quoteRequests/${id}`, { params: { token } }).then((r) => r.data)
}

export function decidePublicQuote(id, token, decision, note = '') {
  return publicRequest.post(`/api/public/quoteRequests/${id}/decision`, { token, decision, note }).then((r) => r.data)
}

// 比價用參考估價，不代表實際檔案報價（後端用固定參考件尺寸換算）
export function fetchPricingEstimate(payload) {
  return publicRequest.post('/api/public/pricing-estimate', payload).then((r) => r.data)
}

// 送出報價需求前的無狀態檔案解析（尺寸/重量/工時/多零件偵測），不會建立任何報價需求記錄
export function fetchModelPreview(file, material) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('material', material || 'PLA')
  return publicRequest.post('/api/public/model-preview', formData, { headers: { 'Content-Type': undefined } }).then((r) => r.data)
}
