export const portalSections = [
  { id: 'cases', number: '01', label: '列印案件', description: '從報價確認到製作交付，在這裡掌握每件作品。' },
  { id: 'quotes', number: '02', label: '報價與訊息', description: '查看報價、確認製作細節，與專員繼續討論。' },
  { id: 'orders', number: '03', label: '訂單與配送', description: '管理付款、查詢配送，或再次訂購喜歡的作品。' },
  { id: 'addresses', number: '04', label: '收件地址', description: '保存常用的收件資訊，讓下一次交付更簡單。' },
]
export function portalSection(id) {
  return portalSections.find((section) => section.id === id) || portalSections[0]
}
const statusLabels = {
  new: '新案件',
  submitted: '已送出',
  draft: '草稿',
  pending: '待處理',
  under_review: '專員確認中',
  reviewing: '專員確認中',
  converted: '已成立訂單',
  received: '已收到訂單',
  on_hold: '暫停製作',
  packed: '已包裝',
  created: '已建立',
  unverified: '待驗證',
  supplement_requested: '等待補件',
  awaiting_customer: '等待您的回覆',
  formal_quote_sent: '待確認報價',
  quoted: '待確認報價',
  accepted: '已接受報價',
  revision: '報價調整中',
  revision_requested: '報價調整中',
  rejected: '未接受',
  awaiting_payment: '等待付款',
  unpaid: '尚未付款',
  paid: '已付款',
  production_pending: '安排製作中',
  ready_to_print: '準備列印',
  queued: '排程中',
  printing: '列印中',
  in_production: '製作中',
  quality_check: '品質檢查中',
  ready_for_delivery: '待交付',
  shipped: '已出貨',
  delivered: '已送達',
  completed: '已完成',
  cancelled: '已取消',
  canceled: '已取消',
  aftersales: '售後處理中',
  refunded: '已退款',
  failed: '未完成',
  expired: '已到期',
  processing: '處理中',
  monthly_terms: '月結',
  waived: '免付款',
  not_configured: '尚未開放',
}
export function portalStatus(value) {
  return statusLabels[value] || '待專員確認'
}
export function portalStatusType(value) {
  if (['completed', 'paid', 'delivered', 'confirmed'].includes(value)) return 'success'
  if (['formal_quote_sent', 'quoted', 'awaiting_customer', 'supplement_requested', 'awaiting_payment'].includes(value)) return 'warning'
  if (['cancelled', 'canceled', 'failed', 'rejected'].includes(value)) return 'info'
  return 'primary'
}
export function portalMoney(value) {
  return value == null || value === '' || !Number.isFinite(Number(value)) ? '待確認' : `NT$ ${Number(value).toLocaleString('zh-TW')}`
}
export function portalSummary(cases, quotes) {
  return {
    active: cases.filter((item) => !['completed', 'cancelled'].includes(item.status)).length,
    awaiting:
      cases.filter((item) => ['formal_quote_sent', 'awaiting_customer', 'supplement_requested'].includes(item.status)).length +
      quotes.filter((item) => item.status === 'quoted' || (item.confirmations || []).some((detail) => detail.status === 'pending')).length,
    completed: cases.filter((item) => item.status === 'completed').length,
  }
}
