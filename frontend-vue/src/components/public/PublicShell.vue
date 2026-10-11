<template>
  <div class="public-site">
    <a href="#public-content" class="skip-content" @click.prevent="focusContent">跳至主要內容</a>
    <header class="public-header">
      <router-link to="/" class="studio-brand" aria-label="三點成型，回到首頁">
        <svg viewBox="0 0 42 44" fill="none" aria-hidden="true">
          <path d="m21 2 18 10v21L21 43 3 33V12Z" stroke="currentColor" stroke-width="2.5" />
          <path d="m3 12 18 11 18-11M21 23v20M12 7l18 11v10l-9 5-9-5V17" stroke="currentColor" stroke-width="2.5" />
        </svg>
        <span>
          三點成型
          <small>3DRFM · FDM 列印工作室</small>
        </span>
      </router-link>
      <button class="menu-toggle" :aria-expanded="menuOpen" aria-controls="public-nav" @click="menuOpen = !menuOpen">
        {{ menuOpen ? '關閉 ×' : '選單 ＋' }}
      </button>
      <nav id="public-nav" class="public-nav" :class="{ 'is-open': menuOpen }" aria-label="主要導覽">
        <router-link to="/services" @click="menuOpen = false">製作服務</router-link>
        <router-link :to="{ path: '/', hash: '#materials' }" @click="menuOpen = false">材料指南</router-link>
        <router-link :to="{ path: '/', hash: '#process' }" @click="menuOpen = false">製作流程</router-link>
        <router-link to="/portal/login" @click="menuOpen = false">會員登入</router-link>
        <router-link to="/quote" class="studio-button small" @click="menuOpen = false">
          自動估價
          <span aria-hidden="true">↗</span>
        </router-link>
      </nav>
    </header>
    <main id="public-content" tabindex="-1"><slot /></main>
    <footer class="public-footer">
      <div class="footer-top">
        <router-link to="/" class="footer-brand">
          三點成型
          <span>讓好點子，有個實體。</span>
        </router-link>
        <div class="footer-links">
          <router-link to="/for/education">學校與實驗室 ↗</router-link>
          <router-link to="/for/business">企業製作 ↗</router-link>
          <router-link to="/for/personal">個人代印 ↗</router-link>
          <router-link to="/quote">自動估價 ↗</router-link>
          <router-link to="/portal/login">會員中心 ↗</router-link>
          <router-link to="/login">工作人員登入 ↗</router-link>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© {{ year }} 三點成型 3DRFM</span>
        <span>FDM 列印・建模・小量製造</span>
      </div>
    </footer>
  </div>
</template>

<script>
  export default {
    name: 'PublicShell',
    data: () => ({ menuOpen: false, year: new Date().getFullYear() }),
    methods: {
      focusContent() {
        this.$el.querySelector('#public-content').focus()
      },
    },
  }
</script>

<style lang="scss">
  .public-site {
    --ink: #173c43;
    --paper: #f6f5ed;
    --blue: #247f93;
    --lime: #e3ed97;
    --el-color-primary: #247f93;
    --el-color-primary-light-3: #529eac;
    --el-color-primary-light-5: #89bbc5;
    --el-color-primary-light-7: #c0dce1;
    --el-color-primary-light-8: #d6e8eb;
    --el-color-primary-light-9: #eaf3f4;
    --el-color-primary-dark-2: #173c43;
    --el-text-color-primary: #173c43;
    --el-border-radius-base: 6px;
    color: var(--ink);
    background: var(--paper);
    font-family: 'Noto Sans TC', 'Noto Sans CJK TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif;
    font-size: 16px;
    line-height: 1.6;
    min-height: 100vh;
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
      outline: 3px solid #b85330;
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
      width: min(1200px, calc(100% - 96px));
      margin: auto;
    }
    .studio-button {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 34px;
      padding: 15px 24px;
      background: var(--ink);
      color: #fffdf4;
      border: 1px solid var(--ink);
      border-radius: 5px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, transform 0.2s;
    }
    .studio-button:hover {
      background: #28575c;
      transform: translateY(-2px);
    }
    .studio-button.light {
      color: var(--ink);
      background: var(--lime);
    }
    .studio-button.small {
      padding: 10px 18px;
      gap: 22px;
    }
    .studio-kicker {
      font-size: 12px;
      letter-spacing: 0.16em;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .studio-kicker::before {
      content: '';
      width: 23px;
      height: 2px;
      background: currentColor;
    }
    .el-input__wrapper,
    .el-textarea__inner {
      background: #fffefa;
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
  .public-header {
    width: min(1360px, 100%);
    margin: auto;
    padding: 23px 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
    position: relative;
    z-index: 5;
  }
  .studio-brand {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
  .studio-brand svg {
    width: 39px;
    height: 43px;
  }
  .studio-brand > span {
    font-size: 23px;
    line-height: 1.25;
    letter-spacing: 0.06em;
    font-weight: 900;
  }
  .studio-brand small {
    font-size: 10px;
    letter-spacing: 0.06em;
    display: block;
    margin-top: 5px;
    font-weight: 500;
  }
  .public-nav {
    display: flex;
    align-items: center;
    gap: 30px;
    font-size: 14px;
    font-weight: 600;
  }
  .public-nav > a:not(.studio-button):hover {
    text-decoration: underline;
    text-underline-offset: 6px;
  }
  .menu-toggle {
    display: none;
    background: transparent;
    border: 1px solid #173c43;
    padding: 8px 12px;
    border-radius: 4px;
    color: #173c43;
  }
  .skip-content {
    position: fixed;
    top: -100px;
    left: 16px;
    z-index: 30;
    padding: 12px;
    background: #fff;
  }
  .skip-content:focus {
    top: 10px;
  }
  .public-footer {
    background: #173c43;
    color: #f6f5ed;
    padding: 48px max(48px, calc((100vw - 1200px) / 2)) 22px;
  }
  .footer-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding-bottom: 38px;
  }
  .footer-brand {
    font-size: 27px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }
  .footer-brand span {
    display: block;
    font-size: 13px;
    font-weight: 400;
    margin-top: 8px;
  }
  .footer-links {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 650px;
    gap: 16px 26px;
    font-size: 13px;
  }
  .footer-links a:hover {
    text-decoration: underline;
  }
  .footer-bottom {
    border-top: 1px solid #547075;
    padding-top: 19px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
    color: #c0d2d2;
  }
  @media (max-width: 1000px) {
    .public-header {
      padding: 20px 28px;
    }
    .public-nav {
      gap: 17px;
    }
    .public-site .studio-wrap {
      width: calc(100% - 56px);
    }
  }
  @media (max-width: 760px) {
    .public-header {
      padding: 18px 20px;
    }
    .studio-brand > span {
      font-size: 20px;
    }
    .studio-brand svg {
      width: 32px;
    }
    .menu-toggle {
      display: block;
    }
    .public-nav {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      padding: 22px;
      background: #f6f5ed;
      border-bottom: 1px solid #b2c2bb;
      box-shadow: 0 12px 18px #173c4310;
    }
    .public-nav.is-open {
      display: grid;
      gap: 20px;
    }
    .public-nav .studio-button {
      justify-content: center;
    }
    .public-site .studio-wrap {
      width: calc(100% - 40px);
    }
    .public-footer {
      padding: 38px 24px 22px;
    }
    .footer-top {
      align-items: flex-start;
    }
    .footer-links {
      flex-direction: column;
      gap: 12px;
    }
    .footer-brand {
      font-size: 22px;
    }
    .footer-bottom {
      flex-wrap: wrap;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .public-site *,
    .public-site *::before,
    .public-site *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
  }
</style>
