<template>
  <public-shell>
    <section class="landing-poster">
      <div class="studio-wrap poster-grid">
        <div class="poster-copy">
          <p class="studio-kicker">3DRFM・FDM 3D 列印製造服務</p>
          <h1>
            從設計原型，
            <br />
            到小量製造
            <span>。</span>
          </h1>
          <p class="poster-description">
            為研究、產品開發與日常創作，
            <br />
            把數位模型轉化為可測試、可使用的實體。
          </p>
          <div class="poster-actions">
            <router-link to="/quote" class="studio-button">
              開始自動估價
              <span aria-hidden="true">↗</span>
            </router-link>
            <router-link :to="{ path: '/', hash: '#services' }" class="text-link">
              先看看能做什麼
              <span aria-hidden="true">↓</span>
            </router-link>
          </div>
          <p class="poster-footnote">單件代印 ／ 功能原型 ／ 小批量製作</p>
        </div>
        <div class="poster-art">
          <span class="poster-art-type" aria-hidden="true">FDM</span>
          <studio-image kind="engineering" priority class="hero-object hero-object-main" />
          <studio-image kind="sketch" decorative class="hero-object hero-object-front" />
          <studio-image kind="batch" decorative class="hero-object hero-object-back" />
          <div class="object-label">
            <span>設計驗證 → 實體製作</span>
            <small>FDM 應用示意物件</small>
          </div>
        </div>
      </div>
      <div class="studio-wrap capability-strip">
        <div>
          <strong>01</strong>
          <span>線上自動初估</span>
        </div>
        <div>
          <strong>02</strong>
          <span>依用途確認材料</span>
        </div>
        <div>
          <strong>03</strong>
          <span>登入追蹤案件</span>
        </div>
        <router-link to="/process">了解訂製流程 ↗</router-link>
      </div>
    </section>
    <audience-links />
    <section id="services" class="studio-wrap studio-section">
      <div class="section-heading">
        <div>
          <p class="studio-kicker">製作服務</p>
          <h2>
            每個製作階段，
            <br />
            都有清楚的下一步。
          </h2>
        </div>
        <p>
          有模型，直接上傳估價。
          <br />
          還沒有模型，先整理用途、草圖與尺寸。
        </p>
      </div>
      <div class="service-grid">
        <router-link v-for="service in services" :key="service.number" :to="service.to" class="service-entry">
          <div class="service-art">
            <span class="service-number">{{ service.number }}</span>
            <studio-image :kind="service.kind" decorative />
            <span class="service-chip">{{ service.tag }}</span>
          </div>
          <div class="service-title">
            <h3>{{ service.title }}</h3>
            <span aria-hidden="true">↗</span>
          </div>
          <p>{{ service.description }}</p>
        </router-link>
      </div>
    </section>
    <section class="platform-section">
      <div class="studio-wrap platform-layout">
        <div>
          <p class="studio-kicker">官網了解服務・會員中心管理製作</p>
          <h2>
            需求到進度，
            <br />
            在同一個地方接續。
          </h2>
          <p>先透過自動估價整理模型、材料與數量，第三步登入或註冊帶入個人資料。建立案件後，再進會員中心查看自己的案件。</p>
          <router-link to="/portal/login" class="studio-button light">登入會員中心 ↗</router-link>
          <router-link to="/process" class="platform-link">查看完整訂製流程 →</router-link>
        </div>
        <ol class="platform-flow">
          <li>
            <span>01</span>
            <div>
              <h3>上傳模型與設定規格</h3>
              <p>依材料、品質與數量取得切片前初估。</p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <h3>登入接續案件</h3>
              <p>帶入聯絡資料，整理需求並確認送出。</p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <h3>查看報價與製作進度</h3>
              <p>從會員中心進入案件，依確認結果安排製作。</p>
            </div>
          </li>
        </ol>
      </div>
    </section>
    <section id="materials" class="studio-wrap studio-section material-layout">
      <div class="material-display">
        <span class="material-big-type" aria-hidden="true">PETG</span>
        <studio-image kind="printer" decorative />
        <div class="material-caption">
          <strong>我們最推薦的選材起點</strong>
          <span>PETG・兼顧韌性與日常實用性</span>
        </div>
      </div>
      <div class="material-copy">
        <p class="studio-kicker">材料與製程</p>
        <h2>
          先確認使用條件，
          <br />
          再選合適的材料。
        </h2>
        <p>一般功能件與日常用品，優先從 PETG 討論。特殊耐熱、戶外或柔性需求，仍需個別確認。</p>
        <div class="material-tabs" role="group" aria-label="選擇材料">
          <button
            v-for="(material, index) in materials"
            :key="material.name"
            :aria-pressed="materialIndex === index"
            :class="{ active: materialIndex === index }"
            @click="materialIndex = index"
          >
            {{ material.name }}
          </button>
        </div>
        <div class="material-details" aria-live="polite" aria-atomic="true">
          <h3>{{ selectedMaterial.title }}</h3>
          <p>{{ selectedMaterial.description }}</p>
          <dl>
            <div>
              <dt>適合製作</dt>
              <dd>{{ selectedMaterial.uses }}</dd>
            </div>
            <div>
              <dt>注意事項</dt>
              <dd>{{ selectedMaterial.caution }}</dd>
            </div>
          </dl>
        </div>
        <router-link to="/materials" class="text-link">比較六種 FDM 材料 ↗</router-link>
      </div>
    </section>
    <section id="process" class="process-section">
      <div class="studio-wrap studio-section">
        <div class="section-heading">
          <div>
            <p class="studio-kicker">訂製流程</p>
            <h2>
              從第一份檔案，
              <br />
              到下一件成品。
            </h2>
          </div>
          <router-link to="/process" class="text-link">了解各階段須知 ↗</router-link>
        </div>
        <ol class="process-track">
          <li v-for="(item, i) in steps" :key="item.title">
            <span class="step-index">0{{ i + 1 }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.description }}</p>
          </li>
        </ol>
        <p class="process-note">線上初估供規劃參考；正式價格、材料供應與交期，依案件審查確認後安排。</p>
      </div>
    </section>
    <section id="faq" class="studio-wrap studio-section faq-section">
      <div>
        <p class="studio-kicker">常見問題</p>
        <h2>
          製作前，
          <br />
          你可能想了解。
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
    <section class="start-banner">
      <div class="studio-wrap start-inner">
        <div>
          <p class="studio-kicker">開始你的製作計畫</p>
          <h2>下一個設計，交給 3DRFM。</h2>
          <p>已有模型就開始估價，尚未建模也能提交需求。</p>
        </div>
        <router-link to="/quote" class="studio-button">開始自動估價 ↗</router-link>
      </div>
    </section>
  </public-shell>
</template>
<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import StudioImage from '@/components/public/StudioImage.vue'
  import AudienceLinks from '@/components/public/AudienceLinks.vue'
  export default {
    name: 'Landing',
    components: { PublicShell, StudioImage, AudienceLinks },
    data() {
      return {
        materialIndex: 1,
        services: [
          {
            number: '01',
            kind: 'parts',
            tag: '已經有模型',
            title: '模型代印與原型製作',
            description: '上傳 STL、3MF 或 STEP，選擇材料與數量，從你的第一件作品開始。',
            to: '/quote',
          },
          {
            number: '02',
            kind: 'keepsake',
            tag: '還在想像中',
            title: '建模需求協作',
            description: '帶著草圖、尺寸或使用需求，由專員協助確認建模與製作方式。',
            to: '/quote?mode=agent&model=no',
          },
          {
            number: '03',
            kind: 'everyday',
            tag: '不只做一件',
            title: '小批量製造',
            description: '從原型測試到小量製造，一起確認數量、材料與交付時間。',
            to: '/services/small-batch',
          },
        ],
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
        steps: [
          { title: '分享你的需求', description: '上傳模型，或描述用途、尺寸與想完成的樣子。' },
          { title: '確認製作細節', description: '取得初估，再由專員確認材料、切片結果與正式報價。' },
          { title: '開始列印製作', description: '確認報價與付款安排後，依案件約定進入製作。' },
          { title: '把成品交給你', description: '完成後依確認的交付方式出貨，透過案件連結追蹤進度。' },
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
  .landing-poster {
    background: #edf2ee;
    overflow: hidden;
  }
  .poster-grid {
    display: grid;
    grid-template-columns: 1.08fr 1fr;
    align-items: center;
    min-height: 600px;
    gap: 20px;
    padding-block: 64px 42px;
  }
  .poster-copy {
    position: relative;
    z-index: 1;
  }
  .poster-copy .studio-kicker {
    margin: 0 0 28px;
  }
  h1 {
    font-size: clamp(42px, 4.6vw, 68px);
    font-weight: 800;
    line-height: 1.35;
    letter-spacing: -0.055em;
    margin: 0 0 27px;
  }
  h1 > span {
    color: #1091ad;
  }
  .poster-description {
    font-size: 17px;
    line-height: 1.95;
    color: #546a70;
  }
  .poster-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 28px;
    margin-top: 32px;
  }
  .text-link {
    font-size: 13px;
    font-weight: 700;
    display: inline-block;
    padding-block: 7px;
    border-bottom: 1px solid #91a6a8;
  }
  .poster-footnote {
    font-size: 11px;
    letter-spacing: 0.1em;
    color: #526c73;
    margin-top: 38px;
  }
  .poster-art {
    position: relative;
    min-height: 475px;
  }
  .poster-art-type {
    position: absolute;
    right: -10px;
    top: -32px;
    font: 900 clamp(100px, 15vw, 215px) / 1 Arial, sans-serif;
    letter-spacing: -0.07em;
    color: #d6e2dc;
  }
  .hero-object {
    position: absolute;
    object-fit: contain;
    filter: drop-shadow(0 20px 13px #29455018);
  }
  .hero-object-main {
    width: 65%;
    height: 375px;
    right: -1%;
    top: 12px;
    transform: rotate(4deg);
  }
  .hero-object-front {
    width: 53%;
    height: 220px;
    left: -4%;
    bottom: 15px;
    transform: rotate(-9deg);
  }
  .hero-object-back {
    width: 35%;
    height: 190px;
    left: 1%;
    top: 3px;
    transform: rotate(-15deg);
  }
  .object-label {
    position: absolute;
    bottom: 6px;
    right: 0;
    display: grid;
    gap: 5px;
    border-left: 2px solid #1694aa;
    padding-left: 14px;
    font-size: 11px;
  }
  .object-label small {
    font-size: 10px;
    color: #687b7f;
  }
  .capability-strip {
    border-top: 1px solid #bdceca;
    display: grid;
    grid-template-columns: repeat(3, 1fr) auto;
    padding-block: 23px;
    gap: 20px;
  }
  .capability-strip > div {
    display: flex;
    gap: 18px;
    align-items: center;
    font-size: 12px;
  }
  .capability-strip strong {
    color: #718d92;
    font: 12px Arial, sans-serif;
  }
  .capability-strip > a {
    font-size: 12px;
    font-weight: 700;
  }
  .studio-section {
    padding-block: 90px;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 32px;
    margin-bottom: 38px;
  }
  h2 {
    font-size: clamp(28px, 3vw, 40px);
    line-height: 1.5;
    letter-spacing: -0.04em;
    margin: 16px 0;
  }
  .section-heading p:not(.studio-kicker) {
    color: #5d7278;
    font-size: 14px;
    line-height: 1.9;
  }
  .service-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 30px;
  }
  .service-art {
    position: relative;
    height: 255px;
    background: #eef1ec;
    overflow: hidden;
  }
  .service-entry:nth-child(2) .service-art {
    background: #eae7f0;
  }
  .service-entry:nth-child(3) .service-art {
    background: #e3eeeb;
  }
  .service-art .studio-image {
    height: 240px;
    width: 83%;
    margin: auto;
    object-fit: contain;
    transition: transform 0.25s;
  }
  .service-entry:hover .studio-image {
    transform: translateY(-5px);
  }
  .service-number {
    position: absolute;
    top: 18px;
    left: 20px;
    font-size: 12px;
  }
  .service-chip {
    position: absolute;
    bottom: 17px;
    left: 20px;
    font-size: 11px;
    background: #ffffffdc;
    padding: 4px 9px;
  }
  .service-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 18px;
  }
  .service-title h3 {
    font-size: 20px;
    margin: 0;
  }
  .service-entry > p {
    font-size: 13px;
    line-height: 1.85;
    color: #5b7076;
  }
  .platform-section {
    background: #17343d;
    color: #eef7f5;
    padding-block: 70px;
  }
  .platform-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 90px;
    align-items: center;
  }
  .platform-layout h2 {
    color: white;
  }
  .platform-layout > div > p:not(.studio-kicker) {
    max-width: 470px;
    color: #bdcfd1;
    font-size: 14px;
    line-height: 1.9;
    margin-bottom: 28px;
  }
  .platform-link {
    display: block;
    font-size: 12px;
    margin-top: 20px;
    color: #c5d8d8;
  }
  .platform-flow {
    list-style: none;
    margin: 0;
    padding: 0;
    border-top: 1px solid #48636b;
  }
  .platform-flow li {
    display: flex;
    gap: 24px;
    padding: 26px 0;
    border-bottom: 1px solid #48636b;
  }
  .platform-flow li > span {
    color: #dff08f;
    font-size: 12px;
    padding-top: 6px;
  }
  .platform-flow h3 {
    color: white;
    font-size: 19px;
    margin: 0 0 8px;
  }
  .platform-flow p {
    margin: 0;
    font-size: 13px;
    color: #bdcfd1;
  }
  .material-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 80px;
    align-items: center;
  }
  .material-display {
    position: relative;
    background: #e8eddf;
    min-height: 510px;
    display: flex;
    flex-direction: column;
    justify-content: end;
    overflow: hidden;
  }
  .material-big-type {
    position: absolute;
    top: 27px;
    left: 25px;
    font: 900 clamp(65px, 8vw, 113px) / 1 Arial, sans-serif;
    letter-spacing: -0.05em;
    color: #cad7be;
  }
  .material-display .studio-image {
    position: relative;
    height: 370px;
    width: 90%;
    margin: 40px auto 0;
    object-fit: contain;
  }
  .material-caption {
    display: grid;
    gap: 8px;
    padding: 0 30px 30px;
    font-size: 13px;
  }
  .material-caption span {
    font-size: 11px;
    color: #5f7366;
  }
  .material-copy > p:not(.studio-kicker) {
    font-size: 14px;
    color: #607277;
    line-height: 1.9;
  }
  .material-tabs {
    display: flex;
    gap: 6px;
    margin-top: 25px;
    border-bottom: 1px solid #c7d3ca;
  }
  .material-tabs button {
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    border: 0;
    padding: 13px 16px;
    font-size: 13px;
  }
  .material-tabs button.active {
    border-bottom: 3px solid #177c91;
    font-weight: 800;
  }
  .material-details {
    min-height: 245px;
    padding-block: 18px;
  }
  .material-details h3 {
    font-size: 19px;
    margin: 0 0 10px;
  }
  .material-details p,
  .material-details dl {
    font-size: 13px;
    color: #546b72;
    line-height: 1.9;
  }
  .material-details dl > div {
    display: grid;
    grid-template-columns: 65px 1fr;
    gap: 10px;
    margin-top: 10px;
  }
  .material-details dt {
    font-weight: 700;
  }
  .material-details dd {
    margin: 0;
  }
  .process-section {
    background: #f0f3ef;
  }
  .process-track {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 30px;
    padding: 0;
    margin: 40px 0 30px;
  }
  .process-track li {
    border-top: 1px solid #9fb7b5;
    padding-top: 22px;
  }
  .step-index {
    font: 28px/1 Arial, sans-serif;
    color: #18819a;
  }
  .process-track h3 {
    font-size: 18px;
    margin: 18px 0 10px;
  }
  .process-track p {
    font-size: 13px;
    color: #5c7075;
    line-height: 1.85;
  }
  .process-note {
    font-size: 11px;
    color: #63767c;
    border-top: 1px solid #cad7d0;
    padding-top: 20px;
    margin: 0;
  }
  .faq-section {
    display: grid;
    grid-template-columns: 1fr 1.65fr;
    gap: 70px;
  }
  .faq-list {
    border-top: 1px solid #c7d3ca;
  }
  .faq-list details {
    border-bottom: 1px solid #c7d3ca;
  }
  .faq-list summary {
    display: flex;
    gap: 20px;
    align-items: baseline;
    padding-block: 23px;
    font-size: 15px;
    font-weight: 700;
    list-style: none;
    cursor: pointer;
  }
  .faq-list summary::-webkit-details-marker {
    display: none;
  }
  .faq-index {
    font-size: 10px;
    color: #6c878c;
  }
  .faq-plus {
    margin-left: auto;
    flex-shrink: 0;
  }
  .faq-list details[open] .faq-plus {
    transform: rotate(45deg);
  }
  .faq-list details p {
    margin: 0;
    padding: 0 30px 24px;
    font-size: 13px;
    line-height: 1.85;
    color: #5a7076;
  }
  .start-banner {
    background: #dff08f;
    padding-block: 56px;
  }
  .start-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 30px;
  }
  .start-inner h2 {
    font-size: clamp(26px, 3vw, 38px);
  }
  .start-inner p:not(.studio-kicker) {
    font-size: 13px;
  }
  .start-inner > a {
    flex-shrink: 0;
  }
  @media (max-width: 1000px) {
    .platform-layout,
    .material-layout {
      gap: 40px;
    }
    .poster-grid {
      min-height: 560px;
    }
    .hero-object-main {
      height: 330px;
    }
    .service-art {
      height: 225px;
    }
    .service-art .studio-image {
      height: 210px;
    }
  }
  @media (max-width: 760px) {
    .poster-grid {
      grid-template-columns: 1fr;
      padding-block: 40px 10px;
      gap: 0;
    }
    h1 {
      font-size: clamp(35px, 8vw, 52px);
      margin-bottom: 20px;
    }
    .poster-copy .studio-kicker {
      font-size: 10px;
      margin-bottom: 22px;
    }
    .poster-description {
      font-size: 14px;
    }
    .poster-actions {
      gap: 16px;
      margin-top: 24px;
    }
    .poster-actions .studio-button {
      font-size: 13px;
      padding: 13px 18px;
    }
    .poster-footnote {
      margin-top: 24px;
      font-size: 10px;
    }
    .poster-art {
      min-height: 320px;
      width: min(100%, 470px);
      margin: auto;
    }
    .poster-art-type {
      top: 8px;
      right: 5px;
      font-size: 125px;
    }
    .hero-object-main {
      height: 255px;
      top: 0;
      right: 0;
    }
    .hero-object-front {
      height: 160px;
      bottom: 8px;
      left: 0;
    }
    .hero-object-back {
      height: 125px;
      top: 10px;
    }
    .object-label {
      font-size: 9px;
      bottom: 20px;
    }
    .object-label small {
      font-size: 8px;
    }
    .capability-strip {
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding-block: 18px;
    }
    .capability-strip > div {
      flex-direction: column;
      align-items: start;
      gap: 5px;
      font-size: 10px;
    }
    .capability-strip > a {
      grid-column: 1 / -1;
      margin-top: 8px;
      font-size: 11px;
    }
    .studio-section {
      padding-block: 50px;
    }
    .section-heading {
      display: block;
      margin-bottom: 27px;
    }
    h2 {
      font-size: 28px;
    }
    .service-grid {
      grid-template-columns: 1fr;
      gap: 28px;
    }
    .service-art {
      height: 240px;
    }
    .service-art .studio-image {
      height: 230px;
    }
    .platform-section {
      padding-block: 45px;
    }
    .platform-layout,
    .material-layout,
    .faq-section {
      grid-template-columns: 1fr;
      gap: 35px;
    }
    .material-display {
      min-height: 350px;
    }
    .material-display .studio-image {
      height: 270px;
      margin-top: 20px;
    }
    .material-big-type {
      font-size: 95px;
      top: 17px;
    }
    .material-caption {
      padding: 0 23px 23px;
    }
    .material-tabs button {
      padding: 12px 13px;
    }
    .material-details {
      min-height: 0;
    }
    .process-track {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 25px;
    }
    .process-track h3 {
      font-size: 16px;
    }
    .process-track p {
      font-size: 12px;
    }
    .faq-list summary {
      gap: 13px;
      font-size: 14px;
    }
    .start-inner {
      display: block;
    }
    .start-inner > a {
      margin-top: 15px;
      font-size: 14px;
    }
  }
</style>
