<template>
  <div class="public-site">
    <a href="#public-content" class="skip-content" @click.prevent="focusContent">跳至主要內容</a>
    <div class="public-utility">
      <div class="studio-wrap">
        <span>專注 FDM 3D 列印・原型開發與小量製造</span>
        <div>
          <router-link to="/process">訂製流程</router-link>
          <router-link to="/contact">聯絡我們 ↗</router-link>
        </div>
      </div>
    </div>
    <header ref="header" class="public-header" @keydown.esc="closeNavigation(true)">
      <router-link to="/" class="studio-brand" aria-label="3DRFM，回到首頁" @click="closeNavigation()">
        <strong>
          3DRFM
          <span aria-hidden="true">●</span>
        </strong>
        <small>3D 列印製造服務</small>
      </router-link>
      <button class="menu-toggle" :aria-expanded="menuOpen" aria-controls="public-nav" @click="toggleMobileMenu">
        {{ menuOpen ? '關閉 ×' : '選單 ＋' }}
      </button>
      <nav id="public-nav" class="public-nav" :class="{ 'is-open': menuOpen }" aria-label="主要導覽">
        <div v-for="group in navigation" :key="group.id" class="nav-group">
          <button
            :id="'nav-' + group.id"
            class="nav-trigger"
            :class="{ 'is-current': isCurrentGroup(group) }"
            :aria-expanded="activeMenu === group.id"
            :aria-controls="'panel-' + group.id"
            @click="activeMenu = activeMenu === group.id ? '' : group.id"
          >
            {{ group.title }}
            <span aria-hidden="true">{{ activeMenu === group.id ? '−' : '＋' }}</span>
          </button>
          <div v-show="activeMenu === group.id" :id="'panel-' + group.id" class="nav-panel" :aria-labelledby="'nav-' + group.id">
            <div class="nav-panel-intro">
              <p>{{ group.title }}</p>
              <h2>{{ group.heading }}</h2>
              <span>{{ group.description }}</span>
            </div>
            <div class="nav-panel-links">
              <router-link v-for="link in group.links" :key="link.to" :to="link.to" @click="closeNavigation()">
                <strong>
                  {{ link.label }}
                  <span aria-hidden="true">↗</span>
                </strong>
                <small>{{ link.description }}</small>
              </router-link>
            </div>
          </div>
        </div>
        <div class="nav-account">
          <router-link to="/portal/login" class="member-entry" @click="closeNavigation()">會員登入</router-link>
          <router-link to="/quote" class="studio-button small" @click="closeNavigation()">
            自動估價
            <span aria-hidden="true">↗</span>
          </router-link>
        </div>
      </nav>
    </header>
    <main id="public-content" tabindex="-1"><slot /></main>
    <footer class="public-footer">
      <div class="studio-wrap footer-top">
        <div class="footer-identity">
          <router-link to="/" class="footer-brand">3DRFM</router-link>
          <p>讓設計，進入製造。</p>
          <small>FDM 3D 列印・模型代印・小量製作</small>
          <router-link to="/quote" class="footer-inquiry">開始你的製作計畫 ↗</router-link>
        </div>
        <div v-for="group in footerGroups" :key="group.title" class="footer-column">
          <h2>{{ group.title }}</h2>
          <router-link v-for="link in group.links" :key="link.to" :to="link.to">{{ link.label }}</router-link>
        </div>
      </div>
      <div class="studio-wrap footer-bottom">
        <span>© {{ year }} 3DRFM</span>
        <div>
          <router-link to="/privacy">隱私權說明</router-link>
          <router-link to="/terms">服務使用說明</router-link>
          <router-link to="/login">工作人員登入</router-link>
        </div>
      </div>
    </footer>
  </div>
</template>
<script>
  import { publicNavigation, footerGroups } from '@/content/publicNavigation.mjs'
  export default {
    name: 'PublicShell',
    data: () => ({ menuOpen: false, activeMenu: '', year: new Date().getFullYear(), navigation: publicNavigation, footerGroups }),
    watch: {
      '$route.fullPath'() {
        this.closeNavigation()
      },
    },
    mounted() {
      document.addEventListener('pointerdown', this.onOutside)
      document.addEventListener('focusin', this.onOutside)
    },
    beforeUnmount() {
      document.removeEventListener('pointerdown', this.onOutside)
      document.removeEventListener('focusin', this.onOutside)
    },
    methods: {
      isCurrentGroup(group) {
        const path = this.$route.path
        if (group.id === 'services')
          return path === '/services' || path.startsWith('/services/') || path === '/free-print' || path.startsWith('/free-print/')
        if (group.id === 'applications') return path.startsWith('/for/')
        return group.links.some((link) => link.to === path)
      },
      toggleMobileMenu() {
        this.menuOpen = !this.menuOpen
        this.activeMenu = ''
      },
      focusContent() {
        this.$el.querySelector('#public-content').focus()
      },
      closeNavigation(restoreFocus = false) {
        const trigger = this.activeMenu && this.$el.querySelector('#nav-' + this.activeMenu)
        if (restoreFocus) (this.menuOpen ? this.$el.querySelector('.menu-toggle') : trigger)?.focus()
        this.activeMenu = ''
        this.menuOpen = false
      },
      onOutside(event) {
        if (!this.$refs.header.contains(event.target)) this.closeNavigation()
      },
    },
  }
</script>
<style lang="scss">
  .public-site {
    --ink: #17343d;
    --paper: #fafbf8;
    --blue: #167c91;
    --lime: #dff08f;
    --el-color-primary: #167c91;
    --el-color-primary-light-3: #529eac;
    --el-color-primary-light-5: #89bbc5;
    --el-color-primary-light-7: #c0dce1;
    --el-color-primary-light-8: #d6e8eb;
    --el-color-primary-light-9: #eaf3f4;
    --el-color-primary-dark-2: #17343d;
    --el-text-color-primary: #17343d;
    --el-border-radius-base: 4px;
    min-height: 100vh;
    color: var(--ink);
    background: var(--paper);
    font: 16px/1.65 'Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }
    a {
      color: inherit;
      text-decoration: none;
    }
    button,
    input {
      font: inherit;
    }
    button,
    a,
    input {
      -webkit-tap-highlight-color: transparent;
    }
    :focus-visible {
      outline: 3px solid #ba552c;
      outline-offset: 5px;
    }
    h1,
    h2,
    h3,
    p {
      overflow-wrap: break-word;
    }
    h1,
    h2,
    h3 {
      color: var(--ink);
    }
    .studio-wrap {
      width: min(1240px, calc(100% - 96px));
      margin-inline: auto;
    }
    .studio-button {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 30px;
      padding: 15px 24px;
      background: var(--ink);
      color: white;
      border: 1px solid var(--ink);
      border-radius: 3px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    .studio-button:hover {
      background: #28575c;
    }
    .studio-button.light {
      background: var(--lime);
      color: var(--ink);
      border-color: var(--lime);
    }
    .studio-button.small {
      padding: 11px 18px;
      gap: 18px;
    }
    .studio-kicker {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.12em;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .studio-kicker::before {
      content: '';
      width: 7px;
      height: 7px;
      background: #188eaa;
      flex-shrink: 0;
    }
    .el-input__wrapper,
    .el-textarea__inner {
      background: white;
    }
    .el-button {
      min-height: 42px;
      font-weight: 600;
    }
    .el-form-item__label {
      color: var(--ink);
    }
    .el-radio {
      white-space: normal;
      height: auto;
      min-height: 32px;
    }
    .el-radio__label {
      white-space: normal;
    }
    .el-dialog {
      max-width: calc(100vw - 32px);
    }
  }
  .public-utility {
    background: #edf1ef;
    font-size: 11px;
    letter-spacing: 0.04em;
  }
  .public-utility > div {
    display: flex;
    justify-content: space-between;
    padding-block: 8px;
  }
  .public-utility > div > div {
    display: flex;
    gap: 26px;
  }
  .public-header {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
    padding: 23px 48px;
    width: min(1440px, 100%);
    margin: auto;
    background: var(--paper);
  }
  .studio-brand {
    flex-shrink: 0;
    display: grid;
    gap: 2px;
  }
  .studio-brand strong {
    font: 900 35px/1.1 Arial, sans-serif;
    letter-spacing: -1.8px;
  }
  .studio-brand strong span {
    font-size: 10px;
    vertical-align: top;
    margin-left: 4px;
    color: #1196b1;
  }
  .studio-brand small {
    font-size: 10px;
    letter-spacing: 0.24em;
  }
  .public-nav {
    display: flex;
    align-items: center;
    gap: 24px;
    font-size: 13px;
  }
  .nav-trigger {
    padding: 14px 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    display: flex;
    gap: 9px;
    align-items: center;
    font-weight: 700 !important;
  }
  .nav-trigger[aria-expanded='true'],
  .nav-trigger.is-current {
    color: #087c97;
  }
  .nav-trigger > span {
    font-size: 12px;
  }
  .nav-account {
    display: flex;
    align-items: center;
    gap: 22px;
    border-left: 1px solid #d4ddda;
    padding-left: 24px;
  }
  .nav-panel {
    position: absolute;
    top: 100%;
    inset-inline: 0;
    padding: 38px 48px;
    display: grid;
    grid-template-columns: 1fr 2.2fr;
    gap: 48px;
    background: #fff;
    border-top: 1px solid #e1e6e3;
    border-bottom: 3px solid #177c91;
    box-shadow: 0 24px 30px #17343d18;
  }
  .nav-panel-intro p {
    font-size: 11px;
    letter-spacing: 0.1em;
    margin: 0;
    color: #46717b;
  }
  .nav-panel-intro h2 {
    font-size: 25px;
    margin: 10px 0;
  }
  .nav-panel-intro > span {
    font-size: 13px;
    color: #64747a;
  }
  .nav-panel-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 30px;
  }
  .nav-panel-links a {
    padding: 13px 5px;
    border-bottom: 1px solid #e3e8e4;
  }
  .nav-panel-links a:hover {
    background: #f1f6f3;
  }
  .nav-panel-links strong {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
  }
  .nav-panel-links small {
    display: block;
    color: #65757a;
    font-size: 12px;
    margin-top: 5px;
  }
  .menu-toggle {
    display: none;
    border: 1px solid #bdceca;
    background: transparent;
    color: var(--ink);
    padding: 8px 12px;
  }
  .skip-content {
    position: fixed;
    top: -100px;
    left: 16px;
    z-index: 50;
    padding: 12px;
    background: white;
  }
  .skip-content:focus {
    top: 10px;
  }
  .public-footer {
    background: #142f38;
    color: #f4f8f5;
  }
  .footer-top {
    display: grid;
    grid-template-columns: 1.5fr repeat(3, 1fr);
    gap: 50px;
    padding-block: 70px 60px;
  }
  .footer-brand {
    font: 900 39px/1 Arial, sans-serif;
    letter-spacing: -2px;
  }
  .footer-identity p {
    margin: 20px 0 9px;
    font-size: 19px;
  }
  .footer-identity small {
    font-size: 11px;
    color: #a9bfc1;
  }
  .footer-inquiry {
    display: block;
    font-size: 13px;
    color: #dff08f !important;
    margin-top: 24px;
  }
  .footer-column h2 {
    color: #a9bfc1;
    font-size: 12px;
    margin: 0 0 22px;
    letter-spacing: 0.1em;
  }
  .footer-column a {
    display: block;
    font-size: 13px;
    margin-top: 13px;
  }
  .public-footer a:hover {
    text-decoration: underline;
    text-underline-offset: 5px;
  }
  .footer-bottom {
    border-top: 1px solid #36515a;
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding-block: 24px;
    color: #a9bfc1;
    font-size: 11px;
  }
  .footer-bottom > div {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  @media (max-width: 1100px) {
    .public-header {
      padding-inline: 28px;
      gap: 15px;
    }
    .public-nav {
      gap: 15px;
    }
    .nav-account {
      gap: 13px;
      padding-left: 15px;
    }
    .public-site .studio-wrap {
      width: calc(100% - 56px);
    }
  }
  @media (max-width: 960px) {
    .menu-toggle {
      display: block;
    }
    .public-header {
      padding-block: 18px;
    }
    .public-nav {
      display: none;
      position: absolute;
      top: 100%;
      inset-inline: 0;
      background: white;
      border-bottom: 2px solid #177c91;
      padding: 12px 28px 24px;
      max-height: 75vh;
      overflow-y: auto;
      box-shadow: 0 16px 25px #17343d18;
    }
    .public-nav.is-open {
      display: block;
    }
    .nav-group {
      border-bottom: 1px solid #dce4df;
    }
    .nav-trigger {
      width: 100%;
      justify-content: space-between;
      padding-block: 17px;
    }
    .nav-panel {
      position: static;
      display: block;
      padding: 0 0 15px;
      box-shadow: none;
      border: 0;
    }
    .nav-panel-intro {
      display: none;
    }
    .nav-panel-links {
      gap: 0 20px;
    }
    .nav-account {
      margin-top: 24px;
      padding: 0;
      border: 0;
      justify-content: space-between;
    }
    .footer-top {
      gap: 30px;
    }
  }
  @media (max-width: 760px) {
    .public-site .studio-wrap {
      width: calc(100% - 40px);
    }
    .public-utility > div > div {
      display: none;
    }
    .public-utility {
      font-size: 10px;
    }
    .public-header {
      padding-inline: 20px;
    }
    .studio-brand strong {
      font-size: 30px;
    }
    .studio-brand small {
      font-size: 9px;
    }
    .public-nav {
      padding-inline: 20px;
    }
    .nav-panel-links {
      grid-template-columns: 1fr;
    }
    .nav-panel-links a {
      padding-inline: 12px;
    }
    .footer-top {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding-block: 45px;
      gap: 35px 20px;
    }
    .footer-identity {
      grid-column: 1 / -1;
    }
    .footer-bottom {
      flex-direction: column;
      gap: 12px;
    }
    .footer-bottom > div {
      gap: 18px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .public-site *,
    .public-site *::before,
    .public-site *::after {
      scroll-behavior: auto !important;
      animation: none !important;
      transition: none !important;
    }
  }
</style>
