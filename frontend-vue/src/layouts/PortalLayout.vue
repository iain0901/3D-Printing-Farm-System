<template>
  <div class="portal-layout brand-surface">
    <a class="portal-skip" href="#member-content" @click.prevent="$refs.content.focus()">跳至主要內容</a>
    <aside class="portal-sidebar">
      <router-link to="/portal/dashboard" class="portal-brand" aria-label="3DRFM，回到工作台">
        <brand-mark subtitle="會員工作台" />
      </router-link>
      <button class="member-mobile-menu" :aria-expanded="mobileMenu" aria-controls="member-navigation" @click="mobileMenu = !mobileMenu">{{ mobileMenu ? '收起選單' : '功能選單' }}</button>
      <nav id="member-navigation" aria-label="會員導覽" :class="{ 'mobile-open': mobileMenu }" @click="mobileMenu = false">
        <template v-for="group in navGroups" :key="group.label">
        <p class="nav-group-label">{{ group.label }}</p>
        <router-link
          v-for="item in group.items"
          :key="item.id"
          :to="item.to"
          :class="{ selected: activeSection === item.id }"
          :aria-current="activeSection === item.id ? 'page' : undefined"
        >
          <el-icon aria-hidden="true"><component :is="item.icon" /></el-icon>
          {{ item.label }}
        </router-link>
        </template>
      </nav>
      <div class="sidebar-support">
        <span class="support-label">操作遇到問題？</span>
        <router-link to="/portal/workspace?section=support">
          詢問專員
          <span aria-hidden="true">→</span>
        </router-link>
      </div>
      <router-link class="back-to-site" to="/">← 返回品牌官網</router-link>
    </aside>
    <div class="portal-workspace">
      <header class="portal-header">
        <span class="portal-breadcrumb">
          <span class="breadcrumb-root">會員中心 ／</span>
          <b>{{ sectionTitle }}</b>
        </span>
        <div class="portal-account">
          <router-link class="header-notifications" to="/portal/workspace?section=notifications" :aria-current="$route.query.section === 'notifications' ? 'page' : undefined">
            <el-icon aria-hidden="true"><Bell /></el-icon><span>通知</span>
          </router-link>
          <el-dropdown ref="accountDropdown" trigger="click" placement="bottom-end" @command="accountCommand" @visible-change="accountMenuOpen = $event">
            <button ref="accountTrigger" class="account-menu-trigger" aria-label="會員選單" aria-haspopup="menu" :aria-expanded="accountMenuOpen" :disabled="loggingOut" @keydown.esc.stop.prevent="closeAccountMenu">
              <span class="account-avatar" aria-hidden="true">{{ ((customer && customer.name) || '會').slice(0, 1) }}</span>
              <span class="account-name">{{ (customer && customer.name) || '會員' }}</span>
              <el-icon aria-hidden="true"><ArrowDown /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu class="member-account-dropdown" @keydown.esc.stop.prevent="closeAccountMenu">
                <el-dropdown-item command="settings">帳號設定</el-dropdown-item>
                <el-dropdown-item command="addresses">收件地址</el-dropdown-item>
                <el-dropdown-item command="billing">付款與單據</el-dropdown-item>
                <el-dropdown-item command="rewards">點數與優惠</el-dropdown-item>
                <el-dropdown-item command="support" divided>服務與協助</el-dropdown-item>
                <el-dropdown-item command="logout" divided :disabled="loggingOut">{{ loggingOut ? '登出中…' : '登出' }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>
      <main id="member-content" ref="content" class="portal-main" tabindex="-1"><router-view v-if="$store.getters['customerAuth/accessToken']" /></main>
      <footer class="portal-footer">
        <span>3DRFM · 讓設計，進入製造。</span>
        <router-link to="/portal/workspace?section=support">服務與協助</router-link>
      </footer>
    </div>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { logoutCustomer, fetchCustomerMe } from '@/api/customerAuth'
  import { portalSection } from '@/utils/portal-presentation.mjs'
  import BrandMark from '@/components/public/BrandMark.vue'
  import { Bell, ArrowDown, House, Printer, Timer, MagicStick, Files, FolderOpened, Document, ShoppingBag, Connection } from '@element-plus/icons-vue'

  export default {
    name: 'PortalLayout',
    components: { BrandMark, Bell, ArrowDown, House, Printer, Timer, MagicStick, Files, FolderOpened, Document, ShoppingBag, Connection },
    data: () => ({
      mobileMenu: false,
      accountMenuOpen: false,
      loggingOut: false,
      sections: [
        { id: 'home', label: '工作台首頁', to: '/portal/dashboard', group: '製作', icon: 'House' },
        { id: 'print', label: '付費代印', to: '/portal/print', group: '製作', icon: 'Printer' },
        { id: 'free', label: '免費列印', to: '/portal/free-slicer', group: '製作', icon: 'Printer' },
        { id: 'station', label: '排隊與到站操作', to: '/portal/free-print', group: '製作', icon: 'Timer' },
        { id: 'agent', label: '建模工具', to: '/portal/workspace?section=agent', group: '模型', icon: 'MagicStick' },
        { id: 'models', label: '模型與下載', to: '/portal/workspace?section=models', group: '模型', icon: 'Files' },
        { id: 'drafts', label: '繼續草稿', to: '/portal/workspace?section=drafts', group: '模型', icon: 'FolderOpened' },
        { id: 'projects', label: '專案協作', to: '/portal/workspace?section=projects', group: '模型', icon: 'Connection' },
        { id: 'cases', label: '案件進度', to: '/portal/dashboard?tab=cases', group: '紀錄', icon: 'Document' },
        { id: 'orders', label: '訂單與付款', to: '/portal/dashboard?tab=orders', group: '紀錄', icon: 'ShoppingBag' },
      ],
    }),
    computed: {
      ...mapGetters({ customer: 'customerAuth/customer' }),
      navGroups() { return ['製作', '模型', '紀錄'].map(label => ({ label, items: this.sections.filter(item => item.group === label) })) },
      activeSection() {
        if (this.$route.path === '/portal/print') return 'print'
        if (this.$route.path === '/portal/free-slicer') return 'free'
        if (this.$route.path === '/portal/free-print') return 'station'
        if (this.$route.path === '/portal/dashboard' && !this.$route.query.tab) return 'home'
        if (this.$route.path === '/portal/workspace') {
          const section = this.$route.query.section || 'models'
          return ['billing', 'support', 'rewards', 'free-print'].includes(section)
            ? 'settings'
            : section === 'case'
            ? 'cases'
            : section
        }
        return portalSection(this.$route.query.tab).id
      },
      sectionTitle() {
        if (this.$route.path === '/portal/workspace') {
          const titles = { notifications: '通知中心', settings: '帳號設定', billing: '付款與單據', support: '服務與協助', rewards: '點數與優惠', 'free-print': '免費列印申請', case: '案件詳情' }
          if (titles[this.$route.query.section]) return titles[this.$route.query.section]
        }
        return this.sections.find((s) => s.id === this.activeSection)?.label || portalSection(this.$route.query.tab).label
      },
    },
    async created() {
      if (!this.$store.getters['customerAuth/accessToken']) {
        await this.$router.replace({ path: '/portal/login', query: { redirect: this.$route.fullPath } })
        return
      }
      try { const result = await fetchCustomerMe(); this.$store.commit('customerAuth/setCustomer', result.customer) } catch { /* API 顯示重試／登入提示 */ }
    },
    methods: {
      closeAccountMenu() { this.$refs.accountDropdown?.handleClose(); this.$refs.accountTrigger?.focus() },
      accountCommand(command) {
        if (command === 'logout') return this.logout()
        if (command === 'addresses') return this.$router.push('/portal/dashboard?tab=addresses')
        if (['settings', 'billing', 'rewards', 'support'].includes(command)) return this.$router.push({ path: '/portal/workspace', query: { section: command } })
      },
      async logout() {
        if (this.loggingOut) return
        this.loggingOut = true
        try {
          await logoutCustomer()
        } catch {
          // 網路異常也要清空本地登入態
        }
        await this.$store.dispatch('customerAuth/resetAccessToken')
        this.$router.push('/portal/login')
        this.loggingOut = false
      },
    },
  }
</script>

<style lang="scss">
  .nav-group-label { margin:22px 12px 4px; color:var(--rfm-muted); font-size:11px; letter-spacing:.12em; grid-column:1/-1; }
  .portal-sidebar nav { margin-top:24px; }
  .portal-sidebar nav .el-icon { flex-shrink:0; font-size:18px; }
  .header-notifications, .account-menu-trigger { display:flex; align-items:center; gap:8px; min-height:44px; padding:6px 10px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--rfm-ink); font:inherit; cursor:pointer; white-space:nowrap; }
  .header-notifications:hover, .header-notifications[aria-current="page"], .account-menu-trigger:hover, .account-menu-trigger[aria-expanded="true"] { background:var(--rfm-selected); }
  .header-notifications .el-icon { font-size:20px; }
  .account-menu-trigger { border-color:var(--rfm-line); }
  .member-account-dropdown { min-width:190px; padding:8px!important; }
  .member-account-dropdown .el-dropdown-menu__item { min-height:42px; border-radius:6px; font-family:var(--rfm-font); }
  .member-mobile-menu { display: none; }
  .portal-layout {
    --member-ink: var(--rfm-ink);
    --member-muted: var(--rfm-muted);
    --member-line: var(--rfm-line);
    display: flex;
    min-height: 100vh;
    color: var(--member-ink);
    background: var(--rfm-workspace);
    font-family: var(--rfm-font);
    line-height: 1.6;
    * {
      box-sizing: border-box;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    a:focus-visible,
    button:focus-visible {
      outline: 2px solid var(--rfm-focus);
      outline-offset: 3px;
    }
    .el-button {
      font-family: inherit;
      min-height: var(--rfm-control-height);
    }
    .el-button + .el-button {
      margin-left: 0;
    }
    .el-dialog {
      max-width: calc(100vw - 32px);
      border-radius: var(--rfm-radius-panel);
      color: var(--member-ink);
    }
    .el-dialog__body {
      overflow-wrap: anywhere;
    }
    .el-tag {
      border-radius: var(--rfm-radius-control);
      flex-shrink: 0;
    }
    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        transition: none !important;
        animation: none !important;
      }
    }
  }
  .portal-skip {
    position: fixed;
    top: -100px;
    left: 16px;
    z-index: 3000;
    background: white;
    padding: 12px;
  }
  .portal-skip:focus {
    top: 12px;
  }
  .portal-sidebar {
    width: 236px;
    flex-shrink: 0;
    padding: 36px 22px 24px;
    border-right: 1px solid var(--member-line);
    background: var(--rfm-subtle);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }
  .portal-brand {
    font-size: 30px;
    font-weight: 900;
    letter-spacing: -1.5px;
    padding: 0 12px;
  }
  .nav-caption {
    color: var(--member-muted);
    font-size: 11px;
    letter-spacing: 1.5px;
    margin: 52px 12px 14px;
  }
  .portal-sidebar nav {
    display: grid;
    gap: 6px;
  }
  .portal-sidebar nav a {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 12px;
    border-radius: var(--rfm-radius-control);
    font-size: 14px;
    font-weight: 600;
  }
  .portal-sidebar nav a:hover {
    background: var(--rfm-selected);
  }
  .portal-sidebar nav a.selected {
    background: var(--rfm-ink);
    color: var(--rfm-surface);
  }
  .nav-number {
    font-size: 10px;
    font-weight: 400;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
  .nav-arrow {
    margin-left: auto;
  }
  .sidebar-support {
    margin: auto 12px 24px;
    padding-top: 40px;
    font-size: 12px;
  }
  .support-label {
    font-weight: 700;
  }
  .sidebar-support p {
    color: var(--member-muted);
    margin: 10px 0 16px;
    line-height: 1.9;
  }
  .sidebar-support a {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px solid #bac5b8;
    padding-bottom: 10px;
  }
  .back-to-site {
    border-top: 1px solid var(--member-line);
    padding: 20px 12px 0;
    font-size: 12px;
  }
  .portal-workspace {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
  }
  .portal-header {
    position: sticky;
    top: 0;
    z-index: 30;
    min-height: 80px;
    padding: 16px 40px;
    border-bottom: 1px solid var(--member-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--rfm-surface);
  }
  .portal-breadcrumb {
    color: var(--member-muted);
    font-size: 12px;
  }
  .portal-breadcrumb span {
    margin: 0 10px;
    color: #a7b2aa;
  }
  .portal-breadcrumb b {
    color: var(--member-ink);
    font-weight: 500;
  }
  .portal-account {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    min-width: 0;
  }
  .account-avatar {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--rfm-subtle);
    flex-shrink: 0;
  }
  .account-name {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .logout-button {
    border: 0;
    border-left: 1px solid var(--member-line);
    background: none;
    font: inherit;
    color: var(--member-muted);
    padding: 8px 0 8px 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .portal-main {
    width: 100%;
    max-width: 1340px;
    margin: 0 auto;
    padding: 42px 40px;
    flex: 1;
  }
  .portal-footer {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: var(--member-muted);
    padding: 20px 40px;
    border-top: 1px solid var(--member-line);
  }
  @media (max-width: 1000px) {
    .portal-sidebar {
      width: 200px;
      padding-inline: 12px;
    }
    .portal-main {
      padding: 28px 24px;
    }
    .portal-header,
    .portal-footer {
      padding-inline: 24px;
    }
  }
  @media (max-width: 700px) {
    .portal-layout .breadcrumb-root { display:none; }
    .portal-layout .portal-breadcrumb { min-width:0; }
    .portal-layout .portal-account { flex-shrink:0; gap:6px; }
    .portal-layout .account-menu-trigger { padding:4px 8px; }
    .portal-layout .nav-group-label { margin:16px 12px 2px; }
    .portal-layout .portal-sidebar { width:100%; padding:18px 16px; height:auto; position:static; }
    .portal-layout .portal-main { padding:24px 16px; }
    .portal-layout .portal-header { padding:12px 16px; }
    .portal-layout .member-mobile-menu { display:block; align-self:flex-end; margin-top:-30px; background:white; border:1px solid var(--member-line); padding:8px 12px; border-radius:8px; color:inherit; }
    .portal-layout .portal-sidebar nav { display:none; }
    .portal-layout .portal-sidebar nav.mobile-open { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); }
    .portal-layout .portal-sidebar nav a { padding:12px; justify-content:flex-start; font-size:14px; }
    .portal-layout {
      display: block;
    }
    .portal-sidebar {
      position: static;
      width: 100%;
      height: auto;
      padding: 18px 16px 10px;
      border-right: 0;
      border-bottom: 1px solid var(--member-line);
    }
    .portal-brand {
      padding: 0;
      font-size: 26px;
    }
    .portal-brand small {
      display: inline;
      margin-left: 18px;
      letter-spacing: 2px;
      vertical-align: middle;
    }
    .nav-caption,
    .sidebar-support,
    .back-to-site,
    .nav-number,
    .nav-arrow {
      display: none;
    }
    .portal-sidebar nav {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 3px;
      margin-top: 18px;
    }
    .portal-sidebar nav a {
      padding: 10px 0;
      justify-content: center;
      font-size: 12px;
    }
    .portal-header {
      min-height: 58px;
      padding: 10px 16px;
    }
    .portal-breadcrumb {
      font-size: 11px;
    }
    .portal-breadcrumb span {
      margin: 0 4px;
    }
    .account-name {
      display: none;
    }
    .portal-main {
      padding: 28px 16px;
    }
    .portal-footer {
      padding: 18px 16px;
      font-size: 10px;
    }
  }
</style>
