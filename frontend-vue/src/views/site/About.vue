<template>
  <div class="about-page">
    <site-hero
      eyebrow="ABOUT US"
      title="關於 3DRFM 三點成型"
      lead="我們相信 3D 列印不該是懂機器的人的特權。 你帶著想法來，我們負責把它變成成品。"
    />

    <section class="block">
      <div class="story">
        <h2>我們在做什麼</h2>
        <p class="big">
          3DRFM 三點成型是一間專注 FDM 積層製造的工作室。我們把工廠級的生產管理系統
          用在自己的產線上——每一個案件都有切片紀錄、材料批次、品檢結果與出貨追蹤， 就像管理一條真正的生產線。
        </p>
        <p class="big">
          對你來說，這代表三件事：
          <b>報價透明</b>
          （價格怎麼來的一清二楚）、
          <b>過程可見</b>
          （進度線上查、異常主動通知）、
          <b>品質負責</b>
          （異常重印，不用吵架）。
        </p>
      </div>

      <h2 class="mt">生產承諾</h2>
      <div class="promise-grid">
        <div v-for="p in promises" :key="p.title" class="promise-card">
          <b>{{ p.title }}</b>
          <p>{{ p.desc }}</p>
        </div>
      </div>
    </section>

    <section class="block equipment">
      <h2>設備與能量</h2>
      <table class="equip-table">
        <thead>
          <tr>
            <th>類別</th>
            <th>說明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in equipment" :key="row.cat">
            <td>
              <b>{{ row.cat }}</b>
            </td>
            <td>{{ row.desc }}</td>
          </tr>
        </tbody>
      </table>
      <p class="fine">※ 設備清單會持續擴充，特殊需求（大尺寸、複合材料）歡迎詢問。</p>
    </section>

    <section class="cta-band">
      <h2>準備好開始了嗎？</h2>
      <router-link to="/quote" class="btn primary">上傳模型，立即估價</router-link>
    </section>
  </div>
</template>

<script>
  import SiteHero from '@/components/site/SiteHero'

  export default {
    name: 'SiteAbout',
    components: { SiteHero },
    data() {
      return {
        promises: [
          { title: '報價透明', desc: '重量、機時、加購逐項列出，公式公開在方案頁，沒有隱藏費用。' },
          { title: '異常重印', desc: '列印失敗屬於我們的成本，不是你的。經判定後免費重印。' },
          { title: '過程可見', desc: '客戶入口隨時查看進度；重要節點以 Email／LINE 主動通知。' },
          { title: '資料保密', desc: '你的模型檔案私有儲存，未經同意不用於任何展示或行銷。' },
        ],
        equipment: [
          { cat: 'FDM 機隊', desc: '多台 FDM 列印機，涵蓋 0.4 / 0.6 / 0.8 噴嘴，最大單件約 350mm 立方。' },
          { cat: '材料庫存', desc: 'PLA／PETG／ABS／ASA／TPU 常備，Nylon 與碳纖複合材依專案進貨。' },
          { cat: '後處理', desc: '基本去支撐打磨、黏合組裝；打磨拋光由合作端處理（交期另計）。' },
          { cat: '品檢', desc: '尺寸抽检、卡尺量測、裝配試合；關鍵尺寸案件提供量測紀錄。' },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  @import '@/styles/public-pages';

  .about-page {
    @include page-hero;
    @include page-section;
  }

  .story .big {
    color: #344054;
    line-height: 2.1;
    max-width: 820px;
    margin: 0 auto 16px;
    text-align: center;
    font-size: 15px;
    b {
      color: #3563e9;
    }
  }
  .mt {
    margin-top: 40px;
  }

  .promise-grid {
    @include card-grid(4);
  }
  .promise-card {
    @include soft-card;
    b {
      display: block;
      margin-bottom: 8px;
      font-size: 15px;
    }
    p {
      color: #667085;
      font-size: 13px;
      line-height: 1.9;
      margin: 0;
    }
  }

  .equip-table {
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
