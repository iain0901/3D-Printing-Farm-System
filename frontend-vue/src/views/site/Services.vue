<template>
  <div class="services-page">
    <site-hero eyebrow="SERVICES" title="服務項目" lead="從單一零件到上千件量產，三條產品線覆蓋你所有的 3D 製造需求。" />

    <section class="block">
      <div v-for="svc in services" :key="svc.title" class="service">
        <div class="service-text">
          <h2>{{ svc.title }}</h2>
          <p class="lead">{{ svc.lead }}</p>
          <ul>
            <li v-for="point in svc.points" :key="point">{{ point }}</li>
          </ul>
          <router-link to="/quote" class="btn primary">以此服務估價</router-link>
        </div>
        <div class="service-visual" :style="{ background: svc.tint }">
          <span class="visual-emoji-free">{{ svc.badge }}</span>
        </div>
      </div>
    </section>

    <section class="block materials">
      <h2>支援材料</h2>
      <p class="sub">常用材料現貨供應；特殊材料與客供料請先詢問。</p>
      <div class="material-grid">
        <div v-for="m in materials" :key="m.name" class="material-card">
          <b>{{ m.name }}</b>
          <p>{{ m.desc }}</p>
          <span class="temp">{{ m.note }}</span>
        </div>
      </div>
    </section>

    <section class="cta-band">
      <h2>不確定哪種服務適合你？</h2>
      <p>上傳模型或描述需求，專員會建議最合適的做法。</p>
      <router-link to="/quote" class="btn primary">免費取得估價</router-link>
    </section>
  </div>
</template>

<script>
  import SiteHero from '@/components/site/SiteHero'

  export default {
    name: 'SiteServices',
    components: { SiteHero },
    data() {
      return {
        services: [
          {
            title: 'FDM 列印代印',
            lead: '你提供模型，我們負責切片、擺盤、支撐、列印與後處理，交付可直接使用的成品。',
            points: [
              '雲端切片與擺放方向最佳化，強度與外觀兼顧',
              'PLA / PETG / ABS / ASA / TPU 常備材料',
              '每件成品基本品檢，異常主動重印',
              '完成照片確認後包裝出貨',
            ],
            tint: 'linear-gradient(135deg,#eef3ff,#dfe9ff)',
            badge: 'FDM',
          },
          {
            title: '3D 建模',
            lead: '只有草圖、照片或實物也能做。專員先確認可製造性再報價，不做做不到的承諾。',
            points: [
              '參數化建模：外殼、夾具、替換零件',
              '既有模型修改與修復（破面、薄壁）',
              '依用途建議公差與配合方式',
              '建模費用獨立報價，過程分段確認',
            ],
            tint: 'linear-gradient(135deg,#f3efff,#e5dcfb)',
            badge: 'CAD',
          },
          {
            title: '小量製造',
            lead: '10～500 件的量產方案。同款重複件享折扣，交期與品檢制度化。',
            points: [
              '首件確認（FAI）後才展開全批生產',
              '批次品檢紀錄，可應要求提供',
              '分批交貨排程，降低庫存壓力',
              '長期專案享有鎖價與優先產能',
            ],
            tint: 'linear-gradient(135deg,#fdf3e7,#f9e4c8)',
            badge: 'BATCH',
          },
        ],
        materials: [
          { name: 'PLA', desc: '容易印、細節好，適合外觀件與原型。', note: '經濟 · 一般強度' },
          { name: 'PETG', desc: '韌性與耐化學性佳，功能件主力材料。', note: '推薦 · 戶外可用' },
          { name: 'ABS', desc: '耐熱耐衝擊，可打磨上色。', note: '進階 · 需注意翹曲' },
          { name: 'ASA', desc: '抗紫外線，戶外零件首選。', note: '戶外 · 耐候' },
          { name: 'TPU', desc: '軟性彈性材料，緩衝、密封、手機殼。', note: '軟性 · 彈性體' },
          { name: 'Nylon / CF', desc: '高強度碳纖複合，工裝治具等級。', note: '頂規 · 工程級' },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  @import '@/styles/public-pages';

  .services-page {
    @include page-hero;
    @include page-section;
  }

  .service {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 30px;
    align-items: center;
    margin-bottom: 46px;

    &:nth-child(even) .service-visual {
      order: -1;
    }
  }

  .service-text h2 {
    font-size: 26px;
    margin-bottom: 8px;
    text-align: left;
  }
  .lead {
    color: #475467;
    line-height: 1.9;
    margin-bottom: 14px;
  }
  .service-text ul {
    padding-left: 20px;
    color: #344054;
    line-height: 2.1;
    margin: 0 0 18px;
    font-size: 14px;
  }
  .btn.primary {
    display: inline-block;
    background: #3563e9;
    color: #fff;
    border-radius: 9px;
    padding: 11px 22px;
    font-weight: 700;
    text-decoration: none;
    font-size: 14px;
  }

  .service-visual {
    border-radius: 16px;
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .visual-emoji-free {
    font-weight: 900;
    font-size: 44px;
    letter-spacing: 3px;
    color: #3563e9;
    opacity: 0.55;
  }

  .material-grid {
    @include card-grid(3);
  }
  .material-card {
    @include soft-card;
    b {
      font-size: 16px;
    }
    p {
      color: #667085;
      font-size: 13px;
      line-height: 1.8;
      margin: 8px 0 12px;
      min-height: 42px;
    }
    .temp {
      font-size: 12px;
      color: #3563e9;
      background: #eef3ff;
      border-radius: 999px;
      padding: 3px 10px;
    }
  }

  .cta-band {
    max-width: 1080px;
    margin: auto;
    padding: 50px 24px 70px;
    text-align: center;
    background: linear-gradient(135deg, #17223b, #27407a);
    color: #fff;
    border-radius: 18px;
    margin-bottom: 60px;
    h2 {
      color: #fff;
    }
    p {
      color: #c4d0e6;
      margin: 10px 0 20px;
    }
  }

  @media (max-width: 860px) {
    .service {
      grid-template-columns: 1fr;
    }
    .service:nth-child(even) .service-visual {
      order: 0;
    }
  }
</style>
