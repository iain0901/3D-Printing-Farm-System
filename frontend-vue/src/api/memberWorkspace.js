import request from '@/utils/customerRequest'
const root = '/api/customer/workspace'
export const workspace = (path = '', method = 'get', data, options = {}) => request({ url: root + path, method, data, ...options })
export function uploadWorkspace(path, payload, files = [], sources = [], method = 'post', options = {}) {
  const form = new FormData()
  form.append('payload', JSON.stringify(payload))
  files.forEach((file) => form.append('files', file, file.name))
  sources.forEach((file) => form.append('sources', file, file.name))
  return workspace(path, method, form, { headers: { 'Content-Type': undefined }, timeout: 120000, ...options })
}
export async function modelFile(id, source = false) {
  return workspace(`/models/${encodeURIComponent(id)}/file${source ? '?source=1' : ''}`, 'get', undefined, { responseType: 'arraybuffer' })
}
