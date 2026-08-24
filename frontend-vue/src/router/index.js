/**
 * @description router 全局配置。asyncRoutes 在 intelligence 模式下按 store.getters['user/permissions']
 * (即后端 scopes，Owner/Admin 为 ['*']) 过滤后动态挂载，见 src/config/permission.js。
 * Phase 1 仅提供登录后的落地页 Dashboard 占位；其余 19 个业务视图在后续 Phase 依计划逐一加入，
 * 详见 C:\Users\USER\.claude\plans\polished-swinging-scroll.md 的 Migration Phases。
 */

import { createRouter, createWebHashHistory, createWebHistory } from 'vue-router'
import Layout from '@/layouts'
import { publicPath, routerMode } from '@/config'
export const constantRoutes = [
  {
    // 品牌落地頁：公開行銷首頁（服務、流程、方案、FAQ），CTA 導向 /quote 估價。
    path: '/',
    name: 'Landing',
    component: () => import('@/views/landing/Index'),
    hidden: true,
  },
  {
    // 估價精靈：公開，客戶從落地頁 CTA 進入；/quote/new 為相容重導向。
    path: '/quote',
    name: 'QuoteWizard',
    component: () => import('@/views/quote/Wizard'),
    hidden: true,
  },
  {
    path: '/quote/new',
    redirect: '/quote',
    hidden: true,
  },
  {
    path: '/customer/cases/:id',
    component: () => import('@/views/portal/Case'),
    hidden: true,
  },
  {
    path: '/login',
    component: () => import('@/views/login/index'),
    hidden: true,
  },
  {
    path: '/portal/login',
    component: () => import('@/views/portal/Login'),
    hidden: true,
  },
  {
    path: '/portal/register',
    component: () => import('@/views/portal/Register'),
    hidden: true,
  },
  {
    path: '/portal/reset',
    component: () => import('@/views/portal/Reset'),
    hidden: true,
  },
  {
    path: '/portal/dashboard',
    component: () => import('@/layouts/PortalLayout'),
    children: [{ path: '', component: () => import('@/views/portal/Dashboard') }],
    hidden: true,
  },
  {
    path: '/401',
    name: '401',
    component: () => import('@/views/401'),
    hidden: true,
  },
  {
    path: '/404',
    name: '404',
    component: () => import('@/views/404'),
    hidden: true,
  },
]

export const asyncRoutes = [
  {
    path: '/cases',
    component: Layout,
    redirect: '/cases/index',
    children: [
      {
        path: 'index',
        name: 'Cases',
        component: () => import('@/views/cases/index'),
        meta: {
          title: '3DRFM 案件中心',
          icon: 'clipboard-list',
          permissions: ['orders:write'],
        },
      },
    ],
  },
  {
    path: '/dashboard',
    component: Layout,
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/dashboard/index'),
        meta: {
          title: '生产总览',
          icon: 'chart-line',
          affix: true,
        },
      },
    ],
  },
  {
    path: '/printers',
    component: Layout,
    redirect: '/printers/index',
    children: [
      {
        path: 'index',
        name: 'Printers',
        component: () => import('@/views/printers/index'),
        meta: {
          title: '打印机',
          icon: 'print',
        },
      },
    ],
  },
  {
    path: '/files',
    component: Layout,
    redirect: '/files/index',
    children: [
      {
        path: 'index',
        name: 'Files',
        component: () => import('@/views/files/index'),
        meta: {
          title: '档案库',
          icon: 'folder-open',
        },
      },
    ],
  },
  {
    path: '/queue',
    component: Layout,
    redirect: '/queue/index',
    children: [
      {
        path: 'index',
        name: 'Queue',
        component: () => import('@/views/queue/index'),
        meta: {
          title: '打印队列',
          icon: 'list-check',
        },
      },
    ],
  },
  {
    path: '/scheduler',
    component: Layout,
    redirect: '/scheduler/index',
    children: [
      {
        path: 'index',
        name: 'Scheduler',
        component: () => import('@/views/scheduler/index'),
        meta: {
          title: '排程',
          icon: 'calendar-alt',
        },
      },
    ],
  },
  {
    path: '/todos',
    component: Layout,
    redirect: '/todos/index',
    children: [
      {
        path: 'index',
        name: 'Todos',
        component: () => import('@/views/todos/index'),
        meta: {
          title: '自动待办',
          icon: 'tasks',
        },
      },
    ],
  },
  {
    path: '/slicer',
    component: Layout,
    redirect: '/slicer/index',
    children: [
      {
        path: 'index',
        name: 'Slicer',
        component: () => import('@/views/slicer/index'),
        meta: {
          title: '云端切片',
          icon: 'cube',
        },
      },
    ],
  },
  {
    path: '/orders',
    component: Layout,
    redirect: '/orders/index',
    children: [
      {
        path: 'index',
        name: 'Orders',
        component: () => import('@/views/orders/index'),
        meta: {
          title: '订单',
          icon: 'receipt',
        },
      },
    ],
  },
  {
    path: '/products',
    component: Layout,
    redirect: '/products/index',
    children: [
      {
        path: 'index',
        name: 'Products',
        component: () => import('@/views/products/index'),
        meta: {
          title: '产品',
          icon: 'box-open',
        },
      },
    ],
  },
  {
    path: '/customers',
    component: Layout,
    redirect: '/customers/index',
    children: [
      {
        path: 'index',
        name: 'Customers',
        component: () => import('@/views/customers/index'),
        meta: {
          title: '客户',
          icon: 'users',
        },
      },
    ],
  },
  {
    path: '/filament',
    component: Layout,
    redirect: '/filament/index',
    children: [
      {
        path: 'index',
        name: 'Filament',
        component: () => import('@/views/filament/index'),
        meta: {
          title: '线材库存',
          icon: 'layer-group',
        },
      },
    ],
  },
  {
    path: '/profiles',
    component: Layout,
    redirect: '/profiles/index',
    children: [
      {
        path: 'index',
        name: 'Profiles',
        component: () => import('@/views/profiles/index'),
        meta: {
          title: '设定档',
          icon: 'sliders-h',
        },
      },
    ],
  },
  {
    path: '/analytics',
    component: Layout,
    redirect: '/analytics/index',
    children: [
      {
        path: 'index',
        name: 'Analytics',
        component: () => import('@/views/analytics/index'),
        meta: {
          title: '分析',
          icon: 'chart-bar',
        },
      },
    ],
  },
  {
    path: '/history',
    component: Layout,
    redirect: '/history/index',
    children: [
      {
        path: 'index',
        name: 'History',
        component: () => import('@/views/history/index'),
        meta: {
          title: '历史记录',
          icon: 'history',
        },
      },
    ],
  },
  {
    path: '/maintenance',
    component: Layout,
    redirect: '/maintenance/index',
    children: [
      {
        path: 'index',
        name: 'Maintenance',
        component: () => import('@/views/maintenance/index'),
        meta: {
          title: '维护',
          icon: 'wrench',
        },
      },
    ],
  },
  {
    path: '/team',
    component: Layout,
    redirect: '/team/index',
    children: [
      {
        path: 'index',
        name: 'Team',
        component: () => import('@/views/team/index'),
        meta: {
          title: '团队',
          icon: 'user-friends',
          permissions: ['users:write'],
        },
      },
    ],
  },
  {
    path: '/integrations',
    component: Layout,
    redirect: '/integrations/index',
    children: [
      {
        path: 'index',
        name: 'Integrations',
        component: () => import('@/views/integrations/index'),
        meta: {
          title: '整合',
          icon: 'plug',
        },
      },
    ],
  },
  {
    path: '/ai-knowledge',
    component: Layout,
    redirect: '/ai-knowledge/index',
    children: [
      {
        path: 'index',
        name: 'AiKnowledge',
        component: () => import('@/views/ai-knowledge/index'),
        meta: {
          title: 'AI 知識庫',
          icon: 'comment-dots',
          permissions: ['ai:write'],
        },
      },
    ],
  },
  {
    path: '/addons',
    component: Layout,
    redirect: '/addons/index',
    children: [
      {
        path: 'index',
        name: 'Addons',
        component: () => import('@/views/addons/index'),
        meta: {
          title: '附加功能',
          icon: 'puzzle-piece',
        },
      },
    ],
  },
  {
    path: '/notifications',
    component: Layout,
    redirect: '/notifications/index',
    children: [
      {
        path: 'index',
        name: 'Notifications',
        component: () => import('@/views/notifications/index'),
        meta: {
          title: '通知',
          icon: 'bell',
        },
      },
    ],
  },
  {
    path: '/settings',
    component: Layout,
    redirect: '/settings/index',
    children: [
      {
        path: 'index',
        name: 'Settings',
        component: () => import('@/views/settings/index'),
        meta: {
          title: '设置',
          icon: 'cog',
        },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404',
    hidden: true,
  },
]

const router = createRouter({
  history:
    routerMode === 'history' ? createWebHistory(publicPath) : createWebHashHistory(publicPath),
  scrollBehavior: () => ({
    top: 0,
    left: 0,
  }),
  routes: constantRoutes,
})

export function resetRouter() {
  location.reload()
}

export default router
