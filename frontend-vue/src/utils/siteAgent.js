const nodes = new Map()
let nextId = 0
export function siteContext() {
  nodes.clear()
  const controls = []
  for (const el of document.querySelectorAll(
    'input, select, textarea, button, a[href], [role="button"], [role="combobox"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"]'
  )) {
    if (
      el.closest('[data-site-agent], [aria-disabled="true"], .is-disabled') ||
      el.matches(':disabled') ||
      el.readOnly ||
      !el.getClientRects().length
    )
      continue
    const label = (
      el.getAttribute('aria-label') ||
      el.labels?.[0]?.innerText ||
      el.closest('label')?.innerText ||
      el.getAttribute('placeholder') ||
      el.textContent ||
      ''
    )
      .trim()
      .slice(0, 200)
    if (!label || /密碼|憑證|金鑰|刪除帳號|付款|結帳|password|secret|token|api.?key/i.test(label + ' ' + (el.name || ''))) continue
    if (el.tagName === 'TEXTAREA' && !/用途|模型|說明|備註/.test(label)) continue
    if (el.tagName === 'INPUT' && !['number', 'text', 'checkbox', 'radio', 'range'].includes(el.type)) continue
    if (el.tagName === 'A' && (new URL(el.href).origin !== location.origin || !new URL(el.href).hash.startsWith('#/'))) continue
    const id = el.dataset.agentId || (el.dataset.agentId = `control-${++nextId}`)
    nodes.set(id, el)
    controls.push({
      id,
      label,
      type: el.type || el.tagName.toLowerCase(),
      value: String(['checkbox', 'radio'].includes(el.type) ? el.checked : el.value ?? '').slice(0, 500),
    })
    if (controls.length >= 150) break
  }
  return { page: location.hash, controls }
}
export async function performSiteAction(action, isCurrent = () => true) {
  const el = nodes.get(action.target)
  if (!el || !el.isConnected || el.disabled || !el.getClientRects().length) throw new Error('畫面已變更，請重新提出操作。')
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus()
  const previous = el.style.outline
  el.style.outline = '3px solid #c47c43'
  await new Promise((resolve) => setTimeout(resolve, 650))
  try {
    if (!isCurrent() || !el.isConnected || el.matches(':disabled') || !el.getClientRects().length)
      throw new Error('操作畫面或登入狀態已變更，已取消操作。')
    if (action.operation === 'click') {
      if (
        !['BUTTON', 'A'].includes(el.tagName) &&
        !['button', 'combobox', 'option', 'switch', 'checkbox', 'radio', 'tab'].includes(el.getAttribute('role'))
      )
        throw new Error('不是可點擊按鈕')
      el.click()
    } else {
      if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.readOnly) throw new Error('不是可編輯欄位')
      if (
        ['number', 'range'].includes(el.type) &&
        (!Number.isFinite(Number(action.value)) ||
          (el.min !== '' && Number(action.value) < Number(el.min)) ||
          (el.max !== '' && Number(action.value) > Number(el.max)))
      )
        throw new Error('數值超出允許範圍')
      if (el.tagName === 'SELECT' && ![...el.options].some((o) => !o.disabled && o.value === action.value)) throw new Error('選項不存在')
      if (['checkbox', 'radio'].includes(el.type)) {
        if (!['true', 'false'].includes(action.value) || (el.type === 'radio' && action.value !== 'true')) throw new Error('勾選值無效')
        el.checked = action.value === 'true'
      } else {
        const before = el.value
        el.value = action.value
        if (!el.checkValidity()) {
          el.value = before
          throw new Error('欄位內容不符合限制')
        }
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    await new Promise((resolve) => setTimeout(resolve, 700))
  } finally {
    el.style.outline = previous
  }
}
