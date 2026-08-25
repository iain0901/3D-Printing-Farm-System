<template>
  <div class="contact-page">
    <site-hero eyebrow="CONTACT" title="聯絡我們" lead="估價問題、量產洽談、合作提案——都歡迎。" />

    <section class="block">
      <div class="contact-grid">
        <div v-for="c in channels" :key="c.title" class="channel-card">
          <b>{{ c.title }}</b>
          <p>{{ c.desc }}</p>
          <a v-if="c.link" :href="c.link">{{ c.action }}</a>
          <router-link v-else-if="c.to" :to="c.to">{{ c.action }}</router-link>
        </div>
      </div>

      <div class="form-note">
        <h2>最快的方式</h2>
        <p>有模型要印？直接使用線上估價，填寫過程就會完成所有資訊蒐集，專員會在後續對話中跟你確認細節。</p>
        <router-link to="/quote" class="btn primary">前往線上估價</router-link>
      </div>
    </section>
  </div>
</template>

<script>
  import SiteHero from '@/components/site/SiteHero'

  export default {
    name: 'SiteContact',
    components: { SiteHero },
    data() {
      return {
        // 部署前請更新為實際聯絡資訊
        channels: [
          {
            title: '客戶入口留言',
            desc: '已送出案件的客戶：登入會員中心在案件內直接留言，往來紀錄完整保存。',
            to: '/portal/login',
            action: '前往會員中心',
          },
          { title: 'Email', desc: '一般詢問與合作洽談。', link: 'mailto:support@3dstu.com', action: 'support@3dstu.com' },
          {
            title: '官方 LINE',
            desc: '加入官方帳號，重要通知（報價就緒、出貨）也會透過 LINE 推送。',
            link: '#',
            action: 'LINE ID：（部署時填入）',
          },
          { title: '營業時間', desc: '週一至週五 10:00–18:00；急件請於估價時選擇急件選項。', action: '' },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  @import '@/styles/brand';
  @import '@/styles/public-pages';

  .contact-page {
    @include page-hero;
    @include page-section;
  }

  .contact-grid {
    @include card-grid(2);
  }
  .channel-card {
    @include soft-card;
    b {
      font-size: 16px;
      display: block;
      margin-bottom: 8px;
    }
    p {
      color: #667085;
      font-size: 14px;
      line-height: 1.9;
      margin: 0 0 12px;
    }
    a {
      color: #3563e9;
      font-weight: 700;
      text-decoration: none;
      font-size: 14px;
      &:hover {
        text-decoration: underline;
      }
    }
  }

  .form-note {
    margin-top: 44px;
    background: linear-gradient(135deg, #17223b, #27407a);
    color: #fff;
    border-radius: 16px;
    padding: 40px 30px;
    text-align: center;
    h2 {
      color: #fff;
    }
    p {
      color: #c4d0e6;
      max-width: 620px;
      margin: 10px auto 20px;
      line-height: 1.9;
    }
    .btn.primary {
      background: #3563e9;
      color: #fff !important;
      border-radius: 9px;
      padding: 12px 26px;
      font-weight: 800;
      text-decoration: none;
      display: inline-block;
    }
  }
</style>
