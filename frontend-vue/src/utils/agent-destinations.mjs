export const agentDestinations = Object.freeze({
  'go:free-print': { path: '/portal/free-slicer', label: '前往清華大學水木書苑免費列印並準備模型' },
  'go:free-upload': { path: '/portal/free-slicer', label: '選擇水木書苑並前往模型上傳按鈕', upload: true },
  'go:station': { path: '/free-print/nthu-shuimu', label: '查看清華大學水木書苑站點介紹' },
  'go:paid-print': { path: '/portal/print', label: '前往付費列印工作台' },
  'go:orders': { path: '/portal/dashboard?tab=orders', label: '查看我的訂單進度' },
  'go:models': { path: '/portal/workspace?section=models', label: '查看模型庫與下載' },
  'go:queue': { path: '/portal/free-print', label: '查看免費列印排隊及我的時段' },
  'go:home': { path: '/portal/dashboard', label: '回到會員工作台首頁' },
  'go:drafts': { path: '/portal/workspace?section=drafts', label: '繼續先前保存的草稿' },
  'go:cases': { path: '/portal/dashboard?tab=cases', label: '查看我的案件進度' },
  'go:support': { path: '/portal/workspace?section=support', label: '聯絡專員與售後申請' },
  'go:settings': { path: '/portal/workspace?section=settings', label: '查看會員設定' },
  'go:billing': { path: '/portal/workspace?section=billing', label: '查看付款紀錄與單據' },
  'go:projects': { path: '/portal/workspace?section=projects', label: '查看專案協作' },
  'go:staff-home': { path: '/dashboard', label: '回到營運管理總覽', staff: true },
  'go:staff-orders': { path: '/orders/index', label: '管理訂單進度', staff: true },
  'go:staff-cases': { path: '/cases/index', label: '管理案件與報價', staff: true },
  'go:staff-schedule': { path: '/scheduler/index', label: '查看生產排程', staff: true },
  'go:staff-maintenance': { path: '/maintenance/index', label: '設備維護與診斷', staff: true },
  'go:staff-members': { path: '/customers/index', label: '查看客戶資料', staff: true },
});
export function mayAutoExecute(action, label = '') {
  if (action.commandId) return false; // External MCP proposals retain their existing confirmation contract.
  if (action.operation === 'click' && agentDestinations[action.target]) return true;
  return action.operation === 'fill' && /填充|層高|外壁|壁數|用途|備註/.test(label) && !/密碼|付款|訂單|刪除|金鑰/.test(label);
}
