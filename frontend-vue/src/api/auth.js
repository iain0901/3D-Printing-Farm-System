import request from '@/utils/request'

export function login(data) {
  // data: { email, password, twoFactorCode? }
  return request({
    url: '/api/auth/login',
    method: 'post',
    data,
  })
}

export function getUserInfo() {
  return request({
    url: '/api/auth/me',
    method: 'get',
  })
}

export function logout() {
  return request({
    url: '/api/auth/logout',
    method: 'post',
  })
}
