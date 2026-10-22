<template>
  <div class="portal-layout">
    <a class="portal-skip" href="#member-content" @click.prevent="$refs.content.focus()">跳至主要內容</a>
    <aside class="portal-sidebar">
      <router-link to="/" class="portal-brand" aria-label="3DRFM，回到官網">
        3DRFM
        <span>●</span>
        <small>會員工作台</small>
      </router-link>
      <p class="nav-caption">我的製作計畫</p>
      <nav aria-label="會員導覽">
        <router-link
          v-for="item in sections"
          :key="item.id"
          :to="item.path ? { path: item.path, query: { section: item.id } } : { path: '/portal/dashboard', query: { tab: item.id } }"
          :class="{ selected: activeSection === item.id }"
          :aria-current="activeSection === item.id ? 'page' : undefined"
        >
          <span class="nav-number" aria-hidden="true">{{ item.number }}</span>
          {{ item.label }}
          <span class="nav-arrow" aria-hidden="true">↗</span>
        </router-link>
      </nav>
      <div class="sidebar-support">
        <span class="support-label">需要一起確認細節？</span>
        <p>
          材料、尺寸或交期，
          <br />
          都可以先和我們聊聊。
        </p>
        <router-link to="/contact">
          聯絡專員
          <span aria-hidden="true">↗</span>
        </router-link>
      </div>
      <router-link class="back-to-site" to="/">← 返回品牌官網</router-link>
    </aside>
    <div class="portal-workspace">
      <header class="portal-header">
        <span class="portal-breadcrumb">
          會員中心
          <span aria-hidden="true">／</span>
          <b>{{ sectionTitle }}</b>
        </span>
        <div class="portal-account">
          <span class="account-avatar" aria-hidden="true">{{ ((customer && customer.name) || '會').slice(0, 1) }}</span>
          <span class="account-name">{{ (customer && customer.name) || '會員' }}</span>
          <button class="logout-button" @click="logout">登出</button>
        </div>
      </header>
      <main id="member-content" ref="content" class="portal-main" tabindex="-1"><router-view /></main>
      <footer class="portal-footer">
        <span>3DRFM · 讓設計，進入製造。</span>
        <router-link to="/faq">常見問題 ↗</router-link>
      </footer>
    </div>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { logoutCustomer } from '@/api/customerAuth'
  import { portalSections, portalSection } from '@/utils/portal-presentation.mjs'

  export default {
    name: 'PortalLayout',
    data: () => ({
      sections: [
        ...portalSections.slice(0, 1),
        { id: 'models', number: '02', label: '模型與草稿', path: '/portal/workspace' },
        ...portalSections.slice(1, 3),
        portalSections[3],
        { id: 'projects', number: '05', label: '專案協作', path: '/portal/workspace' },
        { id: 'notifications', number: '06', label: '通知中心', path: '/portal/workspace' },
        { id: 'settings', number: '07', label: '帳號與服務', path: '/portal/workspace' },
      ].map((item, index) => ({ ...item, number: String(index + 1).padStart(2, '0') })),
    }),
    computed: {
      ...mapGetters({ customer: 'customerAuth/customer' }),
      activeSection() {
        if (this.$route.path === '/portal/workspace') {
          const section = this.$route.query.section || 'models'
          return ['drafts'].includes(section)
            ? 'models'
            : ['billing', 'support', 'rewards', 'free-print'].includes(section)
            ? 'settings'
            : section === 'case'
            ? 'cases'
            : section
        }
        return portalSection(this.$route.query.tab).id
      },
      sectionTitle() {
        if (this.$route.path === '/portal/workspace') return this.sections.find((s) => s.id === this.activeSection)?.label || '會員工作台'
        return portalSection(this.$route.query.tab).label
      },
    },
    methods: {
      async logout() {
        try {
          await logoutCustomer()
        } catch {
          // 網路異常也要清空本地登入態
        }
        await this.$store.dispatch('customerAuth/resetAccessToken')
        this.$router.push('/portal/login')
      },
    },
  }
</script>

<style lang="scss">
  .portal-layout {
    --member-ink: #183d34;
    --member-muted: #65716c;
    --member-line: #dce2db;
    --el-color-primary: #245c48;
    --el-color-primary-light-3: #527d6d;
    --el-color-primary-light-5: #88a597;
    --el-color-primary-light-7: #becfc5;
    --el-color-primary-light-8: #d8e3dc;
    --el-color-primary-light-9: #edf3ee;
    --el-color-primary-dark-2: #173d30;
    --el-border-radius-base: 6px;
    display: flex;
    min-height: 100vh;
    color: var(--member-ink);
    background: #f5f5ef;
    font-family: 'Noto Sans TC', 'Microsoft JhengHei', sans-serif;
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
      outline: 3px solid #a57629;
      outline-offset: 4px;
    }
    .el-button {
      font-family: inherit;
      min-height: 36px;
    }
    .el-button + .el-button {
      margin-left: 0;
    }
    .el-dialog {
      max-width: calc(100vw - 32px);
      border-radius: 10px;
      color: var(--member-ink);
    }
    .el-dialog__body {
      overflow-wrap: anywhere;
    }
    .el-tag {
      border-radius: 4px;
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
    background: #eef0e8;
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
  .portal-brand > span {
    font-size: 14px;
    color: #b48c43;
    vertical-align: top;
    margin-left: 4px;
  }
  .portal-brand small {
    display: block;
    font-size: 11px;
    letter-spacing: 3px;
    font-weight: 500;
    margin-top: 3px;
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
    border-radius: 6px;
    font-size: 14px;
    font-weight: 600;
  }
  .portal-sidebar nav a:hover {
    background: #e1e6dc;
  }
  .portal-sidebar nav a.selected {
    background: #214b3d;
    color: #fff;
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
    min-height: 80px;
    padding: 16px 40px;
    border-bottom: 1px solid var(--member-line);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: #fafbf7;
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
    background: #e2e8da;
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
