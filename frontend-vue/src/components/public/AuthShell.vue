<template>
  <public-shell>
    <section class="auth-workspace studio-wrap">
      <aside class="auth-poster">
        <p class="studio-kicker">每個作品，都從一個想法開始</p>
        <h2>
          下一個好點子，
          <br />
          一起把它做出來。
        </h2>
        <object-collage kind="parts" />
        <div class="auth-poster-note">
          <span>從草圖，到日常。</span>
          <span>一層一層，慢慢成型 ↗</span>
        </div>
      </aside>
      <div class="auth-form-panel">
        <router-link to="/" class="auth-back">← 回到工作室</router-link>
        <p class="studio-kicker">{{ eyebrow }}</p>
        <h1>{{ title }}</h1>
        <p class="auth-description">{{ description }}</p>
        <slot />
      </div>
    </section>
  </public-shell>
</template>

<script>
  import PublicShell from './PublicShell.vue'
  import ObjectCollage from './ObjectCollage.vue'
  export default {
    name: 'AuthShell',
    components: { PublicShell, ObjectCollage },
    props: { title: String, description: String, eyebrow: { type: String, default: '三點成型・會員中心' } },
  }
</script>

<style lang="scss">
  .auth-workspace {
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    padding-top: 26px;
    padding-bottom: 70px;
    align-items: stretch;
  }
  .auth-poster {
    background: #c5ddd4;
    padding: 38px 38px 26px;
    border-radius: 8px 0 0 8px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
  }
  .auth-poster h2 {
    font-size: clamp(26px, 3vw, 39px);
    line-height: 1.5;
    letter-spacing: -0.035em;
    margin: 16px 0 0;
  }
  .auth-poster .object-collage {
    width: 100%;
    min-height: 270px;
    margin: -5px auto 0;
  }
  .auth-poster-note {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    border-top: 1px solid #79978b;
    padding-top: 18px;
    gap: 10px;
  }
  .auth-form-panel {
    background: #fffefa;
    padding: 38px clamp(25px, 5vw, 74px) 48px;
    border: 1px solid #dedfd4;
    border-left: none;
    border-radius: 0 8px 8px 0;
  }
  .auth-back {
    display: inline-block;
    font-size: 12px;
    margin-bottom: 32px;
  }
  .auth-form-panel h1 {
    font-size: 34px;
    margin: 10px 0;
    line-height: 1.35;
    letter-spacing: -0.03em;
  }
  .auth-description {
    color: #64736b;
    font-size: 14px;
    margin-bottom: 25px;
  }
  .auth-form-panel .el-form-item {
    margin-bottom: 21px;
  }
  .auth-form-panel .el-input__wrapper {
    padding: 6px 13px;
    box-shadow: 0 0 0 1px #c7cfc8 inset;
  }
  .auth-form-panel .el-input__wrapper.is-focus {
    box-shadow: 0 0 0 2px #247f93 inset;
  }
  .auth-form-panel .auth-submit {
    width: 100%;
    height: 47px;
    background: #173c43;
    border-color: #173c43;
    margin-top: 5px;
  }
  .auth-form-panel .auth-submit:hover {
    background: #28575c;
  }
  .auth-links {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-top: 24px;
    font-size: 13px;
  }
  .auth-links a {
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .auth-note {
    font-size: 12px;
    color: #64736b;
    margin-top: 25px;
    padding-top: 20px;
    border-top: 1px solid #dfe3d8;
  }
  @media (max-width: 760px) {
    .auth-workspace {
      grid-template-columns: 1fr;
      padding-top: 8px;
      padding-bottom: 40px;
    }
    .auth-poster {
      padding: 22px 24px;
      border-radius: 8px 8px 0 0;
      position: relative;
      min-height: 164px;
    }
    .auth-poster .studio-kicker {
      font-size: 10px;
    }
    .auth-poster h2 {
      font-size: 24px;
      position: relative;
      z-index: 1;
    }
    .auth-poster .object-collage {
      position: absolute;
      width: 230px;
      right: -36px;
      bottom: -15px;
      opacity: 0.7;
    }
    .auth-poster-note {
      display: none;
    }
    .auth-form-panel {
      padding: 27px 24px 36px;
      border: 1px solid #dedfd4;
      border-top: none;
      border-radius: 0 0 8px 8px;
    }
    .auth-back {
      margin-bottom: 22px;
    }
    .auth-form-panel h1 {
      font-size: 30px;
    }
  }
</style>
