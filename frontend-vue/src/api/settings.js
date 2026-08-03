import request from '@/utils/request'

export function fetchWorkspaceSettings() {
  return request({ url: '/api/workspaceSettings', method: 'get' })
}

export function updateWorkspaceSettings(patch) {
  return request({ url: '/api/workspaceSettings', method: 'patch', data: patch })
}

export function setupTwoFactor() {
  return request({ url: '/api/auth/2fa/setup', method: 'post' })
}

export function enableTwoFactor(payload) {
  return request({ url: '/api/auth/2fa/enable', method: 'post', data: payload })
}

export function disableTwoFactor(payload) {
  return request({ url: '/api/auth/2fa/disable', method: 'post', data: payload })
}
