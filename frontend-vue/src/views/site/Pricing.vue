<template>
  <div class="pricing-page">
    <section class="page-hero">
      <p class="eyebrow">PRICING</p>
      <h1>方案與價格</h1>
      <p>透明計價：重量階梯 + 機時保護，取對你有利的方式。以下為 PETG 常見區間，實際以切片後正式報價為準。</p>
    </section>

    <section class="block">
      <div class="tiers">
        <div v-for="tier in tiers" :key="tier.name" class="tier" :class="{ featured: tier.featured }">
          <em v-if="tier.featured">最多人選</em>
          <b>{{ tier.name }}</b>
          <div class="price">
            {{ tier.price }}
            <span>/g 起</span>
          </div>
          <p class="target">{{ tier.target }}</p>
          <ul>
            <li v-for="f in tier.features" :key="f">{{ f }}</li>
          </ul>
          <router-link to="/quote" class="btn" :class="tier.featured ? 'primary' : 'ghost'">{{ tier.cta }}</router-link>
        </div>
      </div>

      <h2 class="mt">價格怎麼算？</h2>
      <div class="formula-grid">
        <div class="formula-card">
          <b>① 基礎列印費</b>
          <p>
            重量階梯價、機時費（每小時）、基本最低消費，
            <b class="hl">三者取最高</b>
            。很輕卻要印很久的模型不會被低估。
          </p>
        </div>
        <div class="formula-card">
          <b>② 加購與風險</b>
          <p>
            急件 %、多色設定費、組裝打磨等服務費逐項列出；長工時／大尺寸／高支撐的生產風險
            <b class="hl">只取最高一項</b>
            ，絕不疊加。
          </p>
        </div>
        <div class="formula-card">
          <b>③ 折扣取優</b>
          <p>
            同款量產折扣與重量階梯折扣，系統自動比較，
            <b class="hl">套用對你較優的那個</b>
            ，不會雙重折扣也不會疊加。
          </p>
        </div>
      </div>
    </section>

    <section class="block">
      <h2>加購服務</h2>
      <table class="addon-table">
        <thead>
          <tr>
            <th>項目</th>
            <th>說明</th>
            <th>計費</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in addons" :key="row.item">
            <td>
              <b>{{ row.item }}</b>
            </td>
            <td>{{ row.desc }}</td>
            <td>{{ row.fee }}</td>
          </tr>
        </tbody>
      </table>
      <p class="fine">※ 換色沖刷、支撐耗材與時間已包含在切片總重量／總時間內；多色設定費僅是顏色管理費。</p>
    </section>

    <section class="block scenarios">
      <h2>常見情境試算</h2>
      <div class="scenario-grid">
        <div v-for="s in scenarios" :key="s.title" class="scenario-card">
          <b>{{ s.title }}</b>
          <p>{{ s.detail }}</p>
          <span class="price-tag">約 NT$ {{ s.range }}</span>
        </div>
      </div>
      <p class="fine">試算依標準參考件推估，實際金額以上傳模型後的正式報價為準。</p>
    </section>

    <section class="cta-band">
      <h2>拿到精確報價只要一步</h2>
      <p>上傳 STL / 3MF / STEP，一分鐘完成。</p>
      <router-link to="/quote" class="btn primary">立即估價</router-link>
    </section>
  </div>
</template>

<script>
  export default {
    name: 'SitePricing',
    data() {
      return {
        tiers: [
          {
            name: '經濟列印',
            price: '$1.0',
            target: '已有完整檔案、重視價格的功能件與測試件',
            features: ['一般品質與排程', '基本品檢', '標準包裝出貨'],
            cta: '從這開始',
          },
          {
            name: '標準列印',
            price: '$1.4',
            target: '大多數客戶：外觀、強度與交期的平衡',
            featured: true,
            features: ['擺放方向與支撐優化', '切片參數調整', '成品整理＋完成照', '異常主動重印'],
            cta: '立即估價',
          },
          {
            name: '精細列印',
            price: '$1.9',
            target: '公仔、展示件、外觀要求高的作品',
            features: ['更細緻層高表現', '加強品檢', '優先排程', '特殊包裝可選'],
            cta: '從這開始',
          },
        ],
        addons: [
          { item: '急件加成', desc: '24 / 48 / 72 小時交期', fee: '+8% ~ +30%' },
          { item: '多色設定', desc: '分開多色前 4 色免費；組合多色第 1 色免費，之後每色收設定費', fee: '+$50/色' },
          { item: '基本組裝', desc: '黏合、簡單螺接（不含五金壓入）', fee: '$100 起/組' },
          { item: '檔案修復', desc: '破面、非流形、薄壁修補', fee: '$150 起' },
          { item: '尺寸檢查', desc: '裝配需求或關鍵尺寸量測確認', fee: '$50 起' },
          { item: '打磨拋光', desc: '外包合作端處理，依件報價', fee: '專員報價' },
          { item: '完工拍照', desc: '白底成品照片提供', fee: '$80/組' },
        ],
        scenarios: [
          { title: '手機架 · 功能件', detail: '約 60g、3 小時', range: '99 – 150' },
          { title: '公仔 · 15cm 多件', detail: '約 250g、12 小時、3 色', range: '400 – 650' },
          { title: '外殼 · 裝配需求', detail: '約 180g、7 小時、含尺寸確認', range: '300 – 500' },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  @import '@/styles/public-pages';

  .pricing-page {
    @include page-hero;
    @include page-section;
  }

  .tiers {
    @include card-grid(3);
    align-items: stretch;
  }
  .tier {
    @include soft-card;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: relative;
    &.featured {
      border-color: #3563e9;
      box-shadow: 0 14px 36px rgba(53, 99, 233, 0.16);
    }
    em {
      position: absolute;
      top: -11px;
      left: 50%;
      transform: translateX(-50%);
      background: #3563e9;
      color: #fff;
      font-style: normal;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 13px;
      border-radius: 999px;
    }
    b {
      font-size: 17px;
    }
    .price {
      font-size: 34px;
      font-weight: 800;
      span {
        font-size: 13px;
        color: #667085;
        font-weight: 500;
      }
    }
    .target {
      color: #667085;
      font-size: 13px;
      line-height: 1.7;
      min-height: 44px;
    }
    ul {
      list-style: none;
      padding: 0;
      margin: 0 0 6px;
      font-size: 14px;
      line-height: 2.1;
      color: #344054;
      flex: 1;
    }
  }
  .btn.primary {
    background: #3563e9;
    color: #fff !important;
    border-radius: 9px;
    padding: 10px 20px;
    font-weight: 700;
    text-decoration: none;
  }
  .btn.ghost {
    border: 1px solid #d5dce8;
    color: #17223b !important;
    border-radius: 9px;
    padding: 10px 20px;
    font-weight: 700;
    text-decoration: none;
  }

  .mt {
    margin-top: 46px;
  }
  .formula-grid {
    @include card-grid(3);
  }
  .formula-card {
    @include soft-card;
    b {
      color: #17223b;
    }
    p {
      color: #667085;
      font-size: 13px;
      line-height: 1.9;
    }
    .hl {
      color: #3563e9;
    }
  }

  .addon-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(23, 34, 59, 0.06);
    th,
    td {
      text-align: left;
      padding: 12px 16px;
      border-bottom: 1px solid #eef1f7;
      font-size: 14px;
    }
    th {
      background: #f8fafc;
      color: #667085;
      font-size: 12px;
      letter-spacing: 1px;
    }
    td:nth-child(2) {
      color: #667085;
    }
  }
  .fine {
    color: #98a2b3;
    font-size: 12px;
    margin-top: 10px;
  }

  .scenario-grid {
    @include card-grid(3);
  }
  .scenario-card {
    @include soft-card;
    b {
      font-size: 15px;
    }
    p {
      color: #667085;
      font-size: 13px;
      margin: 6px 0 10px;
    }
    .price-tag {
      color: #3563e9;
      font-weight: 800;
      font-size: 18px;
    }
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
    }
    p {
      color: #c4d0e6;
      margin: 8px 0 18px;
    }
    .btn.primary {
      background: #3563e9;
      color: #fff;
      border-radius: 9px;
      padding: 12px 26px;
      font-weight: 800;
      text-decoration: none;
    }
  }

  @media (max-width: 860px) {
    .addon-table th:nth-child(2),
    .addon-table td:nth-child(2) {
      display: none;
    }
  }
</style>
