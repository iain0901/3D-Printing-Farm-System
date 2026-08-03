import store from '@/store'

export default {
  inserted(element, binding) {
    const { value } = binding
    const permissions = store.getters['user/permissions']
    if (value && value instanceof Array && value.length > 0) {
      // 后端 Owner/Admin 角色返回 scopes: ['*']，代表拥有全部权限
      const hasPermission = permissions.includes('*') || permissions.some((role) => value.includes(role))
      if (!hasPermission)
        element.parentNode && element.parentNode.removeChild(element)
    }
  },
}
