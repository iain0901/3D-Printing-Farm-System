<template>
  <public-shell class="brand-home">
    <section class="landing-poster home-panel">
      <div class="studio-wrap poster-grid">
        <div class="poster-copy">
          <p class="hero-category">模型代印 ／ 原型開發 ／ 小量製作</p>
          <h1>
            <span>把想法，</span>
            <span class="headline-last">
              印出來
              <span class="headline-stop">。</span>
            </span>
          </h1>
          <p class="poster-description">從單件原型到小量製作，讓設計有個實體。</p>
          <div class="poster-actions">
            <router-link to="/quote" class="studio-button">
              上傳模型・自動估價
              <span aria-hidden="true">→</span>
            </router-link>
            <router-link :to="{ path: '/', hash: '#services' }" class="text-link">
              先看看能做什麼
              <span aria-hidden="true">↓</span>
            </router-link>
          </div>
        </div>
        <hero-layer-field class="poster-art">
          <studio-image kind="signature" priority class="signature-object" />
        </hero-layer-field>
      </div>
      <div class="studio-wrap service-facts" aria-label="服務規模與製作資訊">
        <div><strong>1 件</strong><span>即可提出需求</span></div>
        <div><strong>{{ guideMaterials.length }} 種</strong><span>材料討論方向</span></div>
        <div><strong>依案件確認</strong><span>交期與尺寸</span></div>
        <router-link to="/guides/file-prep">上傳前確認檔案 →</router-link>
      </div>
    </section>

    <section id="services" class="studio-wrap applications-section home-panel">
      <aside class="free-print-entry" aria-label="免費列印站點入口">
        <div>
          <span>校園免費列印</span>
          <p>清華大學・水木書苑</p>
        </div>
        <router-link to="/free-print" class="text-link">免費列印站點 →</router-link>
      </aside>
      <header class="editorial-heading">
        <p class="section-index">01 ／ 製作的可能</p>
        <h2>
          研究的、工作的、
          <br />
          <span>你自己的。</span>
        </h2>
        <router-link to="/services" class="text-link">所有 FDM 製作服務 →</router-link>
      </header>
      <div class="application-layout">
        <article class="application-story story-school">
          <router-link to="/for/education" class="application-visual" aria-label="探索學校與實驗室製作">
            <span class="specimen-number" aria-hidden="true">01</span>
            <studio-image kind="parts" />
            <span class="visual-arrow" aria-hidden="true">→</span>
          </router-link>
          <div class="story-copy">
            <span class="story-category">學校・實驗室</span>
            <h3>
              從一個假設，
              <br />
              做到一個原型。
            </h3>
            <p>實驗治具、專題外殼，或畢業展桌上的那件作品。先把模型做出來，讓測試與討論繼續。</p>
            <div class="story-links">
              <router-link to="/services/research-lab">研究模型 →</router-link>
              <router-link to="/services/student-project">專題製作 →</router-link>
              <router-link to="/services/campus-gifts">文創紀念品 →</router-link>
            </div>
          </div>
        </article>
        <article class="application-story story-business">
          <div class="story-copy">
            <span class="story-category">企業・設計團隊</span>
            <h3>
              下一次提案，
              <br />
              帶實物來。
            </h3>
            <p>從外觀樣品、組裝驗證到小批量零件，將關鍵尺寸、材料與驗收條件，一次說清楚。</p>
            <div class="story-links">
              <router-link to="/services/exhibition">展示模型 →</router-link>
              <router-link to="/services/industrial-parts">工業件 →</router-link>
              <router-link to="/services/small-batch">小批量 →</router-link>
            </div>
          </div>
          <router-link to="/for/business" class="application-visual" aria-label="探索企業製作">
            <span class="specimen-number" aria-hidden="true">02</span>
            <studio-image kind="sketch" />
            <span class="visual-arrow" aria-hidden="true">→</span>
          </router-link>
        </article>
      </div>
      <article class="personal-story">
        <div class="personal-title">
          <span class="story-category">個人・創作者</span>
          <h3>
            剛好，
            <br />
            你也想做一個。
          </h3>
        </div>
        <studio-image kind="everyday" decorative />
        <div class="personal-copy">
          <p>一個桌上小物、一件模型配件，或網路找到的設計檔。單件也能製作，先告訴我們要怎麼用。</p>
          <router-link to="/for/personal" class="text-link">個人代印專區 →</router-link>
          <router-link to="/services/rush-print" class="personal-rush">趕時間？先確認急件可行性 →</router-link>
        </div>
      </article>
    </section>

    <section class="material-section home-panel" id="materials">
      <div class="studio-wrap material-heading">
        <p class="section-index">02 ／ 材料</p>
        <h2>依用途選材</h2>
        <router-link to="/materials" class="text-link">比較六種材料 →</router-link>
      </div>
      <div class="studio-wrap material-layout">
        <div class="material-display">
          <span class="material-big-type" aria-hidden="true">{{ selectedMaterial.name }}</span>
          <studio-image kind="printer" decorative />
          <studio-image kind="batch" class="material-object" decorative />
        </div>
        <div class="material-copy">
          <label class="material-question">
            先選最接近的用途
            <select v-model="materialIndex">
              <option v-for="(item, index) in guideMaterials" :key="item.name" :value="index">{{ item.uses }}（{{ item.name }}）</option>
            </select>
          </label>
          <div class="material-tabs" role="group" aria-label="選擇材料">
            <button
              v-for="(material, index) in guideMaterials"
              :key="material.name"
              :aria-pressed="materialIndex === index"
              :class="{ active: materialIndex === index }"
              @click="materialIndex = index"
            >
              {{ material.name }}
            </button>
          </div>
          <div class="material-details" aria-live="polite" aria-atomic="true">
            <span class="material-selected">{{ selectedMaterial.name }}</span>
            <h3>{{ selectedMaterial.title }}</h3>
            <p>{{ selectedMaterial.description }}</p>
            <dl>
              <div><dt>耐熱</dt><dd>{{ selectedMaterial.heat }}</dd></div>
              <div><dt>強度</dt><dd>{{ selectedMaterial.strength }}</dd></div>
              <div><dt>價格</dt><dd>{{ selectedMaterial.price }}</dd></div>
            </dl>
          </div>
        </div>
      </div>
    </section>

    <section class="studio-wrap commission-section home-panel">
      <div class="commission-title">
        <p class="section-index">03 ／ 開始製作</p>
        <h2>
          有檔案，
          <br />
          <span>就差這一步。</span>
        </h2>
        <p>直接上傳模型，取得初估。</p>
        <router-link to="/quote" class="studio-button">
          開始自動估價
          <span aria-hidden="true">→</span>
        </router-link>
        <router-link to="/portal/login" class="member-link">已有案件？登入會員中心 →</router-link>
      </div>
      <ol class="commission-steps">
        <li>
          <span>01</span>
          <div>
            <h3>上傳模型</h3>
            <studio-image kind="sketch" class="process-image" decorative />
            <p>STL／3MF 直接上傳；沒有模型可先帶尺寸與草圖。</p>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <h3>設定條件，取得初估</h3>
            <studio-image kind="spool" class="process-image" decorative />
            <p>用途、材料、品質與數量，不確定可留給專員。</p>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <h3>登入，帶入資料</h3>
            <studio-image kind="everyday" class="process-image" decorative />
            <p>送出前再登入，正式報價與交期另確認。</p>
          </div>
        </li>
        <li>
          <span>04</span>
          <div>
            <h3>確認製作，追蹤交付</h3>
            <studio-image kind="batch" class="process-image" decorative />
            <p>確認後即可追蹤製作進度。</p>
          </div>
        </li>
      </ol>
      <aside class="model-note">
        <studio-image kind="keepsake" decorative />
        <div>
          <h3>還停在草圖？</h3>
          <p>帶著尺寸、照片與用途，先確認建模範圍。</p>
        </div>
        <router-link to="/quote?mode=agent&amp;model=no" class="text-link">我需要建模協助 →</router-link>
      </aside>
    </section>

    <section id="faq" class="faq-section studio-wrap home-panel">
      <div>
        <p class="section-index">04 ／ 製作前須知</p>
        <h2>
          先問清楚，
          <br />
          再開始。
        </h2>
        <studio-image kind="vase" class="faq-object" decorative />
        <router-link to="/faq" class="text-link">查看所有問題 →</router-link>
      </div>
      <div class="faq-list">
        <details v-for="(faq, index) in faqs" :key="faq.question">
          <summary>
            <span class="faq-index">0{{ index + 1 }}</span>
            {{ faq.question }}
            <span class="faq-plus" aria-hidden="true">＋</span>
          </summary>
          <p>{{ faq.answer }}</p>
        </details>
      </div>
    </section>
    <section class="closing-poster home-panel">
      <div class="studio-wrap">
        <div class="closing-top">
          <p>
            螢幕裡的下一個設計，
            <br />
            我們手上見。
          </p>
          <studio-image kind="signature" class="closing-object" decorative />
          <router-link to="/quote" aria-label="開始自動估價" class="closing-arrow">→</router-link>
        </div>
        <span class="closing-wordmark" aria-hidden="true">3DRFM</span>
        <div class="closing-baseline">
          <span>FDM 3D 列印製造服務</span>
          <router-link to="/contact">與我們聯絡 →</router-link>
        </div>
      </div>
    </section>
  </public-shell>
</template>
<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import StudioImage from '@/components/public/StudioImage.vue'
  import HeroLayerField from '@/components/public/HeroLayerField.vue'
  import { materialGuide } from '@/content/materialGuide.mjs'
  export default {
    name: 'Landing',
    components: { PublicShell, StudioImage, HeroLayerField },
    data() {
      return {
        materialIndex: 0,
        guideMaterials: materialGuide,
        faqs: [
          {
            question: '沒有 3D 模型，也可以委託嗎？',
            answer: '可以。建立案件時選擇「還沒有，需要建模協助」，提供用途、關鍵尺寸、草圖或參考照片，專員會協助確認建模範圍與報價。',
          },
          {
            question: '可以上傳哪些檔案？',
            answer: '支援 STL、3MF、STEP／STP 模型，每個檔案上限 100 MB。若需要建模協助，也可以提供圖片或 PDF 作為需求附件。',
          },
          {
            question: '線上初估就是最後的價格嗎？',
            answer: '不是。初估僅供規劃，正式報價會依模型切片、材料用量、列印時間及後處理需求確認，確認後才安排製作。',
          },
          {
            question: '只製作一件也可以嗎？',
            answer: '可以，單件原型與小量製作都能提出需求。請在案件中填寫數量與用途，讓專員確認合適的製作方式。',
          },
          {
            question: '多久可以收到？如何追蹤？',
            answer: '製作時間依模型複雜度、數量與排程而定。你可以填寫希望交期，由專員確認；送出後請保存案件專屬連結，查看報價與進度。',
          },
        ],
      }
    },
    computed: {
      selectedMaterial() {
        return this.guideMaterials[this.materialIndex]
      },
    },
    mounted() {
      const utility = this.$el.querySelector('.public-utility')
      const header = this.$el.querySelector('.public-header')
      if (!utility || !header) return
      const keepTop = () => {
        if (this.userScrolled || this.$route.hash) return
        if (window.scrollY > 0 && window.scrollY <= utility.offsetHeight + header.offsetHeight) {
          window.scrollTo({ top: 0, behavior: 'auto' })
        }
      }
      const sync = () => {
        const root = document.documentElement.style
        root.setProperty('--home-utility', `${utility.offsetHeight}px`)
        root.setProperty('--home-chrome', `${utility.offsetHeight + header.offsetHeight}px`)
        keepTop()
      }
      this.markUserScrolled = () => {
        this.userScrolled = true
      }
      ;['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) =>
        window.addEventListener(type, this.markUserScrolled, { once: true, passive: true })
      )
      this.keepTop = keepTop
      window.addEventListener('scroll', keepTop, { passive: true })
      this.releaseTop = setTimeout(() => window.removeEventListener('scroll', keepTop), 2500)
      sync()
      if (typeof ResizeObserver === 'function') {
        this.chromeObserver = new ResizeObserver(sync)
        this.chromeObserver.observe(utility)
        this.chromeObserver.observe(header)
      }
    },
    beforeUnmount() {
      if (this.chromeObserver) this.chromeObserver.disconnect()
      clearTimeout(this.releaseTop)
      window.removeEventListener('scroll', this.keepTop)
      ;['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) => window.removeEventListener(type, this.markUserScrolled))
      document.documentElement.style.removeProperty('--home-utility')
      document.documentElement.style.removeProperty('--home-chrome')
    },
  }
</script>
<style lang="scss" scoped>
  .home-panel {
    box-sizing: border-box;
    min-height: calc(100svh - var(--home-chrome, 141px));
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .service-facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    align-items: end;
    padding-block: 18px;
    border-block: 1px solid var(--rfm-ink);
  }
  .service-facts strong, .service-facts span { display: block; }
  .service-facts strong { font-size: 22px; }
  .service-facts a { justify-self: end; align-self: center; font-size: 13px; font-weight: 700; }
  .material-question { display: grid; gap: 10px; margin-bottom: 16px; font-weight: 700; }
  .material-question select { width: 100%; min-width: 0; padding: 12px; font: inherit; color: var(--rfm-ink); background: var(--rfm-surface); border: 1px solid var(--rfm-line); }
  @media (max-width: 600px) { .service-facts { grid-template-columns: 1fr 1fr; } .service-facts a { grid-column: 1 / -1; justify-self: start; } }
  .brand-home {
    --ink: var(--rfm-ink);
    --paper: var(--rfm-paper);
    --blue: var(--rfm-interactive);
    --lime: var(--rfm-subtle);
    --accent: var(--rfm-accent);
  }
  .landing-poster {
    overflow: hidden;
    padding-bottom: 12px;
  }
  .poster-grid {
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    align-items: center;
    position: relative;
    min-height: 0;
    flex: 1;
  }
  .poster-copy {
    position: relative;
    z-index: 2;
    padding-block: 24px;
  }
  .hero-category {
    font-size: 12px;
    margin: 0 0 28px;
    letter-spacing: 0.1em;
  }
  h1 {
    font-size: clamp(65px, 7.8vw, 114px);
    line-height: 1.16;
    letter-spacing: -0.085em;
    font-weight: 900;
    margin: 0 0 26px;
  }
  h1 > span {
    display: block;
    white-space: nowrap;
  }
  .headline-last {
    padding-left: 0.32em;
  }
  .headline-stop {
    color: var(--accent);
  }
  .poster-description {
    font-size: 15px;
    line-height: 1.9;
    margin: 0 0 25px 7px;
  }
  .poster-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 24px;
    margin-left: 7px;
  }
  .poster-actions .studio-button,
  .commission-title .studio-button {
    background: var(--rfm-accent);
    color: var(--rfm-surface);
    border-color: var(--rfm-accent);
    font-size: 14px;
    padding: 18px 23px;
  }
  .poster-actions .studio-button:hover,
  .commission-title .studio-button:hover {
    background: var(--rfm-accent);
    border-color: var(--rfm-accent);
  }
  .text-link {
    display: inline-flex;
    gap: 25px;
    align-items: center;
    padding-bottom: 6px;
    border-bottom: 1px solid currentColor;
    font-size: 13px;
    font-weight: 700;
  }
  .text-link:hover {
    color: var(--rfm-accent);
  }
  .poster-art {
    position: relative;
    height: min(58svh, 520px);
    margin-left: -45px;
  }
  .free-print-entry {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 25px;
    padding-block: 30px;
    border-bottom: 1px solid #192e5333;
  }
  .free-print-entry span {
    font-size: 11px;
    font-weight: 700;
    color: var(--rfm-accent);
    letter-spacing: 0.12em;
  }
  .free-print-entry p {
    font-size: clamp(17px, 2.2vw, 26px);
    font-weight: 700;
    margin: 8px 0 0;
  }
  .free-print-entry > a {
    flex-shrink: 0;
  }
  @media (max-width: 560px) {
    .free-print-entry {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
      padding-block: 25px;
    }
  }
  .signature-object {
    position: absolute;
    pointer-events: none;
    width: 118%;
    max-width: none;
    height: 100%;
    object-fit: contain;
    top: -6px;
    left: -5%;
    transform: translate3d(var(--object-x, 0px), var(--object-y, 0px), 0) rotate(calc(-10deg + var(--object-turn, 0deg)));
    transition: transform 0.3s ease-out;
  }
  .applications-section {
    padding-block: 24px;
    justify-content: flex-start;
  }
  .editorial-heading {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 2fr;
    align-items: start;
    column-gap: 40px;
    padding-bottom: 20px;
  }
  .section-index {
    font-size: 11px;
    letter-spacing: 0.14em;
    font-weight: 700;
    margin: 10px 0 20px;
  }
  h2 {
    font-size: clamp(37px, 4.4vw, 62px);
    line-height: 1.28;
    letter-spacing: -0.065em;
    font-weight: 900;
    margin: 0;
  }
  .editorial-heading h2 > span {
    color: var(--rfm-accent);
  }
  .editorial-heading > a {
    grid-column: 2;
    justify-self: start;
    margin-top: 25px;
  }
  .application-layout {
    display: grid;
    grid-template-columns: 1.2fr 1fr;
    gap: 8%;
    align-items: start;
  }
  .application-visual {
    position: relative;
    display: block;
    overflow: hidden;
    height: 220px;
    background: var(--rfm-subtle);
  }
  .application-visual .studio-image {
    height: 100%;
    object-fit: contain;
    padding: 20px;
    transition: transform 0.4s;
  }
  .application-visual:hover .studio-image {
    transform: rotate(-4deg) scale(1.03);
  }
  .specimen-number {
    position: absolute;
    top: 12px;
    left: 22px;
    font: 80px/1 Arial, sans-serif;
    letter-spacing: -0.06em;
    color: #192e5325;
  }
  .visual-arrow {
    position: absolute;
    right: 20px;
    bottom: 13px;
    font-size: 30px;
  }
  .story-copy {
    padding-block: 25px 0;
  }
  .story-category {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
  }
  .story-copy h3 {
    font-size: clamp(28px, 3vw, 42px);
    line-height: 1.35;
    letter-spacing: -0.04em;
    margin: 15px 0;
  }
  .story-copy p {
    font-size: 14px;
    line-height: 1.6;
    max-width: 390px;
    margin: 0 0 12px;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .story-links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    font-size: 12px;
    font-weight: 700;
    border-top: 1px solid #acb0a5;
    padding-top: 16px;
  }
  .story-links a:hover {
    color: var(--rfm-accent);
  }
  .story-business {
    padding-top: 28px;
  }
  .story-business .story-copy {
    padding-top: 0;
    padding-bottom: 30px;
  }
  .story-business .application-visual {
    background: #bfcbe2;
    height: 200px;
  }
  .story-business .application-visual .studio-image {
    transform: rotate(-12deg);
    padding: 25px 8px;
  }
  .story-business .application-visual:hover .studio-image {
    transform: rotate(-7deg);
  }
  .personal-story {
    margin-top: auto;
    display: grid;
    grid-template-columns: 1fr 1.1fr 1fr;
    align-items: center;
    gap: 28px;
    border-top: 1px solid var(--rfm-ink);
    border-bottom: 1px solid var(--rfm-ink);
    padding-block: 30px;
    position: relative;
  }
  .personal-title h3 {
    font-size: clamp(28px, 3vw, 40px);
    line-height: 1.35;
    letter-spacing: -0.055em;
    margin: 0;
  }
  .personal-story > .studio-image {
    height: 160px;
    object-fit: contain;
    transform: rotate(7deg);
  }
  .personal-copy p {
    font-size: 14px;
    line-height: 1.9;
    margin-bottom: 25px;
  }
  .personal-rush {
    display: block;
    font-size: 11px;
    margin-top: 20px;
  }
  .material-section {
    background: var(--rfm-interactive);
    color: var(--rfm-paper);
    padding-block: 28px;
    overflow: hidden;
  }
  .material-heading {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 24px;
    align-items: end;
    margin-bottom: 20px;
  }
  .material-heading h2 {
    color: var(--rfm-paper);
  }
  .material-heading .section-index { margin: 0; }
  .material-layout {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 9%;
    align-items: start;
  }
  .material-display {
    position: relative;
    min-height: min(52svh, 420px);
  }
  .material-big-type {
    position: absolute;
    top: 0;
    left: -6px;
    font: 900 clamp(100px, 12vw, 170px) / 1 Arial, sans-serif;
    letter-spacing: -0.06em;
    color: var(--rfm-paper);
  }
  .material-display > .studio-image:not(.material-object) {
    position: absolute;
    top: 32px;
    left: -15px;
    height: min(42svh, 340px);
    width: 105%;
    object-fit: contain;
    transform: rotate(-15deg);
  }
  .material-object {
    position: absolute;
    right: -8px;
    bottom: 12px;
    width: 160px;
    height: 150px;
    object-fit: contain;
    transform: rotate(12deg);
  }
  .material-tabs {
    display: flex;
    border-bottom: 1px solid #778de5;
    gap: 7px;
  }
  .material-tabs button {
    background: none;
    border: 0;
    border-bottom: 3px solid transparent;
    padding: 10px 15px 17px;
    cursor: pointer;
    color: #e0e6ff;
    font-size: 14px;
    position: relative;
  }
  .material-tabs button > span {
    position: absolute;
    font-size: 8px;
    top: -6px;
    right: 8px;
    color: #f4edb5;
  }
  .material-tabs button.active {
    color: var(--rfm-surface);
    border-bottom-color: #f4edb5;
    font-weight: 800;
  }
  .material-details {
    padding-block: 16px 0;
    min-height: 0;
  }
  .material-selected {
    font: 900 35px/1 Arial, sans-serif;
    letter-spacing: -0.03em;
  }
  .material-details h3 {
    font-size: 20px;
    color: var(--rfm-paper);
    margin: 16px 0 12px;
  }
  .material-details p {
    font-size: 13px;
    line-height: 1.9;
    color: #e0e6ff;
  }
  .material-details dl {
    font-size: 12px;
    line-height: 1.85;
  }
  .material-details dl > div {
    display: grid;
    grid-template-columns: 65px 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .material-details dt {
    color: #d4dafa;
  }
  .material-details dd {
    margin: 0;
  }
  .material-heading .text-link:hover {
    color: #f4edb5;
  }
  .commission-section {
    padding-block: 28px;
    display: grid;
    grid-template-columns: minmax(0, 0.75fr) minmax(0, 1.6fr);
    column-gap: 5%;
  }
  .commission-title h2 {
    margin-top: 30px;
  }
  .commission-title h2 > span {
    color: var(--rfm-accent);
  }
  .commission-title > p:not(.section-index) {
    font-size: 14px;
    line-height: 1.9;
    margin: 26px 0;
  }
  .member-link {
    display: block;
    margin-top: 22px;
    font-size: 12px;
  }
  .commission-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-top: 1px solid var(--rfm-ink);
  }
  .commission-steps li {
    display: grid;
    grid-template-columns: 40px 1fr;
    gap: 12px;
    padding: 16px 12px 16px 0;
    border-bottom: 1px solid #aeb5b6;
  }
  .commission-steps .process-image {
    float: right;
    width: 72px;
    height: 64px;
    object-fit: contain;
    margin: 0 0 4px 8px;
  }
  .commission-steps li > span {
    font: 32px/1.4 Arial, sans-serif;
    letter-spacing: -0.05em;
    color: var(--rfm-accent);
  }
  .commission-steps h3 {
    font-size: 20px;
    margin: 0 0 8px;
  }
  .commission-steps .instruction-art {
    --instruction-width: 124px;
    --instruction-height: 88px;
    float: right;
    margin: 0 0 4px 14px;
  }
  .commission-steps p {
    font-size: 13px;
    line-height: 1.85;
    margin: 0;
    color: var(--rfm-muted);
  }
  .model-note {
    grid-column: 1 / -1;
    margin-top: 20px;
    display: flex;
    align-items: center;
    gap: 35px;
    padding: 10px 30px;
    background: var(--rfm-subtle);
  }
  .model-note .studio-image {
    width: 165px;
    height: 145px;
    object-fit: contain;
    transform: rotate(-9deg);
  }
  .model-note h3 {
    font-size: 23px;
    margin: 0 0 8px;
  }
  .model-note p {
    font-size: 13px;
    margin: 0;
  }
  .model-note .text-link {
    margin-left: auto;
    flex-shrink: 0;
  }
  .faq-section {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 8%;
    padding-block: 28px;
  }
  .faq-object {
    width: 160px;
    height: 150px;
    object-fit: contain;
    margin: 16px 0;
    transform: rotate(-8deg);
  }
  .faq-section h2 {
    font-size: 40px;
    margin: 25px 0;
  }
  .faq-list {
    border-top: 1px solid var(--rfm-ink);
  }
  .faq-list details {
    border-bottom: 1px solid #b4b9b5;
  }
  .faq-list summary {
    display: flex;
    gap: 18px;
    align-items: baseline;
    padding-block: 14px;
    font-size: 14px;
    font-weight: 700;
    list-style: none;
    cursor: pointer;
  }
  .faq-list summary::-webkit-details-marker {
    display: none;
  }
  .faq-index {
    font: 11px Arial, sans-serif;
    color: var(--rfm-muted);
  }
  .faq-plus {
    margin-left: auto;
    flex-shrink: 0;
  }
  .faq-list details[open] .faq-plus {
    transform: rotate(45deg);
  }
  .faq-list details p {
    font-size: 13px;
    line-height: 1.9;
    color: var(--rfm-muted);
    margin: 0;
    padding: 0 28px 12px;
  }
  .closing-poster {
    background: #f2663f;
    color: #142344;
    padding-block: 28px 16px;
    overflow: hidden;
  }
  .closing-object {
    width: 180px;
    height: 160px;
    object-fit: contain;
    transform: rotate(-12deg);
  }
  .closing-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .closing-top p {
    font-size: clamp(24px, 3vw, 40px);
    font-weight: 800;
    line-height: 1.4;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .closing-arrow {
    font: 90px/1 Arial, sans-serif;
    padding: 0 15px;
    transition: transform 0.2s;
  }
  .closing-arrow:hover {
    transform: translate(5px, -5px);
  }
  .closing-wordmark {
    display: block;
    font: 900 clamp(75px, 21vw, 305px) / 1.03 Arial, sans-serif;
    letter-spacing: -0.07em;
    margin-left: -0.015em;
    margin-top: 22px;
    white-space: nowrap;
  }
  .closing-baseline {
    border-top: 1px solid var(--rfm-ink);
    display: flex;
    justify-content: space-between;
    padding-top: 16px;
    font-size: 11px;
  }
  @media (max-width: 1100px) {
    .poster-art { height: min(46svh, 420px); }
    .application-visual, .story-business .application-visual { height: 160px; }
    .material-heading { gap: 12px; }
    .material-display { min-height: min(40svh, 320px); }
    .closing-wordmark { font-size: 21.5vw; }
  }
  @media (max-width: 760px) {
    .poster-grid { display: flex; flex-direction: column; }
    .poster-copy { padding-block: 12px 0; }
    h1 { font-size: clamp(48px, 12vw, 80px); margin-bottom: 12px; }
    .poster-art { height: 28svh; width: min(100%, 420px); align-self: center; margin: 0; }
    .signature-object { height: 100%; width: 112%; left: -6%; top: 0; }
    .applications-section, .material-section, .commission-section, .faq-section { padding-block: 12px; }
    .editorial-heading { display: block; padding-bottom: 12px; }
    h2 { font-size: clamp(28px, 7vw, 40px); }
    .application-layout { grid-template-columns: 1fr 1fr; gap: 12px; }
    .application-visual { height: 110px; }
    .story-copy h3 { font-size: 18px; }
    .story-copy p { -webkit-line-clamp: 2; font-size: 12px; }
    .story-business { padding-top: 0; }
    .story-business .application-visual { height: 110px; }
    .personal-story { margin-top: 12px; grid-template-columns: 72px 1fr; padding-block: 12px; }
    .personal-story > .studio-image { height: 72px; }
    .personal-copy { grid-column: 1 / -1; }
    .material-heading { display: flex; flex-wrap: wrap; }
    .material-layout { grid-template-columns: 1fr; gap: 12px; }
    .material-display { min-height: 28svh; }
    .material-display > .studio-image:not(.material-object) { height: 28svh; }
    .material-tabs button { font-size: 12px; padding: 8px 10px; }
    .commission-section { grid-template-columns: 1fr; gap: 12px; }
    .commission-steps { grid-template-columns: 1fr; }
    .model-note { margin-top: 8px; padding: 10px; gap: 12px; }
    .model-note .studio-image { width: 72px; height: 72px; }
    .faq-section { grid-template-columns: 1fr; gap: 12px; }
    .faq-object, .closing-object { width: 96px; height: 88px; }
    .closing-wordmark { font-size: 18vw; margin-block: 8px; }
    .closing-arrow { font-size: 48px; }
  }
  @media (min-width: 761px) and (max-height: 760px) {
    .hero-category { margin-bottom: 16px; }
    h1 { font-size: clamp(56px, 13svh, 100px); margin-bottom: 18px; }
  }
</style>
<style lang="scss">
  html:has(.brand-home) {
    --home-utility: 39px;
    --home-chrome: 141px;
    scroll-snap-type: y mandatory;
    scroll-behavior: smooth;
    scroll-padding-top: var(--home-chrome);
  }
  .brand-home .public-utility {
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .brand-home .public-header {
    position: sticky;
    top: var(--home-utility);
    z-index: 49;
    background: var(--paper);
  }
  .brand-home #public-content > .home-panel,
  .brand-home .public-footer {
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }
  @media (min-width: 761px) and (max-width: 1100px) {
    .brand-home #public-content .commission-section .commission-steps li .process-image {
      float: none;
      display: block;
      width: 88px;
      height: 64px;
      margin: 8px 0 0 auto;
    }
    .brand-home #public-content .commission-steps li > div {
      display: flex;
      flex-direction: column;
    }
    .brand-home #public-content .commission-section .commission-steps li .process-image {
      order: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    html:has(.brand-home) { scroll-behavior: auto; }
  }
</style>
