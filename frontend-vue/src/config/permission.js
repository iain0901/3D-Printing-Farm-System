/**
 * @author https://github.com/zxwk1998/vue-admin-better （不想保留author可删除）
 * @description 路由守卫，目前两种模式：all模式与intelligence模式
 */
import router from '@/router'
import store from '@/store'
import VabProgress from 'nprogress'
import 'nprogress/nprogress.css'
import getPageTitle from '@/utils/pageTitle'
import { authentication, loginInterception, progressBar, recordRoute, routesWhiteList } from '@/config'

VabProgress.configure({
  easing: 'ease',
  speed: 500,
  trickleSpeed: 200,
  showSpinner: false,
})
router.beforeResolve(async (to, from, next) => {
  if (progressBar) VabProgress.start()

  // 公開客戶端路由：品牌落地頁 (/)、估價精靈 (/quote*)、案件追蹤 (/customer/cases/*，
  // 以 token 驗證)、與整個 /portal/* 客戶入口，皆不走員工端 accessToken 守衛邏輯
  // （否則匿名客戶會被強制導去 /login 員工登入頁）。
  const isPublicPath =
    to.path === '/' ||
    to.path.startsWith('/portal') ||
    to.path.startsWith('/quote') ||
    to.path.startsWith('/customer/cases')
  if (isPublicPath) {
    next()
    if (progressBar) VabProgress.done()
    document.title = getPageTitle(to.meta.title)
    return
  }

  let hasToken = store.getters['user/accessToken']

  if (!loginInterception) hasToken = true

  if (hasToken) {
    if (to.path === '/login') {
      next({ path: '/dashboard' })
      if (progressBar) VabProgress.done()
    } else {
      // 不能用 permissions.length 判断是否已加载过用户信息：Viewer 角色的 scopes 合法地为空数组
      const userInfoLoaded = store.getters['user/userInfoLoaded']
      if (userInfoLoaded) {
        next()
      } else {
        try {
          let permissions
          if (!loginInterception) {
            //settings.js loginInterception为false时，创建虚拟权限（拥有全部权限）
            await store.dispatch('user/setPermissions', ['*'])
            permissions = ['*']
          } else {
            permissions = await store.dispatch('user/getUserInfo')
          }

          let accessRoutes = []
          if (authentication === 'intelligence') {
            accessRoutes = await store.dispatch('routes/setRoutes', permissions)
          } else if (authentication === 'all') {
            accessRoutes = await store.dispatch('routes/setAllRoutes')
          }
          accessRoutes.forEach((item) => {
            router.addRoute(item)
          })
          next({ ...to, replace: true })
        } catch {
          await store.dispatch('user/resetAccessToken')
          if (progressBar) VabProgress.done()
        }
      }
    }
  } else {
    if (routesWhiteList.indexOf(to.path) !== -1) {
      next()
    } else {
      if (recordRoute) {
        next(`/login?redirect=${to.path}`)
      } else {
        next('/login')
      }

      if (progressBar) VabProgress.done()
    }
  }
  document.title = getPageTitle(to.meta.title)
})
router.afterEach(() => {
  if (progressBar) VabProgress.done()
})
