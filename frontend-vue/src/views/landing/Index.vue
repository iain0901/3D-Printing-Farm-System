<template>
  <PublicLayout>
    <main class="landing-page">
      <section class="hero">
        <p class="eyebrow">3D PRINTING · MODELING · SMALL-BATCH</p>
        <h1>
          把你的想法，
          <br />
          變成拿在手上的成品。
        </h1>
        <p class="hero-sub">
          3DRFM 三點成型提供 FDM 3D 列印代印、3D 建模與小量製造服務。
          <br />
          上傳模型即時估價，切片、擺盤、支撐與品檢全部由我們處理。
        </p>
        <div class="hero-actions">
          <router-link to="/quote" class="btn primary">上傳模型，立即估價</router-link>
          <a href="#pricing" class="btn ghost-dark">查看方案價格</a>
        </div>
        <ul class="hero-points">
          <li>
            <el-icon><View /></el-icon>
            即時線上估價，價格透明
          </li>
          <li>
            <el-icon><Box /></el-icon>
            PETG／PLA／ASA／TPU 多材料
          </li>
          <li>
            <el-icon><Van /></el-icon>
            全台配送，進度線上追蹤
          </li>
        </ul>
      </section>

      <section id="services" class="services">
        <h2>你要做什麼？我們都能做。</h2>
        <div class="card-grid">
          <div class="card">
            <el-icon><Printer /></el-icon>
            <b>FDM 列印代印</b>
            <p>功能零件、外觀模型、公仔、Cosplay 道具。雲端切片與擺盤最佳化，成品穩定交件。</p>
          </div>
          <div class="card">
            <el-icon><MagicStick /></el-icon>
            <b>3D 建模</b>
            <p>只有草圖或實物也能做。由專員評估建模需求，報價前先確認可製造性。</p>
          </div>
          <div class="card">
            <el-icon><Tickets /></el-icon>
            <b>小量製造</b>
            <p>10～500 件的量產方案，同款重複件享量產折扣，交期與品檢流程制度化。</p>
          </div>
        </div>
      </section>

      <section id="process" class="process">
        <h2>四步拿到成品</h2>
        <ol class="steps">
          <li>
            <span>1</span>
            <b>上傳模型</b>
            <small>STL / 3MF / STEP，或描述需求</small>
          </li>
          <li>
            <span>2</span>
            <b>線上估價</b>
            <small>自動試算，專員確認後正式報價</small>
          </li>
          <li>
            <span>3</span>
            <b>生產製作</b>
            <small>切片、列印、品檢全程追蹤</small>
          </li>
          <li>
            <span>4</span>
            <b>包裝出貨</b>
            <small>完成照片確認後寄送或自取</small>
          </li>
        </ol>
      </section>

      <section id="showcase" class="showcase">
        <h2>我們印過的東西</h2>
        <p class="section-sub">功能件、公仔、量產零件——上傳你的模型，下一個成品就是你的。</p>
        <div class="gallery">
          <figure v-for="item in showcaseItems" :key="item.caption" class="shot">
            <img :src="item.src" :alt="item.caption" loading="lazy" />
            <figcaption>{{ item.caption }}</figcaption>
          </figure>
        </div>
        <!-- 換實照：把 src/assets/showcase/ 下的 SVG 換成同名 JPG/PNG（或改 showcaseItems 陣列路徑） -->
      </section>

      <section id="pricing" class="pricing">
        <h2>透明方案，依需求選擇</h2>
        <p class="section-sub">以下為 PETG 常見區間；實際價格以上傳模型切片後的正式報價為準。</p>
        <div class="price-grid">
          <div class="plan">
            <b>經濟列印</b>
            <div class="price">
              約 $1.0
              <span>/g 起</span>
            </div>
            <ul>
              <li>功能件、測試件</li>
              <li>標準排程</li>
              <li>基本品檢</li>
            </ul>
            <router-link to="/quote" class="btn ghost">從這個開始</router-link>
          </div>
          <div class="plan featured">
            <em>最多人選</em>
            <b>標準列印</b>
            <div class="price">
              約 $1.4
              <span>/g 起</span>
            </div>
            <ul>
              <li>外觀與強度平衡</li>
              <li>擺放方向與支撐優化</li>
              <li>切片參數調整</li>
            </ul>
            <router-link to="/quote" class="btn primary">立即估價</router-link>
          </div>
          <div class="plan">
            <b>精細列印</b>
            <div class="price">
              約 $1.9
              <span>/g 起</span>
            </div>
            <ul>
              <li>公仔、展示、外觀件</li>
              <li>更細緻表面品質</li>
              <li>加強品檢與完成照</li>
            </ul>
            <router-link to="/quote" class="btn ghost">從這個開始</router-link>
          </div>
        </div>
        <p class="fine-print">輕量但長時間的模型會以機時計價取高計算；急件、多色設定、組裝打磨為加購項目，送出前都會清楚列出。</p>
      </section>

      <section class="faq">
        <h2>常見問題</h2>
        <el-collapse class="faq-list">
          <el-collapse-item title="沒有 3D 檔案也可以委託嗎？" name="q1">
            可以。選擇「需要建模協助」，描述用途與尺寸（或附草圖照片），專員會評估後報價。
          </el-collapse-item>
          <el-collapse-item title="怎麼計價？只看重量嗎？" name="q2">
            以重量階梯價為基礎，但同時保證機時費用——很輕卻要印很久的模型會以較高者計價，不會讓品質妥協。
          </el-collapse-item>
          <el-collapse-item title="可以多色嗎？" name="q3">
            可以。上傳多零件模型可在網站上直接為每個零件指定顏色；組合多色與分開多色的計費規則不同，估價時會說明。
          </el-collapse-item>
          <el-collapse-item title="多久會收到成品？" name="q3b">
            一般案件依生產排程 3～7 天；48hr／24hr 急件請在估價時選擇急件選項。
          </el-collapse-item>
          <el-collapse-item title="如何追蹤進度？" name="q4">
            送出案件後會取得專屬追蹤連結，也可註冊會員在客戶入口查看進度、報價與留言溝通。
          </el-collapse-item>
        </el-collapse>
      </section>

      <section class="final-cta">
        <h2>準備好開始了嗎？</h2>
        <p>上傳模型只要一分鐘，估價結果立即顯示。</p>
        <router-link to="/quote" class="btn primary big">建立我的列印案件</router-link>
      </section>
    </main>
  </PublicLayout>
</template>

<script>
  import PublicLayout from '@/layouts/PublicLayout'
  import showcase1 from '@/assets/showcase/showcase-1.svg'
  import showcase2 from '@/assets/showcase/showcase-2.svg'
  import showcase3 from '@/assets/showcase/showcase-3.svg'
  import showcase4 from '@/assets/showcase/showcase-4.svg'

  export default {
    name: 'Landing',
    data() {
      return {
        year: new Date().getFullYear(),
        showcaseItems: [
          { src: showcase1, caption: '功能原型 · Benchy 標準件' },
          { src: showcase2, caption: '機構零件 · 尼龍齒輪' },
          { src: showcase3, caption: '生活小物 · PETG 螺旋花瓶' },
          { src: showcase4, caption: '公仔模型 · 多件組裝' },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  .landing-page {
    min-height: 100vh;
    background: #f5f7fb;
    color: #17223b;
  }
  .brand {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.4px;
  }
  .brand span {
    font-size: 13px;
    color: #6b7280;
    font-weight: 500;
    margin-left: 7px;
  }
  .header-nav {
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .header-nav a {
    color: #4b5563;
    text-decoration: none;
    font-size: 14px;
  }
  .nav-cta {
    border-radius: 8px;
    padding: 8px 16px;
    font-weight: 600;
  }
  .nav-cta.primary {
    background: #3563e9;
    color: #fff !important;
  }
  .nav-cta.ghost {
    border: 1px solid #d5dce8;
  }

  .hero {
    max-width: 900px;
    margin: 40px auto 30px;
    text-align: center;
    padding: 0 24px;
  }
  .eyebrow {
    color: #3563e9;
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 2px;
  }
  h1 {
    font-size: 44px;
    line-height: 1.25;
    margin: 14px 0 18px;
  }
  .hero-sub {
    color: #667085;
    line-height: 1.9;
  }
  .hero-actions {
    display: flex;
    gap: 14px;
    justify-content: center;
    margin: 26px 0 20px;
    flex-wrap: wrap;
  }
  .btn {
    display: inline-block;
    border-radius: 10px;
    padding: 13px 26px;
    font-weight: 700;
    text-decoration: none;
    font-size: 15px;
    transition: 0.2s;
  }
  .btn.primary {
    background: #3563e9;
    color: #fff;
    box-shadow: 0 8px 24px rgba(53, 99, 233, 0.28);
  }
  .btn.primary:hover {
    transform: translateY(-1px);
  }
  .btn.ghost,
  .btn.ghost-dark {
    border: 1px solid #cfd7e5;
    color: #17223b;
    background: #fff;
  }
  .btn.big {
    padding: 16px 34px;
    font-size: 17px;
  }
  .hero-points {
    list-style: none;
    display: flex;
    gap: 28px;
    justify-content: center;
    padding: 0;
    margin: 8px 0 0;
    flex-wrap: wrap;
  }
  .hero-points li {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #475467;
    font-size: 14px;
  }

  section {
    max-width: 1080px;
    margin: auto;
    padding: 56px 24px 10px;
  }
  h2 {
    text-align: center;
    font-size: 30px;
    margin-bottom: 8px;
  }
  .section-sub,
  .fine-print {
    text-align: center;
    color: #667085;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 26px;
  }
  .card {
    background: #fff;
    border: 1px solid #e3e9f4;
    border-radius: 14px;
    padding: 28px 24px;
  }
  .card .el-icon {
    font-size: 30px;
    color: #3563e9;
  }
  .card b {
    display: block;
    font-size: 18px;
    margin: 12px 0 8px;
  }
  .card p {
    color: #667085;
    line-height: 1.8;
    margin: 0;
    font-size: 14px;
  }

  .steps {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    padding: 0;
    margin-top: 26px;
  }
  .steps li {
    background: #fff;
    border: 1px solid #e3e9f4;
    border-radius: 14px;
    padding: 22px 18px;
    text-align: center;
  }
  .steps li span {
    display: inline-flex;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #3563e9;
    color: #fff;
    font-weight: 800;
    align-items: center;
    justify-content: center;
    margin-bottom: 10px;
  }
  .steps li b {
    display: block;
    margin: 4px 0;
  }
  .steps li small {
    color: #667085;
  }

  .gallery {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-top: 26px;
  }
  .shot {
    margin: 0;
    background: #fff;
    border: 1px solid #e3e9f4;
    border-radius: 14px;
    overflow: hidden;
  }
  .shot img {
    width: 100%;
    height: 170px;
    object-fit: cover;
    display: block;
  }
  .shot figcaption {
    padding: 10px 12px;
    font-size: 13px;
    color: #475467;
    text-align: center;
  }

  .price-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-top: 26px;
    align-items: stretch;
  }
  .plan {
    background: #fff;
    border: 1px solid #e3e9f4;
    border-radius: 16px;
    padding: 28px 24px;
    text-align: center;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .plan.featured {
    border-color: #3563e9;
    box-shadow: 0 12px 34px rgba(53, 99, 233, 0.14);
  }
  .plan em {
    position: absolute;
    top: -12px;
    left: 50%;
    transform: translateX(-50%);
    background: #3563e9;
    color: #fff;
    font-style: normal;
    font-size: 12px;
    font-weight: 700;
    border-radius: 999px;
    padding: 4px 14px;
  }
  .plan b {
    font-size: 17px;
  }
  .price {
    font-size: 32px;
    font-weight: 800;
  }
  .price span {
    font-size: 14px;
    color: #667085;
    font-weight: 500;
  }
  .plan ul {
    list-style: none;
    margin: 0;
    padding: 0;
    color: #475467;
    font-size: 14px;
    line-height: 2;
    flex: 1;
  }

  .faq-list {
    max-width: 760px;
    margin: 22px auto 0;
  }

  .final-cta {
    text-align: center;
    padding-bottom: 70px;
  }
  .final-cta p {
    color: #667085;
    margin-bottom: 20px;
  }

  .site-footer > div {
    max-width: 1080px;
    margin: auto;
    padding: 10px 24px;
    text-align: center;
  }
  .footer-brand {
    font-weight: 800;
    padding-top: 18px !important;
  }
  .footer-links a {
    color: #4b5563;
    text-decoration: none;
    margin: 0 12px;
    font-size: 14px;
  }
  .footer-copy {
    color: #98a2b3;
    font-size: 13px;
    padding-bottom: 20px !important;
  }

  @media (max-width: 860px) {
    h1 {
      font-size: 33px;
    }
    .card-grid,
    .price-grid {
      grid-template-columns: 1fr;
    }
    .steps {
      grid-template-columns: repeat(2, 1fr);
    }
    .gallery {
      grid-template-columns: repeat(2, 1fr);
    }
    .header-nav a:not(.nav-cta) {
      display: none;
    }
  }
</style>
