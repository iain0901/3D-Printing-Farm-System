<template>
  <div class="public-site">
    <header class="site-header" :class="{ scrolled }">
      <div class="header-inner">
        <router-link to="/" class="brand">
          <span class="brand-mark">3DRFM</span>
          <span class="brand-sub">三點成型</span>
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
        <div class="header-actions">
          <router-link to="/portal/login" class="btn ghost small">會員中心</router-link>
          <router-link to="/quote" class="btn primary small">立即估價</router-link>
        </div>
      </div>
    </header>

    <main class="page-body">
      <slot />
    </main>

    <footer class="site-footer">
      <div class="footer-grid">
        <div class="footer-brand-col">
          <div class="footer-brand">3DRFM 三點成型</div>
          <p>把你的想法變成拿在手中的成品。<br />FDM 列印代印、建模與小量製造。</p>
        </div>
        <div class="footer-col">
          <b>服務</b>
          <router-link to="/services">FDM 列印代印</router-link>
          <router-link to="/services">3D 建模</router-link>
          <router-link to="/services">小量製造</router-link>
          <router-link to="/quote">線上估價</router-link>
        </div>
        <div class="footer-col">
          <b>支援</b>
          <router-link to="/faq">常見問題</router-link>
          <router-link to="/contact">聯絡我們</router-link>
          <router-link to="/portal/login">會員中心</router-link>
          <router-link to="/portal/register">註冊帳號</router-link>
        </div>
        <div class="footer-col">
          <b>公司</b>
          <router-link to="/about">關於我們</router-link>
          <router-link to="/terms">服務條款</router-link>
          <router-link to="/privacy">隱私權政策</router-link>
        </div>
      </div>
      <div class="footer-bottom">
        © {{ year }} 3DRFM 三點成型 · All rights reserved.
      </div>
    </footer>
  </div>
</template>

<script>
  export default {
    name: 'PublicLayout',
    data() {
      return { scrolled: false }
    },
    mounted() {
      window.addEventListener('scroll', this.onScroll, { passive: true })
    },
    beforeUnmount() {
      window.removeEventListener('scroll', this.onScroll)
    },
    methods: {
      onScroll() {
        this.scrolled = window.scrollY > 12
      },
    },
  }
</script>

<style lang="scss" scoped>
  .public-site {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f5f7fb;
    color: #17223b;
  }

  .site-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(255, 255, 255, 0.86);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s, box-shadow 0.2s;

    &.scrolled {
      border-bottom-color: #e3e9f4;
      box-shadow: 0 4px 18px rgba(23, 34, 59, 0.06);
    }
  }

  .header-inner {
    max-width: 1160px;
    margin: auto;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    gap: 26px;
  }

  .brand { display: flex; align-items: baseline; gap: 7px; text-decoration: none; }
  .brand-mark { font-size: 21px; font-weight: 800; color: #17223b; letter-spacing: 0.4px; }
  .brand-sub { font-size: 13px; color: #6b7280; font-weight: 500; }

  .main-nav { display: flex; gap: 4px; margin-left: auto; }
  .main-nav a {
    padding: 8px 14px;
    border-radius: 8px;
    color: #475467;
    text-decoration: none;
    font-size: 14px;
    transition: background 0.15s, color 0.15s;

    &:hover { background: #eef3ff; color: #17223b; }
    &.router-link-active { background: #3563e9; color: #fff; font-weight: 600; }
  }

  .header-actions { display: flex; gap: 10px; }

  .btn {
    display: inline-block;
    border-radius: 9px;
    padding: 9px 18px;
    font-weight: 700;
    font-size: 14px;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;

    &.primary { background: #3563e9; color: #fff !important; box-shadow: 0 6px 18px rgba(53, 99, 233, 0.25); }
    &.ghost { border: 1px solid #d5dce8; color: #17223b !important; background: #fff; }
    &.small { padding: 8px 16px; font-size: 13px; }
    &:hover { transform: translateY(-1px); }
  }

  .page-body { flex: 1; }

  .site-footer { background: #101a30; color: #cbd5e4; margin-top: 40px; }
  .footer-grid {
    max-width: 1160px;
    margin: auto;
    padding: 44px 24px 28px;
    display: grid;
    grid-template-columns: 1.6fr 1fr 1fr 1fr;
    gap: 28px;
  }
  .footer-brand-col p { line-height: 1.9; font-size: 13px; color: #94a3bd; margin-top: 10px; }
  .footer-brand { color: #fff; font-size: 17px; font-weight: 800; }
  .footer-col b { display: block; color: #fff; font-size: 13px; margin-bottom: 12px; letter-spacing: 0.5px; }
  .footer-col a { display: block; color: #94a3bd; text-decoration: none; font-size: 13px; padding: 4px 0; transition: color 0.15s; }
  .footer-col a:hover { color: #fff; }

  .footer-bottom {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    max-width: 1160px;
    margin: auto;
    padding: 16px 24px;
    font-size: 12px;
    color: #7c8aa5;
    text-align: center;
  }

  @media (max-width: 900px) {
    .main-nav { display: none; }
    .footer-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
