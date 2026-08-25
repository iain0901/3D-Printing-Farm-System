<template>
  <div class="public-site">
    <header class="site-header" :class="{ scrolled, open: menuOpen }">
      <div class="header-inner">
        <router-link to="/" class="brand" @click="menuOpen = false">
          <span class="logo-mark" aria-hidden="true">
            <i /><i /><i />
          </span>
          <span class="brand-text">3DRFM<small>三點成型</small></span>
        </router-link>

        <nav class="main-nav">
          <router-link to="/" exact>首頁</router-link>
          <router-link to="/services">服務</router-link>
          <router-link to="/gallery">作品</router-link>
          <router-link to="/pricing">方案價格</router-link>
          <router-link to="/about">關於我們</router-link>
          <router-link to="/faq">常見問題</router-link>
          <router-link to="/contact">聯絡</router-link>
        </nav>

        <div class="actions">
          <router-link to="/portal/login" class="btnx ghost-dark sm hide-m">會員中心</router-link>
          <router-link to="/quote" class="btnx accent sm">立即估價</router-link>
          <button class="burger hide-pc" :aria-expanded="menuOpen" aria-label="menu" @click="menuOpen = !menuOpen">
            <span /><span /><span />
          </button>
        </div>
      </div>

      <transition name="drop">
        <nav v-if="menuOpen" class="mobile-nav">
          <router-link v-for="item in mobileItems" :key="item.to" :to="item.to" @click="menuOpen = false">{{ item.label }}</router-link>
        </nav>
      </transition>
    </header>

    <main class="page-body">
      <slot />
    </main>

    <footer class="site-footer layer-lines">
      <div class="f-inner">
        <div class="f-grid">
          <div class="f-brand">
            <div class="brand light"><span class="logo-mark"><i /><i /><i /></span><span class="brand-text">3DRFM<small>三點成型</small></span></div>
            <p>積層製造 × 生產管理系統。<br />把你的想法，一層一層變成精確的成品。</p>
            <p class="mono-label on-light" style="color:#ff9d5c">FDM · CAD · BATCH</p>
          </div>
          <div class="f-col"><b>服務</b>
            <router-link to="/services">FDM 列印代印</router-link>
            <router-link to="/services">3D 建模</router-link>
            <router-link to="/services">小量製造</router-link>
            <router-link to="/quote">線上估價</router-link>
          </div>
          <div class="f-col"><b>支援</b>
            <router-link to="/faq">常見問題</router-link>
            <router-link to="/contact">聯絡我們</router-link>
            <router-link to="/portal/login">會員中心</router-link>
            <router-link to="/portal/register">註冊帳號</router-link>
          </div>
          <div class="f-col"><b>公司</b>
            <router-link to="/about">關於我們</router-link>
            <router-link to="/terms">服務條款</router-link>
            <router-link to="/privacy">隱私權政策</router-link>
          </div>
        </div>
        <div class="f-bottom">© {{ year }} 3DRFM 三點成型 · All rights reserved.</div>
      </div>
    </footer>
  </div>
</template>

<script>
  export default {
    name: 'PublicLayout',
    data() {
      return {
        scrolled: false,
        menuOpen: false,
        year: new Date().getFullYear(),
        mobileItems: [
          { to: '/', label: '首頁' },
          { to: '/services', label: '服務' },
          { to: '/gallery', label: '作品' },
          { to: '/pricing', label: '方案價格' },
          { to: '/about', label: '關於我們' },
          { to: '/faq', label: '常見問題' },
          { to: '/contact', label: '聯絡' },
          { to: '/portal/login', label: '會員中心' },
        ],
      }
    },
    mounted() {
      window.addEventListener('scroll', this.onScroll, { passive: true })
    },
    beforeUnmount() {
      window.removeEventListener('scroll', this.onScroll)
    },
    methods: {
      onScroll() {
        this.scrolled = window.scrollY > 10
      },
    },
  }
</script>

<style lang="scss" scoped>
@import '@/styles/brand';

.public-site { min-height: 100vh; display: flex; flex-direction: column; background: var(--paper); color: var(--text); font-family: var(--sans); }

// ---------- Header ----------
.site-header {
  position: sticky; top: 0; z-index: 60;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(14px);
  border-bottom: 1px solid transparent;
  transition: box-shadow 0.2s, border-color 0.2s;

  &.scrolled { border-bottom-color: var(--line); box-shadow: 0 6px 24px rgba(12, 18, 34, 0.07); }
}
.header-inner { max-width: 1180px; margin: auto; padding: 13px 24px; display: flex; align-items: center; gap: 24px; }

.brand { display: inline-flex; align-items: center; gap: 11px; text-decoration: none;
  &.light .brand-text { color: #fff; } }
.logo-mark { display: inline-flex; flex-direction: column; gap: 3px;
  i { width: 26px; height: 5px; border-radius: 2px; background: var(--melt); display: block;
    &:nth-child(1) { width: 18px; opacity: .55; }
    &:nth-child(2) { width: 22px; opacity: .8; }
    &:nth-child(3) { width: 26px; }
  } }
.brand-text { font-weight: 900; font-size: 19px; letter-spacing: .4px; color: var(--ink); line-height: 1.05;
  small { display: block; font-size: 11px; font-weight: 600; color: var(--muted); letter-spacing: 2px; } }

.main-nav { margin-left: auto; display: flex; gap: 2px;
  a { padding: 9px 15px; border-radius: 8px; color: #45506b; text-decoration: none; font-size: 14px; transition: .15s;
    &:hover { color: var(--ink); background: #eef1f7; }
    &.router-link-active { color: var(--ink); background: var(--accent-soft); font-weight: 700; }
  } }

.actions { display: flex; gap: 9px; align-items: center; }

.burger { display: none; flex-direction: column; gap: 5px; background: none; border: 0; cursor: pointer; padding: 8px;
  span { width: 22px; height: 2px; background: var(--ink); border-radius: 2px; display: block; } }

.mobile-nav { display: grid; padding: 6px 20px 16px; border-top: 1px solid var(--line);
  a { padding: 12px 10px; color: var(--text); text-decoration: none; font-size: 15px; border-bottom: 1px dashed var(--line); } }

.drop-enter-active, .drop-leave-active { transition: opacity .15s, transform .15s; }
.drop-enter-from, .drop-leave-to { opacity: 0; transform: translateY(-6px); }

// ---------- Footer ----------
.site-footer { background: var(--ink); color: #aab6cf; margin-top: 56px; }
.f-grid { max-width: 1180px; margin: auto; padding: 52px 24px 26px; display: grid; grid-template-columns: 1.7fr 1fr 1fr 1fr; gap: 30px; }
.f-brand p { line-height: 1.95; font-size: 13px; color: #8fa0c0; margin-top: 14px; }
.f-col b { display: block; color: #fff; font-size: 12px; letter-spacing: 2px; margin-bottom: 13px; font-family: var(--mono); }
.f-col a { display: block; color: #93a3c2; text-decoration: none; font-size: 13px; padding: 4px 0; transition: color .15s;
  &:hover { color: var(--accent); } }
.f-bottom { max-width: 1180px; margin: auto; padding: 15px 24px 22px; font-family: var(--mono); font-size: 11.5px; color: #6d7ea1; border-top: 1px solid rgba(255,255,255,.08); text-align: center; }

@media (max-width: 960px) {
  .main-nav, .hide-m { display: none; }
  .hide-pc { display: block; }
  .f-grid { grid-template-columns: 1fr 1fr; }
}

@media (min-width: 961px) {
  .hide-pc { display: none; }
  .mobile-nav { display: none; }
}
</style>
