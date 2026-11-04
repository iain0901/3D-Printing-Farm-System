export function memberReturnPath(value) {
  return typeof value === 'string' && value.length <= 2000 && /^\/portal\/(?:workspace|dashboard|print|free-slicer|free-print)(?:[?#]|$)/.test(value)
    ? value
    : '/portal/dashboard'
}
