<template>
  <public-layout>
    <main class="landing">
      <!-- ============ HERO ============ -->
      <section class="hero dark-canvas layer-lines">
        <div class="hero-inner">
          <div class="hero-copy">
            <p class="mono-label">3D PRINTING · MODELING · BATCH</p>
            <h1>
              把你的想法
              <br />
              <span class="accent">一層一層</span>
              ，變成成品。
            </h1>
            <p class="hero-sub">
              3DRFM 三點成型 —— FDM 列印代印、建模與小量製造。
              <br class="hide-m" />
              工廠級生產管理系統驅動，報價透明、進度可見、品質負責。
            </p>
            <div class="cta-row">
              <router-link to="/quote" class="btnx accent lg">上傳模型 · 立即估價</router-link>
              <a href="#process" class="btnx ghost-light">看看我們怎麼做</a>
            </div>
            <div class="chips">
              <span class="spec-chip">
                <i />
                今日可排程
              </span>
              <span class="spec-chip">
                <i />
                PETG / PLA / ASA / TPU
              </span>
              <span class="spec-chip">
                <i />
                最大 350mm³
              </span>
            </div>
          </div>

          <div class="stack-art" aria-hidden="true">
            <div class="plate p1" />
            <div class="plate p2" />
            <div class="plate p3" />
            <div class="plate p4" />
            <div class="plate top">
              <span class="nozzle" />
              <span class="beam" />
            </div>
            <p class="z-label">Z+ 0.20mm / layer</p>
          </div>
        </div>

        <div class="marquee">
          <div class="track">
            <span v-for="n in 2" :key="'m' + n">
              PLA ◆ PETG ◆ ABS ◆ ASA ◆ TPU 95A ◆ NYLON ◆ PETG-CF ◆ PLA MATTE ◆ SUPPORT FOR PVA ◆&nbsp;
            </span>
          </div>
        </div>
      </section>

      <!-- ============ 數據帶 ============ -->
      <section class="stats">
        <div v-for="s in stats" :key="s.label" class="stat notch-card">
          <b>
            {{ s.value }}
            <small>{{ s.unit }}</small>
          </b>
          <span>{{ s.label }}</span>
        </div>
      </section>

      <!-- ============ 服務 ============ -->
      <section id="services" class="pad center-head">
        <p class="mono-label on-light">01 — SERVICES</p>
        <h2 class="h-display">三條產品線，覆蓋所有製造需求</h2>
        <div class="svc-grid">
          <article v-for="(svc, i) in services" :key="svc.title" class="notch-card svc-card">
            <span class="idx">{{ String(i + 1).padStart(2, '0') }}</span>
            <h3>{{ svc.title }}</h3>
            <p>{{ svc.desc }}</p>
            <ul>
              <li v-for="pt in svc.points" :key="pt">{{ pt }}</li>
            </ul>
            <router-link to="/quote" class="more">以此服務估價 →</router-link>
          </article>
        </div>
      </section>

      <div class="layer-divider" />

      <!-- ============ 流程時間軸 ============ -->
      <section id="process" class="pad">
        <p class="mono-label on-light" style="display: flex; justify-content: center">02 — PROCESS</p>
        <h2 class="h-display center">四步，拿到成品</h2>
        <ol class="timeline">
          <li v-for="(step, i) in steps" :key="step.title">
            <span class="dot" :class="{ hot: i === steps.length - 1 }">{{ i + 1 }}</span>
            <div class="t-body">
              <b>{{ step.title }}</b>
              <p>{{ step.desc }}</p>
            </div>
          </li>
        </ol>
      </section>

      <!-- ============ 作品預覽 ============ -->
      <section class="pad-tight pad">
        <div class="head-row">
          <div>
            <p class="mono-label on-light">03 — WORKS</p>
            <h2 class="h-display">最近的作品</h2>
          </div>
          <router-link to="/gallery" class="btnx ghost-dark sm">查看全部作品</router-link>
        </div>
        <div class="work-grid">
          <figure v-for="item in showcaseItems" :key="item.caption" class="work">
            <img :src="item.src" :alt="item.caption" loading="lazy" />
            <figcaption>{{ item.caption }}</figcaption>
          </figure>
        </div>
      </section>

      <!-- ============ 方案預覽 ============ -->
      <section class="dark-canvas layer-lines pricing-band">
        <div class="pad-tight pad">
          <p class="mono-label">04 — PRICING</p>
          <h2 class="h-display">透明計價，公式公開</h2>
          <p class="lead">基礎費取「重量階梯、機時、最低消費」三者最高；風險只收最高一項；折扣自動取優。沒有隱藏費用。</p>
          <div class="tier-row">
            <div v-for="tier in tiers" :key="tier.name" class="tier-mini" :class="{ hot: tier.featured }">
              <em v-if="tier.featured">主力方案</em>
              <b>{{ tier.name }}</b>
              <div class="tp">
                {{ tier.price }}
                <span>/g 起</span>
              </div>
              <span>{{ tier.note }}</span>
            </div>
          </div>
          <div class="center" style="margin-top: 30px">
            <router-link to="/pricing" class="btnx ghost-light">完整方案與加購說明 →</router-link>
          </div>
        </div>
      </section>

      <!-- ============ 客戶回饋（保留位） ============ -->
      <section class="pad-tight pad">
        <p class="mono-label on-light" style="display: flex; justify-content: center">05 — FEEDBACK</p>
        <h2 class="h-display center">客戶回饋</h2>
        <div class="fb-grid">
          <div v-for="fb in feedbackSlots" :key="fb.name" class="notch-card fb-card">
            <img :src="fb.avatar" alt="" class="avatar-slot" loading="lazy" />
            <p class="quote">{{ fb.quote }}</p>
            <b>{{ fb.name }}</b>
            <span>{{ fb.meta }}</span>
          </div>
        </div>
      </section>

      <!-- ============ CTA ============ -->
      <section class="cta dark-canvas layer-lines">
        <p class="mono-label">START NOW</p>
        <h2 class="h-display">下一個成品，就是你的。</h2>
        <div class="center" style="margin-top: 26px">
          <router-link to="/quote" class="btnx accent lg">建立我的列印案件</router-link>
        </div>
      </section>
    </main>
  </public-layout>
</template>

<script>
  import PublicLayout from '@/layouts/PublicLayout'
  import showcase1 from '@/assets/showcase/showcase-1.svg'
  import showcase2 from '@/assets/showcase/showcase-2.svg'
  import showcase3 from '@/assets/showcase/showcase-3.svg'
  import showcase4 from '@/assets/showcase/showcase-4.svg'

  export default {
    name: 'Landing',
    components: { PublicLayout },
    data() {
      return {
        services: [
          {
            title: 'FDM 列印代印',
            desc: '切片、擺盤、支撐、列印、後處理全包，交付可直接使用的成品。',
            points: ['多材料常備現貨', '每件基本品檢', '異常主動重印'],
          },
          {
            title: '3D 建模',
            desc: '草圖、照片或實物都能做；先確認可製造性再報價。',
            points: ['參數化建模與修復', '公差與配合建議', '分段確認不來回猜'],
          },
          {
            title: '小量製造',
            desc: '10～500 件量產制度化：首件確認後才展開全批。',
            points: ['批次品檢紀錄', '分批交貨排程', '長期鎖價優先產能'],
          },
        ],
        steps: [
          { title: '上傳模型', desc: 'STL / 3MF / STEP 或描述需求，一分鐘完成送件。' },
          { title: '線上估價', desc: '即時試算 + 專員切片確認正式報價，逐項透明。' },
          { title: '生產製作', desc: '切片優化、列印、品檢全程紀錄，進度線上追蹤。' },
          { title: '包裝出貨', desc: '完成照片確認後寄送，物流號碼直接推播給你。' },
        ],
        tiers: [
          { name: '經濟列印', price: '$1.0', note: '功能件・測試件' },
          { name: '標準列印', price: '$1.4', note: '外觀強度平衡', featured: true },
          { name: '精細列印', price: '$1.9', note: '公仔・展示件' },
        ],
        // 客戶回饋保留位：換上真實回饋時改 quote/name/meta 與 avatar 圖片
        feedbackSlots: [
          {
            name: '（客戶回饋保留位）',
            meta: '功能零件 · 機械廠',
            quote: '這裡將放上客戶的實際回饋文字，約兩到三行，說明交期與品質的體驗。',
            avatar: showcase4,
          },
          {
            name: '（客戶回饋保留位）',
            meta: '公仔 · 工作室',
            quote: '第二則回饋保留位。建議挑選具體細節的評語，例如表面處理或尺寸配合。',
            avatar: showcase3,
          },
          {
            name: '（客戶回饋保留位）',
            meta: '量產 · 電商賣家',
            quote: '第三則回饋保留位。量產客戶適合強調批次穩定與準時交付。',
            avatar: showcase2,
          },
        ],
        showcaseItems: [
          { src: showcase1, caption: '功能原型 · 標準測試件' },
          { src: showcase2, caption: '機構零件 · 高強度齒輪' },
          { src: showcase3, caption: '生活小物 · 螺旋花瓶' },
          { src: showcase4, caption: '公仔模型 · 多件組裝' },
        ],
        stats: [
          { value: '500', unit: '+', label: '累計列印案件' },
          { value: '98', unit: '%', label: '準時交付率' },
          { value: '12', unit: '種', label: '常備工程材料' },
          { value: '<2', unit: '%', label: '客訴重印率' },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  .landing {
    background: var(--paper);
  }

  // ---------- HERO ----------
  .hero {
    padding: 0;
  }
  .hero-inner {
    max-width: 1180px;
    margin: auto;
    padding: 88px 24px 64px;
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 40px;
    align-items: center;
  }
  h1 {
    font-size: clamp(38px, 5.4vw, 60px);
    line-height: 1.16;
    letter-spacing: -0.01em;
    margin: 18px 0 20px;
  }
  .accent {
    color: var(--accent);
  }
  .hero-sub {
    font-size: 15.5px;
    line-height: 2;
    margin-bottom: 26px;
  }
  .cta-row {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: 24px;
  }
  .chips {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  // 積層堆疊藝術
  .stack-art {
    position: relative;
    height: 340px;
    display: grid;
    place-items: center;
    perspective: 800px;
    .plate {
      position: absolute;
      width: min(320px, 78%);
      height: 54px;
      border-radius: 12px;
      background: linear-gradient(180deg, #22345f, #182648);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 22px 44px rgba(0, 0, 0, 0.42);
    }
    .p1 {
      transform: translateY(96px) rotateX(52deg) scale(0.86);
      opacity: 0.45;
    }
    .p2 {
      transform: translateY(58px) rotateX(52deg) scale(0.9);
      opacity: 0.6;
    }
    .p3 {
      transform: translateY(20px) rotateX(52deg) scale(0.95);
      opacity: 0.78;
    }
    .p4 {
      transform: translateY(-18px) rotateX(52deg);
    }
    .top {
      transform: translateY(-56px) rotateX(52deg);
      background: var(--melt);
      border-color: #ffb185;
      position: relative;
    }
    .top .nozzle {
      position: absolute;
      left: 50%;
      top: -46px;
      width: 8px;
      height: 40px;
      background: #dfe6ff;
      border-radius: 4px 4px 2px 2px;
      transform: translateX(-50%);
      box-shadow: 0 0 18px rgba(255, 138, 61, 0.9);
    }
    .top .beam {
      position: absolute;
      left: 50%;
      bottom: -8px;
      width: 120px;
      height: 10px;
      transform: translateX(-50%);
      background: radial-gradient(closest-side, rgba(255, 138, 61, 0.85), transparent);
      filter: blur(2px);
    }
    .z-label {
      position: absolute;
      right: 6%;
      bottom: 8px;
      font-family: var(--mono);
      font-size: 11px;
      letter-spacing: 0.16em;
      color: #7f92bd;
    }
  }

  // ---------- STATS ----------
  .stats {
    max-width: 1160px;
    margin: -34px auto 0;
    padding: 0 24px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 14px;
    position: relative;
    z-index: 2;
    .stat {
      text-align: center;
      padding: 20px 12px;
      b {
        font-size: 34px;
        font-weight: 900;
        color: var(--ink);
        small {
          font-size: 15px;
          color: var(--accent-deep);
          margin-left: 2px;
        }
      }
      span {
        display: block;
        color: var(--muted);
        font-size: 13px;
        margin-top: 4px;
      }
    }
  }

  // ---------- 區塊通用 ----------
  .center-head {
    text-align: center;
    h2 {
      margin-top: 10px;
    }
  }

  .svc-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    margin-top: 30px;
    text-align: left;
  }
  .svc-card {
    .idx {
      float: right;
    }
    h3 {
      font-size: 19px;
      margin: 8px 0 10px;
    }
    p {
      color: var(--muted);
      font-size: 13.5px;
      line-height: 1.9;
      margin: 0 0 12px;
    }
    ul {
      margin: 0 0 16px;
      padding-left: 18px;
      font-size: 13px;
      color: #344054;
      line-height: 2;
    }
    .more {
      color: var(--accent-deep);
      font-weight: 700;
      text-decoration: none;
      font-size: 13.5px;
    }
  }

  // ---------- TIMELINE ----------
  .timeline {
    list-style: none;
    max-width: 760px;
    margin: 34px auto 0;
    padding: 0;
    position: relative;
    &::before {
      content: '';
      position: absolute;
      left: 19px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background: repeating-linear-gradient(180deg, var(--accent) 0 6px, transparent 6px 14px);
      opacity: 0.5;
    }
    li {
      display: flex;
      gap: 18px;
      padding: 14px 0;
      align-items: flex-start;
    }
    .dot {
      flex: 0 0 40px;
      height: 40px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid var(--line);
      display: grid;
      place-items: center;
      font-weight: 900;
      color: var(--ink);
      position: relative;
      z-index: 1;
      &.hot {
        background: var(--melt);
        border-color: transparent;
        color: #fff;
        box-shadow: 0 0 0 6px var(--accent-soft);
      }
    }
    .t-body b {
      font-size: 16px;
    }
    .t-body p {
      color: var(--muted);
      font-size: 13.5px;
      margin: 4px 0 0;
      line-height: 1.85;
    }
  }

  // ---------- WORKS ----------
  .head-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 26px;
    h2 {
      margin-top: 10px;
    }
  }
  .work-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    .work {
      margin: 0;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
      transition: 0.2s;
      &:hover {
        transform: translateY(-4px);
        box-shadow: var(--shadow-lift);
      }
      img {
        width: 100%;
        height: 160px;
        object-fit: cover;
        display: block;
      }
      figcaption {
        padding: 10px 12px;
        font-size: 12.5px;
        color: #45506b;
      }
    }
  }

  // ---------- PRICING BAND ----------
  .pricing-band {
    margin-top: 66px;
    padding-block: 64px;
  }
  .tier-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 28px;
    .tier-mini {
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 14px;
      padding: 24px;
      text-align: center;
      color: #dbe4f5;
      &.hot {
        border-color: var(--accent);
        background: rgba(255, 106, 43, 0.08);
        position: relative;
        em {
          position: absolute;
          top: -10px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--accent);
          color: #fff;
          font-style: normal;
          font-size: 11px;
          font-weight: 800;
          padding: 2px 12px;
          border-radius: 999px;
          white-space: nowrap;
        }
      }
      b {
        color: #fff;
        display: block;
        margin-bottom: 8px;
      }
      .tp {
        font-size: 32px;
        font-weight: 900;
        color: #fff;
        span {
          font-size: 13px;
          color: #93a3c2;
          font-weight: 500;
        }
      }
      > span {
        font-size: 12.5px;
        color: #93a3c2;
      }
    }
  }

  // ---------- FEEDBACK ----------
  .fb-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    margin-top: 28px;
    .avatar-slot {
      width: 52px;
      height: 52px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid var(--accent-soft);
    }
    .quote {
      color: #475467;
      font-size: 13.5px;
      line-height: 1.95;
      margin: 12px 0 14px;
      min-height: 80px;
    }
    b {
      font-size: 14px;
    }
    span {
      display: block;
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }
  }

  // ---------- CTA ----------
  .cta {
    padding: 76px 24px;
    text-align: center;
    margin-top: 60px;
  }

  @media (max-width: 960px) {
    .hero-inner {
      grid-template-columns: 1fr;
      padding-top: 60px;
    }
    .stack-art {
      display: none;
    }
    .stats {
      grid-template-columns: repeat(2, 1fr);
    }
    .svc-grid,
    .fb-grid,
    .work-grid,
    .tier-row {
      grid-template-columns: 1fr;
    }
    .work-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .hide-m {
    @media (max-width: 960px) {
      display: none;
    }
  }
</style>
