export const agentDestinations = Object.freeze({
  'go:free-print': { path: '/portal/free-slicer', label: '前往清華大學水木書苑免費列印並準備模型' },
  'go:free-upload': { path: '/portal/free-slicer', label: '選擇水木書苑並前往模型上傳按鈕', upload: true },
  'go:station': { path: '/free-print/nthu-shuimu', label: '查看清華大學水木書苑站點介紹' },
  'go:paid-print': { path: '/portal/print', label: '前往付費列印工作台' },
  'go:orders': { path: '/portal/dashboard?tab=orders', label: '查看我的訂單進度' },
  'go:models': { path: '/portal/workspace?section=models', label: '查看模型庫與下載' },
  'go:queue': { path: '/portal/free-print', label: '查看免費列印排隊及我的時段' },
});
export function mayAutoExecute(action, label = '') {
  if (action.commandId) return false; // External MCP proposals retain their existing confirmation contract.
  if (action.operation === 'click' && agentDestinations[action.target]) return true;
  return action.operation === 'fill' && /填充|層高|外壁|壁數|用途|備註/.test(label) && !/密碼|付款|訂單|刪除|金鑰/.test(label);
}
