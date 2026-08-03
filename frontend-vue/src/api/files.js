import request from '@/utils/request'
import { getAccessToken } from '@/utils/accessToken'
import { baseURL } from '@/config'
import { idempotencyHeaders, clearIdempotency } from '@/utils/idempotency'

export function createFileFolder(payload) {
  const key = `file-folder:${payload.parent || ''}:${payload.name}:${payload.purpose}`
  return request({ url: '/api/file-folders', method: 'post', data: payload, headers: idempotencyHeaders(key, payload) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

// fileBlob: 浏览器 File 对象。不手动设置 Content-Type，交给瀏覽器自動帶上 multipart boundary
export function uploadModelFile(fileBlob, material = 'PLA', folder = 'Uploads') {
  const formData = new FormData()
  formData.append('file', fileBlob)
  formData.append('material', material)
  formData.append('folder', folder)
  const key = `file-upload:${fileBlob.name}:${fileBlob.size}:${fileBlob.lastModified}:${material}:${folder}`
  return request({
    url: '/api/files/upload',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': undefined, ...idempotencyHeaders(key, { name: fileBlob.name, size: fileBlob.size, lastModified: fileBlob.lastModified, material, folder }) },
  }).then((file) => {
    clearIdempotency(key)
    return file
  })
}

export function fetchFilePreview(fileId) {
  return request({ url: `/api/files/${fileId}/preview`, method: 'get' })
}

// 給前端 3D 檢視器用的原始檔案位元組，重用員工既有的下載端點，只是回傳 ArrayBuffer 而不觸發瀏覽器另存
export function fetchFileRaw(fileId) {
  return request({ url: `/api/files/${fileId}/download`, method: 'get', responseType: 'arraybuffer' })
}

export function deleteFile(fileId) {
  const key = `file-delete:${fileId}`
  return request({ url: `/api/files/${fileId}`, method: 'delete', headers: idempotencyHeaders(key, { fileId }) }).then((result) => {
    clearIdempotency(key)
    return result
  })
}

// 下载需要带 Authorization header，不能直接用 <a href> 打开；用 blob 方式落地后触发瀏覽器另存
export async function downloadFile(file) {
  const token = getAccessToken()
  const response = await fetch(`${baseURL}/api/files/${file.id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Download failed ${response.status}`)
  const blob = await response.blob()
  const disposition = response.headers.get('content-disposition') || ''
  const filename = disposition.match(/filename="([^"]+)"/)?.[1] || file.name
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
