import customerRequest from '@/utils/customerRequest'

export function registerCustomer(payload) {
  return customerRequest({ url: '/api/customer-auth/register', method: 'post', data: payload })
}

export function claimCustomer(payload) {
  return customerRequest({ url: '/api/customer-auth/claim', method: 'post', data: payload })
}

export function loginCustomer(payload) {
  return customerRequest({ url: '/api/customer-auth/login', method: 'post', data: payload })
}

export function requestPasswordReset(email) {
  return customerRequest({ url: '/api/customer-auth/request-reset', method: 'post', data: { email } })
}

export function confirmPasswordReset(payload) {
  return customerRequest({ url: '/api/customer-auth/reset', method: 'post', data: payload })
}

export function fetchCustomerMe() {
  return customerRequest({ url: '/api/customer-auth/me', method: 'get' })
}

export function logoutCustomer() {
  return customerRequest({ url: '/api/customer-auth/logout', method: 'post' })
}
