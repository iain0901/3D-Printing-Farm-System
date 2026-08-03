import customerRequest from '@/utils/customerRequest'

export function fetchMyQuotes() {
  return customerRequest({ url: '/api/customer/quotes', method: 'get' })
}

export function fetchMyOrders() {
  return customerRequest({ url: '/api/customer/orders', method: 'get' })
}

// decision: 'accepted' | 'rejected' | 'revision'
export function decideQuote(quoteId, decision, note = '') {
  return customerRequest({ url: `/api/customer/quotes/${quoteId}/decision`, method: 'post', data: { decision, note } })
}

export function sendQuoteMessage(quoteId, body) {
  return customerRequest({ url: `/api/customer/quotes/${quoteId}/messages`, method: 'post', data: { body } })
}

export function fetchPaymentMethods() {
  return customerRequest({ url: '/api/customer/payment-methods', method: 'get' })
}

// paymentMethod: 'jkopay' | 'linepay' | 'payuni'
export function checkoutOrder(orderId, paymentMethod) {
  return customerRequest({ url: `/api/customer/orders/${orderId}/checkout`, method: 'post', data: { paymentMethod } })
}

export function fetchOrderTracking(orderId) {
  return customerRequest({ url: `/api/customer/orders/${orderId}/tracking`, method: 'get' })
}

export function fetchAddresses() {
  return customerRequest({ url: '/api/customer/addresses', method: 'get' })
}

export function createAddress(payload) {
  return customerRequest({ url: '/api/customer/addresses', method: 'post', data: payload })
}

export function updateAddress(id, payload) {
  return customerRequest({ url: `/api/customer/addresses/${id}`, method: 'patch', data: payload })
}

export function deleteAddress(id) {
  return customerRequest({ url: `/api/customer/addresses/${id}`, method: 'delete' })
}

export function reorder(orderId) {
  return customerRequest({ url: `/api/customer/orders/${orderId}/reorder`, method: 'post' })
}

export function applyCoupon(orderId, code) {
  return customerRequest({ url: `/api/customer/orders/${orderId}/apply-coupon`, method: 'post', data: { code } })
}

export function redeemPoints(orderId, points) {
  return customerRequest({ url: `/api/customer/orders/${orderId}/redeem-points`, method: 'post', data: { points } })
}

export function fetchQuoteFilePreview(quoteId) {
  return customerRequest({ url: `/api/customer/quotes/${quoteId}/file-preview`, method: 'get' })
}

// 給前端 3D 檢視器（three.js）用的原始檔案位元組，回應攔截器對 arraybuffer 一樣只是原樣回傳 response.data
export function fetchQuoteFileRaw(quoteId) {
  return customerRequest({ url: `/api/customer/quotes/${quoteId}/file-raw`, method: 'get', responseType: 'arraybuffer' })
}
