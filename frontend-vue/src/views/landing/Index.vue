<template>
  <public-shell class="brand-home">
    <section class="landing-poster">
      <div class="studio-wrap hero-edition">
        <span>3DRFM・FDM 製造服務</span>
        <span>一件開始，也可以。</span>
      </div>
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
          <p class="poster-description">
            你的模型，值得離開螢幕。
            <br />
            從單件原型到小量製作，讓設計有個實體。
          </p>
          <div class="poster-actions">
            <router-link to="/quote" class="studio-button">
              上傳模型・自動估價
              <span aria-hidden="true">↗</span>
            </router-link>
            <router-link :to="{ path: '/', hash: '#services' }" class="text-link">
              先看看能做什麼
              <span aria-hidden="true">↓</span>
            </router-link>
          </div>
        </div>
        <hero-layer-field class="poster-art">
          <span class="hero-object-caption">逐層堆疊，立體成型。</span>
          <studio-image kind="signature" priority class="signature-object" />
          <span class="hero-sample-label">
            <span>FDM 成型概念</span>
            <small>品牌示意物件</small>
          </span>
        </hero-layer-field>
      </div>
      <div class="studio-wrap poster-footnote">
        <span>塑膠線材 FDM 列印</span>
        <span>STL ／ 3MF ／ STEP</span>
        <router-link to="/guides/file-prep">上傳前，先確認檔案 ↗</router-link>
      </div>
    </section>

    <aside class="studio-wrap free-print-entry" aria-label="免費列印站點入口">
      <div>
        <span>校園免費列印</span>
        <p>第一站，清華大學・水木書苑。</p>
      </div>
      <router-link to="/free-print" class="text-link">選擇免費列印站點 ↗</router-link>
    </aside>

    <section id="services" class="studio-wrap applications-section">
      <header class="editorial-heading">
        <p class="section-index">01 ／ 製作的可能</p>
        <h2>
          研究的、工作的、
          <br />
          <span>你自己的。</span>
        </h2>
        <router-link to="/services" class="text-link">所有 FDM 製作服務 ↗</router-link>
      </header>
      <div class="application-layout">
        <article class="application-story story-school">
          <router-link to="/for/education" class="application-visual" aria-label="探索學校與實驗室製作">
            <span class="specimen-number" aria-hidden="true">01</span>
            <studio-image kind="parts" />
            <span class="specimen-label">結構探索 ／ 格構示意</span>
            <span class="visual-arrow" aria-hidden="true">↗</span>
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
              <router-link to="/services/research-lab">研究模型 ↗</router-link>
              <router-link to="/services/student-project">專題製作 ↗</router-link>
              <router-link to="/services/campus-gifts">文創紀念品 ↗</router-link>
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
              <router-link to="/services/exhibition">展示模型 ↗</router-link>
              <router-link to="/services/industrial-parts">工業件 ↗</router-link>
              <router-link to="/services/small-batch">小批量 ↗</router-link>
            </div>
          </div>
          <router-link to="/for/business" class="application-visual" aria-label="探索企業製作">
            <span class="specimen-number" aria-hidden="true">02</span>
            <studio-image kind="sketch" />
            <span class="specimen-label">從外觀，確認到組裝</span>
            <span class="visual-arrow" aria-hidden="true">↗</span>
          </router-link>
        </article>
      </div>
      <article class="personal-story">
        <div class="personal-title">
          <span class="section-index">03 ／ 個人・創作者</span>
          <h3>
            剛好，
            <br />
            你也想做一個。
          </h3>
        </div>
        <studio-image kind="everyday" decorative />
        <div class="personal-copy">
          <p>一個桌上小物、一件模型配件，或網路找到的設計檔。單件也能製作，先告訴我們要怎麼用。</p>
          <router-link to="/for/personal" class="text-link">個人代印專區 ↗</router-link>
          <router-link to="/services/rush-print" class="personal-rush">趕時間？先確認急件可行性 ↗</router-link>
        </div>
      </article>
    </section>

    <section class="material-section" id="materials">
      <div class="studio-wrap material-heading">
        <p class="section-index">02 ／ 材料研究室</p>
        <h2>
          個性不同。
          <br />
          用途也是。
        </h2>
        <p>
          材料不是配色選單。
          <br />
          受力、溫度、組裝方式，才是選擇的起點。
        </p>
      </div>
      <div class="studio-wrap material-layout">
        <div class="material-display">
          <span class="material-big-type" aria-hidden="true">PETG</span>
          <studio-image kind="printer" decorative />
          <span class="material-recommendation">
            最推薦的
            <br />
            <strong>選材起點 ↗</strong>
          </span>
          <span class="material-caption">線材示意 ／ 一般功能件優先討論 PETG</span>
        </div>
        <div class="material-copy">
          <div class="material-tabs" role="group" aria-label="選擇材料">
            <button
              v-for="(material, index) in materials"
              :key="material.name"
              :aria-pressed="materialIndex === index"
              :class="{ active: materialIndex === index }"
              @click="materialIndex = index"
            >
              {{ material.name }}
              <span v-if="material.name === 'PETG'" aria-hidden="true">推薦</span>
            </button>
          </div>
          <div class="material-details" aria-live="polite" aria-atomic="true">
            <span class="material-selected">{{ selectedMaterial.name }}</span>
            <h3>{{ selectedMaterial.title }}</h3>
            <p>{{ selectedMaterial.description }}</p>
            <dl>
              <div>
                <dt>適合製作</dt>
                <dd>{{ selectedMaterial.uses }}</dd>
              </div>
              <div>
                <dt>先確認</dt>
                <dd>{{ selectedMaterial.caution }}</dd>
              </div>
            </dl>
          </div>
          <router-link to="/materials" class="text-link">比較六種 FDM 材料 ↗</router-link>
          <div class="material-sample">
            <studio-image kind="batch" decorative />
            <p>
              形狀與列印方向，
              <br />
              也是材料選擇的一部分。
              <small>功能原型示意・實際規格依案件確認</small>
            </p>
          </div>
        </div>
      </div>
    </section>

    <section class="studio-wrap commission-section">
      <div class="commission-title">
        <p class="section-index">03 ／ 開始製作</p>
        <h2>
          有檔案，
          <br />
          <span>就差這一步。</span>
        </h2>
        <p>
          不用另外填一張詢價表。
          <br />
          直接使用 3DRFM 自動估價，接續你的製作需求。
        </p>
        <router-link to="/quote" class="studio-button">
          開始自動估價
          <span aria-hidden="true">↗</span>
        </router-link>
        <router-link to="/portal/login" class="member-link">已有案件？登入會員中心 →</router-link>
      </div>
      <ol class="commission-steps">
        <li>
          <span>01</span>
          <div>
            <h3>上傳模型</h3>
            <p>提供檔案、實際尺寸與用途；沒有模型可選建模協助。</p>
          </div>
        </li>
        <li>
          <span>02</span>
          <div>
            <h3>登入，帶入資料</h3>
            <p>流程第三步登入或註冊，讓需求與個人案件連結。</p>
          </div>
        </li>
        <li>
          <span>03</span>
          <div>
            <h3>設定條件，取得初估</h3>
            <p>選擇材料、品質與數量。正式報價及交期仍需個別確認。</p>
          </div>
        </li>
        <li>
          <span>04</span>
          <div>
            <h3>確認製作，追蹤交付</h3>
            <p>確認報價與付款安排後，透過案件查看製作進度。</p>
          </div>
        </li>
      </ol>
      <aside class="model-note">
        <studio-image kind="keepsake" decorative />
        <div>
          <h3>還停在草圖？</h3>
          <p>帶著尺寸、照片與用途，先確認建模範圍。</p>
        </div>
        <router-link to="/quote?mode=agent&amp;model=no" class="text-link">我需要建模協助 ↗</router-link>
      </aside>
    </section>

    <section id="faq" class="faq-section studio-wrap">
      <div>
        <p class="section-index">04 ／ 製作前須知</p>
        <h2>
          先問清楚，
          <br />
          再開始。
        </h2>
        <router-link to="/faq" class="text-link">查看所有問題 ↗</router-link>
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
    <section class="closing-poster">
      <div class="studio-wrap">
        <div class="closing-top">
          <p>
            螢幕裡的下一個設計，
            <br />
            我們手上見。
          </p>
          <router-link to="/quote" aria-label="開始自動估價" class="closing-arrow">↗</router-link>
        </div>
        <span class="closing-wordmark" aria-hidden="true">3DRFM</span>
        <div class="closing-baseline">
          <span>FDM 3D 列印製造服務</span>
          <router-link to="/contact">與我們聯絡 ↗</router-link>
        </div>
      </div>
    </section>
  </public-shell>
</template>
<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import StudioImage from '@/components/public/StudioImage.vue'
  import HeroLayerField from '@/components/public/HeroLayerField.vue'
  export default {
    name: 'Landing',
    components: { PublicShell, StudioImage, HeroLayerField },
    data() {
      return {
        materialIndex: 1,
        materials: [
          {
            name: 'PLA',
            art: 'parts',
            background: '#e7e8c8',
            note: '讓造型先說話',
            title: '讓第一個想法，輕鬆成型。',
            description: '適合外觀模型、展示作品與桌上小物，是開始嘗試 3D 列印的好選擇。',
            uses: '造型模型、展示件、教學作品',
            caution: '避免高溫環境；受力零件需另外評估。',
          },
          {
            name: 'PETG',
            art: 'spool',
            background: '#e9d3c1',
            note: '日常裡的實用派',
            title: '多一點韌性，多一些用途。',
            description: '兼具實用性與韌性，適合製作日常使用的功能零件與收納配件。',
            uses: '收納配件、機構外殼、實用零件',
            caution: '請提供受力方式、組裝公差與使用溫度。',
          },
          {
            name: 'ASA',
            art: 'parts',
            background: '#c8dcd7',
            note: '為戶外用途打算',
            title: '把使用場景，延伸到戶外。',
            description: '有耐候需求時可考慮 ASA，實際製作方式仍需依尺寸與結構確認。',
            uses: '戶外外殼、設備配件、耐候零件',
            caution: '大尺寸與精密配合件，需先評估收縮與變形。',
          },
          {
            name: 'TPU',
            art: 'spool',
            background: '#d9dbeb',
            note: '柔軟，也是一種力量',
            title: '有些好設計，需要一點彈性。',
            description: '柔性材料適合需要彎折或緩衝的物件，軟硬感受會隨結構與設定改變。',
            uses: '防護套、緩衝墊、柔性配件',
            caution: '請提供軟硬需求；薄壁與細節需先確認。',
          },
        ],
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
        return this.materials[this.materialIndex]
      },
    },
  }
</script>
<style lang="scss" scoped>
  .brand-home {
    --ink: var(--rfm-ink);
    --paper: var(--rfm-paper);
    --blue: var(--rfm-interactive);
    --lime: var(--rfm-subtle);
    --accent: var(--rfm-accent);
  }
  .landing-poster {
    overflow: hidden;
  }
  .hero-edition {
    border-top: 1px solid var(--rfm-ink);
    display: flex;
    justify-content: space-between;
    padding-top: 17px;
    font-size: 11px;
    letter-spacing: 0.1em;
  }
  .poster-grid {
    display: grid;
    grid-template-columns: 1.05fr 1fr;
    align-items: center;
    position: relative;
    min-height: 660px;
  }
  .poster-copy {
    position: relative;
    z-index: 2;
    padding-block: 42px;
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
    height: 650px;
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
    height: 650px;
    object-fit: contain;
    top: -6px;
    left: -5%;
    transform: translate3d(var(--object-x, 0px), var(--object-y, 0px), 0) rotate(calc(-10deg + var(--object-turn, 0deg)));
    transition: transform 0.3s ease-out;
  }
  .hero-object-caption {
    position: absolute;
    z-index: 1;
    right: -12px;
    top: 62px;
    writing-mode: vertical-rl;
    font-size: 11px;
    letter-spacing: 0.22em;
  }
  .hero-sample-label {
    position: absolute;
    bottom: 48px;
    right: 20px;
    border-left: 1px solid;
    padding-left: 12px;
    font-size: 11px;
    display: grid;
    gap: 4px;
  }
  .hero-sample-label small {
    font-size: 9px;
    color: var(--rfm-muted);
  }
  .poster-footnote {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    border-top: 1px solid var(--rfm-ink);
    border-bottom: 1px solid var(--rfm-ink);
    padding-block: 18px;
    font-size: 11px;
    letter-spacing: 0.06em;
  }
  .applications-section {
    padding-block: 90px 100px;
  }
  .editorial-heading {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 2fr;
    align-items: start;
    column-gap: 40px;
    padding-bottom: 55px;
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
    height: 400px;
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
  .specimen-label {
    position: absolute;
    bottom: 17px;
    left: 22px;
    font-size: 10px;
    letter-spacing: 0.12em;
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
    line-height: 1.95;
    max-width: 390px;
    margin: 0 0 22px;
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
    padding-top: 100px;
  }
  .story-business .story-copy {
    padding-top: 0;
    padding-bottom: 30px;
  }
  .story-business .application-visual {
    background: #bfcbe2;
    height: 360px;
  }
  .story-business .application-visual .studio-image {
    transform: rotate(-12deg);
    padding: 25px 8px;
  }
  .story-business .application-visual:hover .studio-image {
    transform: rotate(-7deg);
  }
  .personal-story {
    margin-top: 95px;
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
    height: 295px;
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
    padding-block: 65px 70px;
    overflow: hidden;
  }
  .material-heading {
    display: grid;
    grid-template-columns: 1fr 1.4fr 1fr;
    gap: 40px;
    align-items: start;
    margin-bottom: 45px;
  }
  .material-heading h2 {
    color: var(--rfm-paper);
  }
  .material-heading > p:last-child {
    font-size: 13px;
    line-height: 1.9;
    margin-top: 20px;
  }
  .material-layout {
    display: grid;
    grid-template-columns: 1.1fr 1fr;
    gap: 9%;
    align-items: start;
  }
  .material-display {
    position: relative;
    min-height: 535px;
  }
  .material-big-type {
    position: absolute;
    top: 0;
    left: -6px;
    font: 900 clamp(100px, 12vw, 170px) / 1 Arial, sans-serif;
    letter-spacing: -0.06em;
    color: var(--rfm-paper);
  }
  .material-display > .studio-image {
    position: absolute;
    top: 32px;
    left: -15px;
    height: 465px;
    width: 105%;
    object-fit: contain;
    transform: rotate(-15deg);
  }
  .material-recommendation {
    position: absolute;
    right: -15px;
    top: 270px;
    padding: 14px 18px;
    background: #f4edb5;
    color: var(--rfm-ink);
    font-size: 13px;
    line-height: 1.6;
    transform: rotate(8deg);
  }
  .material-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    font-size: 10px;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #8b9ae4;
    padding-bottom: 10px;
    width: 100%;
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
    padding-block: 20px 15px;
    min-height: 295px;
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
  .material-copy > .text-link:hover {
    color: #f4edb5;
  }
  .material-sample {
    display: flex;
    gap: 15px;
    align-items: center;
    margin-top: 22px;
  }
  .material-sample .studio-image {
    width: 115px;
    height: 125px;
    object-fit: contain;
    transform: rotate(12deg);
  }
  .material-sample p {
    font-size: 12px;
    line-height: 1.8;
  }
  .material-sample small {
    display: block;
    font-size: 9px;
    margin-top: 7px;
    color: #d1dafb;
  }
  .commission-section {
    padding-block: 100px 55px;
    display: grid;
    grid-template-columns: 1fr 1.2fr;
    column-gap: 10%;
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
    border-top: 1px solid var(--rfm-ink);
  }
  .commission-steps li {
    display: grid;
    grid-template-columns: 55px 1fr;
    gap: 18px;
    padding-block: 23px;
    border-bottom: 1px solid #aeb5b6;
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
  .commission-steps p {
    font-size: 13px;
    line-height: 1.85;
    margin: 0;
    color: var(--rfm-muted);
  }
  .model-note {
    grid-column: 1 / -1;
    margin-top: 65px;
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
    padding-block: 50px 95px;
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
    padding-block: 22px;
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
    padding: 0 28px 24px;
  }
  .closing-poster {
    background: #f2663f;
    color: #142344;
    padding-block: 42px 20px;
    overflow: hidden;
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
    .poster-grid {
      min-height: 565px;
    }
    .poster-art {
      height: 550px;
    }
    .signature-object {
      height: 550px;
    }
    .application-visual {
      height: 330px;
    }
    .story-business .application-visual {
      height: 300px;
    }
    .material-heading {
      grid-template-columns: 0.8fr 1.2fr 1fr;
      gap: 20px;
    }
    .material-layout {
      gap: 5%;
    }
    .material-display {
      min-height: 485px;
    }
    .material-display > .studio-image {
      height: 425px;
    }
    .commission-section {
      column-gap: 6%;
    }
    .closing-wordmark {
      font-size: 21.5vw;
    }
  }
  @media (max-width: 760px) {
    .hero-edition {
      font-size: 9px;
      padding-top: 13px;
      letter-spacing: 0.04em;
    }
    .poster-grid {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      min-height: 0;
    }
    .poster-copy {
      padding-block: 25px 0;
    }
    .hero-category {
      font-size: 10px;
      margin-bottom: 17px;
    }
    h1 {
      font-size: clamp(60px, 14.8vw, 104px);
      margin-bottom: 17px;
      line-height: 1.12;
    }
    .headline-last {
      padding-left: 0.33em;
    }
    .poster-description {
      font-size: 13px;
      margin-left: 0;
    }
    .poster-actions {
      gap: 18px;
      margin-left: 0;
    }
    .poster-actions .studio-button {
      font-size: 12px;
      padding: 14px 17px;
      gap: 20px;
    }
    .poster-actions .text-link {
      font-size: 11px;
      gap: 8px;
    }
    .poster-art {
      height: 330px;
      width: min(100%, 480px);
      align-self: center;
      margin: 5px 0 0;
    }
    .signature-object {
      height: 350px;
      width: 112%;
      left: -6%;
      top: -15px;
    }
    .hero-object-caption {
      right: 0;
      top: 60px;
      font-size: 9px;
    }
    .hero-sample-label {
      bottom: 20px;
      right: 0;
      font-size: 9px;
    }
    .hero-sample-label small {
      font-size: 8px;
    }
    .poster-footnote {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      font-size: 9px;
      padding-block: 14px;
    }
    .poster-footnote a {
      grid-column: 1 / -1;
    }
    .applications-section {
      padding-block: 50px;
    }
    .editorial-heading {
      display: block;
      padding-bottom: 35px;
    }
    .section-index {
      font-size: 10px;
      margin-bottom: 22px;
    }
    h2 {
      font-size: clamp(34px, 8vw, 48px);
    }
    .editorial-heading > a {
      margin-top: 23px;
    }
    .application-layout {
      grid-template-columns: 1fr;
      gap: 45px;
    }
    .application-visual {
      height: 310px;
    }
    .story-copy h3 {
      font-size: 32px;
    }
    .story-copy p {
      font-size: 13px;
    }
    .story-links {
      font-size: 11px;
      gap: 16px;
    }
    .story-business {
      padding-top: 0;
      display: flex;
      flex-direction: column;
    }
    .story-business .application-visual {
      order: -1;
      height: 290px;
    }
    .story-business .story-copy {
      padding-top: 25px;
      padding-bottom: 0;
    }
    .personal-story {
      margin-top: 45px;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      padding-block: 25px;
    }
    .personal-title h3 {
      font-size: 28px;
    }
    .personal-title .section-index {
      font-size: 9px;
    }
    .personal-story > .studio-image {
      height: 200px;
    }
    .personal-copy {
      grid-column: 1 / -1;
    }
    .personal-copy p {
      font-size: 13px;
      margin-top: 0;
    }
    .personal-rush {
      font-size: 10px;
    }
    .material-section {
      padding-block: 45px;
    }
    .material-heading {
      display: block;
      margin-bottom: 20px;
    }
    .material-heading > p:last-child {
      margin-top: 22px;
      font-size: 12px;
    }
    .material-layout {
      grid-template-columns: 1fr;
      gap: 35px;
    }
    .material-display {
      min-height: 390px;
      max-width: 420px;
      width: 100%;
      margin: auto;
    }
    .material-big-type {
      font-size: clamp(105px, 28vw, 140px);
      top: 7px;
    }
    .material-display > .studio-image {
      height: 335px;
      top: 28px;
      left: -10px;
    }
    .material-recommendation {
      top: 195px;
      right: 3px;
      font-size: 11px;
      padding: 10px 13px;
    }
    .material-caption {
      font-size: 8px;
    }
    .material-tabs button {
      font-size: 12px;
      padding: 13px 14px;
    }
    .material-details {
      min-height: 0;
    }
    .material-details h3 {
      font-size: 19px;
    }
    .material-sample {
      margin-top: 20px;
    }
    .material-sample .studio-image {
      width: 100px;
      height: 110px;
    }
    .material-sample p {
      font-size: 11px;
    }
    .material-sample small {
      font-size: 8px;
    }
    .commission-section {
      padding-block: 50px 25px;
      grid-template-columns: 1fr;
      gap: 40px;
    }
    .commission-title h2 {
      margin-top: 20px;
    }
    .commission-title > p:not(.section-index) {
      font-size: 13px;
    }
    .commission-steps li {
      grid-template-columns: 40px 1fr;
      gap: 12px;
      padding-block: 20px;
    }
    .commission-steps li > span {
      font-size: 26px;
    }
    .commission-steps h3 {
      font-size: 18px;
    }
    .commission-steps p {
      font-size: 12px;
    }
    .model-note {
      margin-top: 0;
      display: grid;
      grid-template-columns: 95px 1fr;
      gap: 5px 14px;
      padding: 18px;
    }
    .model-note .studio-image {
      width: 95px;
      height: 110px;
    }
    .model-note h3 {
      font-size: 21px;
    }
    .model-note p {
      font-size: 11px;
      line-height: 1.8;
    }
    .model-note .text-link {
      grid-column: 1 / -1;
      margin: 5px 0;
      justify-self: start;
      font-size: 12px;
    }
    .faq-section {
      grid-template-columns: 1fr;
      gap: 28px;
      padding-block: 30px 50px;
    }
    .faq-section h2 {
      font-size: 34px;
    }
    .faq-list summary {
      font-size: 13px;
      gap: 12px;
    }
    .closing-poster {
      padding-block: 30px 18px;
    }
    .closing-top p {
      font-size: 25px;
    }
    .closing-arrow {
      font-size: 65px;
      padding-right: 0;
    }
    .closing-wordmark {
      font-size: 21vw;
      margin-block: 20px 10px;
    }
    .closing-baseline {
      font-size: 9px;
    }
  }
</style>
