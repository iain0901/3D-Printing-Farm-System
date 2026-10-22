export function memberReturnPath(value) {
  return typeof value === 'string' && value.length <= 2000 && /^\/portal\/(?:workspace|dashboard)(?:[?#]|$)/.test(value)
    ? value
    : '/portal/dashboard'
}
