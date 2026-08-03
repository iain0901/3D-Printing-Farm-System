import store from '@/store'

/**
 * @author https://github.com/zxwk1998/vue-admin-better （不想保留author可删除）
 * @description 检查权限
 * @param value
 * @returns {boolean}
 */
export default function checkPermission(value) {
  if (value && value instanceof Array && value.length > 0) {
    const permissions = store.getters['user/permissions']
    // 后端 Owner/Admin 角色返回 scopes: ['*']，代表拥有全部权限
    if (permissions.includes('*')) return true
    const permissionPermissions = value

    return permissions.some((role) => {
      return permissionPermissions.includes(role)
    })
  } else {
    return false
  }
}
