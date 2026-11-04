export const adminTools = [
  { title: '案件與報價', note: '審查需求、補件與報價', to: '/cases/index', group: '接單與服務', scope: 'orders:write' },
  { title: '訂單與付款', note: '追蹤訂單、付款與交付', to: '/orders/index', group: '接單與服務' },
  { title: '會員服務', note: '處理申請、訊息與單據', to: '/member-service', group: '接單與服務', scope: 'orders:write' },
  { title: '免費列印站', note: '排隊、時段、異常與通知', to: '/free-print-admin', group: '生產與設備', scope: '*' },
  { title: '智慧排產', note: '依交期、工時、難度與顏色排程', to: '/scheduler/index', group: '生產與設備' },
  { title: '列印佇列', note: '追蹤正在製作與等待中的工作', to: '/queue/index', group: '生產與設備' },
  { title: '設備與連線', note: '機台狀態、硬體連接', to: '/printers/index', group: '生產與設備' },
  { title: '雲端切片', note: '模型、參數與切片結果', to: '/slicer/index', group: '生產與設備' },
  { title: 'AI 維修與保養', note: '日誌與照片診斷、跨機保養建議', to: '/maintenance/index', group: 'AI 與整合' },
  { title: 'MCP 與建模 Skill', note: '外部代理連接、規範套件下載', to: '/agent-tools', group: 'AI 與整合' },
  { title: 'AI 知識庫', note: '維護助理使用的服務知識', to: '/ai-knowledge/index', group: 'AI 與整合', scope: 'ai:write' },
  { title: '外部服務整合', note: '檢查既有服務與連線設定', to: '/integrations/index', group: 'AI 與整合' },
]
export function visibleAdminTools(permissions = []) {
  return adminTools.filter((t) => !t.scope || permissions.includes('*') || permissions.includes(t.scope))
}
export function adminNavGroup(path) {
  if (path === '/dashboard') return '工作總覽'
  if (['/cases', '/orders', '/customers', '/member-service'].includes(path)) return '接單與服務'
  if (['/printers', '/queue', '/scheduler', '/todos', '/slicer', '/free-print-admin'].includes(path)) return '生產與設備'
  if (['/files', '/products', '/filament', '/profiles'].includes(path)) return '檔案與材料'
  if (['/maintenance', '/agent-tools', '/ai-knowledge', '/integrations'].includes(path)) return 'AI 與整合'
  return '營運與設定'
}
export function stationControlAllowed(item, now = Date.now(), stale = false) {
  if (!item?.canControl || stale || !['notified', 'preparing', 'starting', 'printing', 'paused', 'awaiting_removal'].includes(item.status))
    return false
  if (['notified', 'preparing'].includes(item.status)) {
    const expires = Date.parse(item.leaseExpiresAt)
    return Number.isFinite(expires) && expires > now
  }
  return true
}
