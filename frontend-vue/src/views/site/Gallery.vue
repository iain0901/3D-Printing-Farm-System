<template>
  <div class="gallery-page">
    <site-hero eyebrow="GALLERY" title="作品案例" lead="功能件、公仔、量產零件——每一件都經過切片優化與出貨前品檢。" />

    <section class="block">
      <div class="filter-bar">
        <button v-for="cat in categories" :key="cat" class="chip" :class="{ active: current === cat }" @click="current = cat">
          {{ cat }}
        </button>
      </div>

      <div class="work-grid">
        <figure v-for="item in visibleWorks" :key="item.title" class="work">
          <img :src="item.src" :alt="item.title" loading="lazy" />
          <figcaption>
            <b>{{ item.title }}</b>
            <span>{{ item.meta }}</span>
          </figcaption>
        </figure>
      </div>

      <!-- 換實照：將 src/assets/showcase/ 的 SVG 換成同名照片檔，或於 works 陣列改路徑 -->
      <p class="swap-hint">營運備註：此區目前為插畫佔位，請替換為實際成品照（建議 1200×900、白底或場景照）。</p>
    </section>

    <section class="cta-band">
      <h2>想看你的作品在這裡？</h2>
      <router-link to="/quote" class="btn primary">開始你的案件</router-link>
    </section>
  </div>
</template>

<script>
  import SiteHero from '@/components/site/SiteHero'

  import showcase1 from '@/assets/showcase/showcase-1.svg'
  import showcase2 from '@/assets/showcase/showcase-2.svg'
  import showcase3 from '@/assets/showcase/showcase-3.svg'
  import showcase4 from '@/assets/showcase/showcase-4.svg'

  export default {
    name: 'SiteGallery',
    components: { SiteHero },
    data() {
      return {
        categories: ['全部', '功能零件', '公仔模型', '生活小物', '量產'],
        current: '全部',
        works: [
          { src: showcase1, title: 'Benchy 功能測試船', meta: 'PETG · 標準精度', cat: '功能零件' },
          { src: showcase2, title: '尼龍傳動齒輪', meta: 'Nylon-CF · 高強度', cat: '功能零件' },
          { src: showcase3, title: '螺旋紋花瓶', meta: 'PETG · 螺旋拼接無膠', cat: '生活小物' },
          { src: showcase4, title: '機器人公仔', meta: '多件組裝 · 12 分件', cat: '公仔模型' },
          { src: showcase1, title: '治具夾爪量產 x40', meta: 'ASA · 批次品檢', cat: '量產' },
          { src: showcase3, title: '手機支架系列', meta: 'PLA · 客製刻字', cat: '生活小物' },
        ],
      }
    },
    computed: {
      visibleWorks() {
        if (this.current === '全部') return this.works
        return this.works.filter((item) => item.cat === this.current)
      },
    },
  }
</script>

<style lang="scss" scoped>
  @import '@/styles/public-pages';

  .gallery-page {
    @include page-hero;
    @include page-section;
  }

  .filter-bar {
    display: flex;
    gap: 8px;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 24px;
    .chip {
      border: 1px solid #d5dce8;
      background: #fff;
      color: #475467;
      border-radius: 999px;
      padding: 8px 18px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      &:hover {
        border-color: #3563e9;
        color: #3563e9;
      }
      &.active {
        background: #3563e9;
        border-color: #3563e9;
        color: #fff;
        font-weight: 600;
      }
    }
  }

  .work-grid {
    @include card-grid(3);
  }
  .work {
    margin: 0;
    background: #fff;
    border: 1px solid #e3e9f4;
    border-radius: 14px;
    overflow: hidden;
    transition: box-shadow 0.2s, transform 0.2s;
    &:hover {
      box-shadow: 0 12px 32px rgba(23, 34, 59, 0.1);
      transform: translateY(-3px);
    }
    img {
      width: 100%;
      height: 200px;
      object-fit: cover;
      display: block;
    }
    figcaption {
      padding: 12px 14px;
      b {
        display: block;
        font-size: 14px;
      }
      span {
        font-size: 12px;
        color: #8992a3;
      }
    }
  }

  .swap-hint {
    text-align: center;
    color: #b6bfce;
    font-size: 11px;
    margin-top: 18px;
  }

  .cta-band {
    max-width: 1080px;
    margin: 50px auto 70px;
    padding: 46px 24px;
    text-align: center;
    background: linear-gradient(135deg, #17223b, #27407a);
    color: #fff;
    border-radius: 18px;
    h2 {
      color: #fff;
      margin-bottom: 16px;
    }
    .btn.primary {
      background: #3563e9;
      color: #fff;
      border-radius: 9px;
      padding: 12px 28px;
      font-weight: 800;
      text-decoration: none;
    }
  }
</style>
