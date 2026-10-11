<template>
  <public-shell>
    <section class="landing-poster">
      <div class="studio-wrap poster-grid">
        <div class="poster-copy">
          <p class="studio-kicker">FDM 列印・建模・小量製造</p>
          <h1>
            好點子，
            <br />
            不只
            <span class="outline-word">想想。</span>
            <br />
            <span class="underlined">把它做出來</span>
            <span class="orange-dot">。</span>
          </h1>
          <p class="poster-description">
            一張草圖、一個模型，或一個「如果可以」。
            <br />
            從第一個原型到小量製作，
            <br class="mobile-break" />
            我們陪你把想像，一層一層變成日常。
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
          <div class="poster-footnote">
            <span class="tiny-dot"></span>
            不必先有模型，也能開始。
          </div>
        </div>
        <div class="poster-art">
          <div class="art-arch"></div>
          <span class="art-note">想像，正在成型中。</span>
          <workshop-art kind="printer" />
          <div class="round-stamp">
            從 0 到 1
            <br />
            <b>做就對了</b>
            <span>一層・一層・成型</span>
          </div>
          <div class="drawing-label">
            <span>01 ／ 工作室日常</span>
            <span>材料 + 想法 = 新可能</span>
          </div>
        </div>
      </div>
    </section>
    <div class="capability-strip" aria-label="提供的製作服務">
      <span>把想像拿在手上</span>
      <i aria-hidden="true">✳</i>
      <span>一件原型，也認真製作</span>
      <i aria-hidden="true">✳</i>
      <span>從模型到小量生產</span>
      <i aria-hidden="true">✳</i>
      <span>讓好點子，有個實體</span>
    </div>
    <audience-links />
    <section id="services" class="studio-wrap studio-section">
      <div class="section-heading">
        <div>
          <p class="studio-kicker">從你手上的那一步開始</p>
          <h2>
            想做什麼？
            <br />
            這裡有幾種可能。
          </h2>
        </div>
        <p>
          不用一次準備好所有答案。
          <br />
          把你有的交給我們，剩下的一起討論。
        </p>
      </div>
      <div class="service-grid">
        <router-link v-for="service in services" :key="service.number" :to="service.to" class="service-entry" :class="service.kind">
          <div class="service-art">
            <span class="service-number">{{ service.number }}</span>
            <workshop-art :kind="service.kind" />
            <span class="service-chip">{{ service.tag }}</span>
          </div>
          <div class="service-title">
            <h3>{{ service.title }}</h3>
            <span class="circle-arrow" aria-hidden="true">↗</span>
          </div>
          <p>{{ service.description }}</p>
        </router-link>
      </div>
    </section>
    <section id="materials" class="material-section">
      <div class="studio-wrap material-layout">
        <div class="material-display" :style="{ background: selectedMaterial.background }">
          <span class="material-big-type" aria-hidden="true">{{ selectedMaterial.name }}</span>
          <workshop-art :kind="selectedMaterial.art" />
          <span class="material-caption">材料筆記 ／ {{ selectedMaterial.note }}</span>
          <span class="material-spark" aria-hidden="true">✳</span>
        </div>
        <div class="material-copy">
          <p class="studio-kicker">選對材料，好點子更耐用</p>
          <h2>
            先想怎麼用，
            <br />
            再決定用什麼。
          </h2>
          <p class="material-intro">
            外觀、韌性、使用環境，每種材料都有擅長的事。
            <br />
            先從作品的用途，找到適合的方向。
          </p>
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
                <dt>製作前筆記</dt>
                <dd>{{ selectedMaterial.caution }}</dd>
              </div>
            </dl>
          </div>
          <router-link to="/quote" class="text-link">
            帶著需求，讓我們幫你選
            <span aria-hidden="true">↗</span>
          </router-link>
        </div>
      </div>
    </section>
    <section id="process" class="studio-wrap studio-section">
      <div class="section-heading">
        <div>
          <p class="studio-kicker">每一步，都離成品近一點</p>
          <h2>
            從「我想做」，
            <br />
            到「做好了」。
          </h2>
        </div>
        <router-link to="/quote" class="text-link">準備好了？開始估價 ↗</router-link>
      </div>
      <ol class="process-track">
        <li v-for="(item, i) in steps" :key="item.title">
          <span class="step-index">
            0{{ i + 1 }}
            <span aria-hidden="true">↗</span>
          </span>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
        </li>
      </ol>
      <div class="process-note">
        <span aria-hidden="true">↗</span>
        <p>
          還沒有 3D 模型？一張照片、手繪草圖，或尺寸說明也可以。
          <br />
          <b>選擇「專員協助」，一起確認下一步。</b>
        </p>
        <router-link to="/quote?mode=agent&amp;model=no">聊聊我的想法 ↗</router-link>
      </div>
    </section>
    <section id="faq" class="faq-section studio-wrap">
      <div class="faq-heading">
        <p class="studio-kicker">開始之前，你可能想問</p>
        <h2>
          先解開
          <br />
          幾個小疑問。
        </h2>
        <div class="faq-doodle" aria-hidden="true">
          ？
          <span>!</span>
        </div>
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
          <p class="studio-kicker">不用等到完美，先從一個想法開始</p>
          <h2>
            你的下一件作品，
            <br />
            就從這裡開始。
          </h2>
          <router-link to="/quote" class="studio-button light">
            把想法交給我們
            <span aria-hidden="true">↗</span>
          </router-link>
        </div>
        <workshop-art kind="sketch" />
      </div>
    </section>
  </public-shell>
</template>
<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import WorkshopArt from '@/components/public/WorkshopArt.vue'
  import AudienceLinks from '@/components/public/AudienceLinks.vue'
  export default {
    name: 'Landing',
    components: { PublicShell, WorkshopArt, AudienceLinks },
    data() {
      return {
        materialIndex: 0,
        services: [
          {
            number: '01',
            kind: 'parts',
            tag: '已經有模型',
            title: '把模型印出來',
            description: '上傳 STL、3MF 或 STEP，選擇材料與數量，從你的第一件作品開始。',
            to: '/quote',
          },
          {
            number: '02',
            kind: 'sketch',
            tag: '還在想像中',
            title: '把想法畫成型',
            description: '帶著草圖、尺寸或使用需求，由專員協助確認建模與製作方式。',
            to: '/quote?mode=agent&model=no',
          },
          {
            number: '03',
            kind: 'spool',
            tag: '不只做一件',
            title: '讓好設計多一點',
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
    background: #80bfc9;
    border-top: 1px solid #173c4320;
    position: relative;
    overflow: hidden;
  }
  .poster-grid {
    display: grid;
    grid-template-columns: 1.03fr 1fr;
    align-items: center;
    gap: 24px;
    padding-top: 62px;
    padding-bottom: 62px;
    min-height: 665px;
  }
  .poster-copy {
    position: relative;
    z-index: 1;
  }
  .poster-copy .studio-kicker {
    margin: 0 0 24px;
  }
  h1 {
    font-size: clamp(48px, 5.2vw, 76px);
    letter-spacing: -0.055em;
    font-weight: 900;
    line-height: 1.18;
    margin: 0;
  }
  .outline-word {
    color: #f6f5ed;
    -webkit-text-stroke: 1.5px #173c43;
  }
  .underlined {
    position: relative;
    z-index: 0;
    white-space: nowrap;
  }
  .underlined::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 4px;
    width: 100%;
    height: 12px;
    border-radius: 50%;
    background: #e3ed97;
    z-index: -1;
    transform: rotate(-2deg);
  }
  .orange-dot {
    color: #a64724;
  }
  .poster-description {
    font-size: 15px;
    line-height: 1.9;
    margin: 28px 0 24px;
  }
  .poster-actions {
    display: flex;
    align-items: center;
    gap: 28px;
  }
  .text-link {
    font-size: 14px;
    font-weight: 700;
    border-bottom: 1px solid currentColor;
    padding-bottom: 5px;
    display: inline-flex;
    gap: 20px;
  }
  .poster-footnote {
    font-size: 11px;
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 23px;
  }
  .tiny-dot {
    background: #173c43;
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .poster-art {
    position: relative;
    padding-top: 16px;
    align-self: stretch;
    display: flex;
    align-items: center;
  }
  .art-arch {
    position: absolute;
    inset: 5px 22px 36px;
    background: #e9efe2;
    border: 1px solid #173c4340;
    border-radius: 48% 48% 8px 8px;
    transform: rotate(5deg);
  }
  .poster-art .workshop-art {
    position: relative;
    width: 115%;
    max-width: none;
    margin-left: -8%;
    transform: rotate(-3deg);
  }
  .art-note {
    position: absolute;
    top: 27px;
    left: 50%;
    transform: rotate(8deg);
    z-index: 1;
    font-size: 13px;
    white-space: nowrap;
  }
  .round-stamp {
    position: absolute;
    bottom: 45px;
    left: -23px;
    border: 1.5px solid #173c43;
    outline: 1px dashed #173c43;
    outline-offset: -7px;
    border-radius: 50%;
    background: #e3ed97;
    width: 119px;
    height: 119px;
    text-align: center;
    display: flex;
    flex-direction: column;
    justify-content: center;
    transform: rotate(-13deg);
    font-size: 12px;
    line-height: 1.6;
  }
  .round-stamp b {
    font-size: 19px;
  }
  .round-stamp span {
    font-size: 8px;
    margin-top: 5px;
  }
  .drawing-label {
    position: absolute;
    bottom: 0;
    left: 38px;
    right: 8px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    border-top: 1px solid #173c4370;
    padding-top: 14px;
  }
  .mobile-break {
    display: none;
  }
  .capability-strip {
    background: #e3ed97;
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 20px;
    padding: 17px 28px;
    border-block: 1px solid #173c43;
    font-size: 13px;
    font-weight: 700;
    overflow: hidden;
  }
  .capability-strip span {
    white-space: nowrap;
  }
  .capability-strip i {
    font-style: normal;
    font-size: 26px;
    line-height: 1;
  }
  .studio-section {
    padding-top: 94px;
    padding-bottom: 94px;
    scroll-margin-top: 30px;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    gap: 30px;
    align-items: flex-end;
    margin-bottom: 40px;
  }
  h2 {
    font-size: clamp(32px, 3.3vw, 46px);
    font-weight: 800;
    letter-spacing: -0.04em;
    line-height: 1.4;
    margin: 17px 0 0;
  }
  .section-heading > p {
    font-size: 14px;
    color: #64736b;
    line-height: 1.9;
    margin-bottom: 6px;
  }
  .service-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 28px;
  }
  .service-art {
    position: relative;
    background: #dde5d9;
    border-radius: 7px;
    aspect-ratio: 1.2;
    overflow: hidden;
  }
  .service-entry.sketch .service-art {
    background: #e8ddca;
  }
  .service-entry.spool .service-art {
    background: #d4e5e4;
  }
  .service-art .workshop-art {
    width: 94%;
    height: 100%;
    margin: auto;
    transition: transform 0.25s;
  }
  .service-entry:hover .workshop-art {
    transform: rotate(-4deg) scale(1.03);
  }
  .service-number {
    position: absolute;
    left: 18px;
    top: 14px;
    font-size: 12px;
    z-index: 1;
  }
  .service-chip {
    position: absolute;
    bottom: 17px;
    right: 16px;
    padding: 4px 12px;
    background: #fffefa;
    border: 1px solid #173c43;
    border-radius: 20px;
    font-size: 10px;
    transform: rotate(-6deg);
  }
  .service-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 22px;
  }
  .service-title h3 {
    font-size: 23px;
    margin: 0;
    letter-spacing: -0.025em;
  }
  .circle-arrow {
    border: 1px solid #173c43;
    border-radius: 50%;
    width: 31px;
    height: 31px;
    text-align: center;
  }
  .service-entry > p {
    font-size: 14px;
    color: #64736b;
    line-height: 1.85;
    margin: 12px 0 0;
    max-width: 340px;
  }
  .material-section {
    background: #eeeee4;
    padding: 74px 0;
    scroll-margin-top: 24px;
  }
  .material-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 70px;
    align-items: center;
  }
  .material-display {
    align-self: stretch;
    position: relative;
    border-radius: 180px 180px 7px 7px;
    display: flex;
    align-items: center;
    padding: 60px 12px 30px;
    min-width: 0;
    transition: background 0.2s;
  }
  .material-big-type {
    position: absolute;
    font-size: clamp(80px, 11vw, 155px);
    line-height: 1;
    font-weight: 900;
    color: #173c4335;
    letter-spacing: -0.05em;
    top: 60px;
    left: 10%;
  }
  .material-display .workshop-art {
    position: relative;
    margin-top: 40px;
  }
  .material-caption {
    position: absolute;
    bottom: 24px;
    left: 26px;
    font-size: 11px;
  }
  .material-spark {
    position: absolute;
    right: 15px;
    top: 50px;
    font-size: 65px;
    color: #a8502e;
    transform: rotate(15deg);
  }
  .material-copy h2 {
    margin-top: 15px;
  }
  .material-intro {
    font-size: 14px;
    color: #64736b;
    line-height: 1.85;
    margin: 20px 0 25px;
  }
  .material-tabs {
    display: flex;
    gap: 10px;
  }
  .material-tabs button {
    border: 1px solid #9aafa5;
    background: transparent;
    border-radius: 4px;
    padding: 8px 18px;
    color: #173c43;
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
  }
  .material-tabs button.active {
    background: #173c43;
    color: #fffefa;
    border-color: #173c43;
  }
  .material-details {
    min-height: 233px;
    padding: 22px 0;
  }
  .material-details h3 {
    font-size: 20px;
    margin: 0 0 10px;
  }
  .material-details p {
    font-size: 14px;
    line-height: 1.8;
    margin: 0;
  }
  .material-details dl {
    font-size: 12px;
    margin: 19px 0 0;
  }
  .material-details dl div {
    display: grid;
    grid-template-columns: 85px 1fr;
    border-top: 1px solid #cdd3c8;
    padding: 10px 0;
  }
  .material-details dt {
    color: #64736b;
  }
  .material-details dd {
    margin: 0;
  }
  .process-track {
    list-style: none;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    margin: 50px 0 38px;
    gap: 28px;
  }
  .step-index {
    display: flex;
    justify-content: space-between;
    border-top: 1px solid #8ea39a;
    padding-top: 20px;
    font-size: 36px;
    font-family: Georgia, serif;
    font-style: italic;
  }
  .step-index span {
    font-size: 20px;
    font-style: normal;
  }
  .process-track h3 {
    font-size: 21px;
    margin: 20px 0 10px;
  }
  .process-track p {
    font-size: 13px;
    line-height: 1.9;
    color: #64736b;
    margin: 0;
  }
  .process-note {
    background: #e9eadd;
    display: flex;
    align-items: center;
    gap: 24px;
    padding: 25px 30px;
    border-radius: 5px;
  }
  .process-note > span {
    font-size: 36px;
  }
  .process-note p {
    font-size: 13px;
    margin: 0;
    flex: 1;
    line-height: 1.9;
  }
  .process-note a {
    font-size: 13px;
    border-bottom: 1px solid;
    white-space: nowrap;
  }
  .faq-section {
    display: grid;
    grid-template-columns: 1fr 1.5fr;
    gap: 60px;
    padding-bottom: 90px;
  }
  .faq-doodle {
    font-family: Georgia, serif;
    font-size: 100px;
    margin-top: 30px;
    color: #247f93;
    line-height: 1;
    transform: rotate(-14deg);
    display: inline-block;
  }
  .faq-doodle span {
    font-size: 62px;
    color: #b85a35;
    display: inline-block;
    transform: rotate(28deg);
  }
  .faq-list {
    padding-top: 16px;
  }
  .faq-list details {
    border-bottom: 1px solid #c0cbbf;
  }
  .faq-list details:first-child {
    border-top: 1px solid #c0cbbf;
  }
  .faq-list summary {
    display: flex;
    align-items: center;
    list-style: none;
    gap: 20px;
    padding: 24px 0;
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
  }
  .faq-list summary::-webkit-details-marker {
    display: none;
  }
  .faq-index {
    font-size: 11px;
    font-weight: 400;
    color: #64736b;
  }
  .faq-plus {
    margin-left: auto;
    font-size: 23px;
  }
  .faq-list details[open] .faq-plus {
    transform: rotate(45deg);
  }
  .faq-list details p {
    font-size: 14px;
    line-height: 1.9;
    padding: 0 30px 20px 34px;
    color: #64736b;
    margin: 0;
  }
  .start-banner {
    background: #80bfc9;
    overflow: hidden;
  }
  .start-inner {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    align-items: center;
    padding-top: 50px;
    padding-bottom: 50px;
  }
  .start-inner h2 {
    margin-bottom: 27px;
  }
  .start-inner .workshop-art {
    max-height: 330px;
    transform: rotate(9deg);
  }
  @media (min-width: 1450px) {
    .poster-grid {
      min-height: 715px;
    }
  }
  @media (max-width: 1000px) {
    .poster-grid {
      min-height: 610px;
      gap: 8px;
    }
    h1 {
      font-size: 58px;
    }
    .poster-actions {
      gap: 18px;
      flex-wrap: wrap;
    }
    .round-stamp {
      left: 0;
      bottom: 55px;
      width: 98px;
      height: 98px;
    }
    .round-stamp b {
      font-size: 16px;
    }
    .material-layout {
      gap: 35px;
    }
    .material-tabs button {
      padding: 8px 14px;
    }
    .drawing-label {
      left: 12px;
      font-size: 9px;
      gap: 8px;
    }
    .service-grid {
      gap: 18px;
    }
    .service-title h3 {
      font-size: 20px;
    }
  }
  @media (max-width: 760px) {
    .poster-grid {
      grid-template-columns: 1fr;
      padding-top: 36px;
      padding-bottom: 25px;
      gap: 25px;
    }
    .poster-copy .studio-kicker {
      font-size: 10px;
      margin-bottom: 22px;
    }
    h1 {
      font-size: clamp(43px, 10.8vw, 66px);
    }
    .poster-description {
      font-size: 13px;
      margin-top: 24px;
    }
    .poster-actions {
      gap: 22px;
    }
    .poster-actions .studio-button {
      font-size: 14px;
      padding: 13px 17px;
      gap: 25px;
    }
    .poster-actions .text-link {
      font-size: 12px;
      gap: 8px;
    }
    .poster-footnote {
      margin-top: 18px;
    }
    .poster-art {
      max-width: 460px;
      width: 100%;
      margin: auto;
      min-height: 320px;
      padding-bottom: 30px;
    }
    .poster-art .workshop-art {
      width: 100%;
      margin: 0;
    }
    .art-arch {
      inset: 6px 25px 36px;
    }
    .art-note {
      top: 21px;
      font-size: 11px;
    }
    .round-stamp {
      left: 5px;
      bottom: 36px;
      width: 92px;
      height: 92px;
    }
    .drawing-label {
      left: 10px;
      right: 10px;
      bottom: 2px;
    }
    .capability-strip {
      justify-content: flex-start;
      padding: 15px 20px;
      font-size: 11px;
      gap: 22px;
    }
    .capability-strip span:nth-of-type(n + 3),
    .capability-strip i:nth-of-type(n + 2) {
      display: none;
    }
    .studio-section {
      padding-block: 57px;
    }
    .section-heading {
      display: block;
      margin-bottom: 30px;
    }
    .section-heading > p {
      margin-top: 20px;
      font-size: 13px;
    }
    .section-heading > .text-link {
      margin-top: 20px;
    }
    h2 {
      font-size: 32px;
    }
    .service-grid {
      grid-template-columns: 1fr;
      gap: 32px;
    }
    .service-art {
      aspect-ratio: 1.35;
    }
    .service-art .workshop-art {
      max-width: 330px;
    }
    .service-title {
      margin-top: 17px;
    }
    .service-title h3 {
      font-size: 23px;
    }
    .service-entry > p {
      max-width: none;
      font-size: 13px;
    }
    .material-section {
      padding: 46px 0;
    }
    .material-layout {
      grid-template-columns: 1fr;
      gap: 35px;
    }
    .material-display {
      min-height: 290px;
      padding: 5px 25px 20px;
      border-radius: 140px 140px 6px 6px;
      max-height: 350px;
    }
    .material-display .workshop-art {
      max-width: 330px;
      margin: 20px auto 0;
      max-height: 310px;
    }
    .material-big-type {
      font-size: 100px;
      top: 25px;
    }
    .material-spark {
      font-size: 50px;
      top: 40px;
    }
    .material-caption {
      font-size: 10px;
      bottom: 16px;
    }
    .material-details {
      min-height: 245px;
    }
    .material-intro br {
      display: none;
    }
    .material-tabs button {
      flex: 1;
      padding-inline: 5px;
    }
    .process-track {
      grid-template-columns: 1fr 1fr;
      margin-top: 32px;
      gap: 28px 22px;
    }
    .step-index {
      font-size: 30px;
    }
    .process-track h3 {
      font-size: 19px;
      margin-top: 13px;
    }
    .process-note {
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 10px;
      padding: 20px;
    }
    .process-note > span {
      display: none;
    }
    .process-note p {
      flex-basis: 100%;
    }
    .process-note p br {
      display: none;
    }
    .process-note a {
      margin-top: 10px;
    }
    .faq-section {
      grid-template-columns: 1fr;
      gap: 20px;
      padding-bottom: 55px;
    }
    .faq-heading {
      position: relative;
    }
    .faq-doodle {
      position: absolute;
      right: 10px;
      bottom: 0;
      font-size: 70px;
    }
    .faq-doodle span {
      font-size: 45px;
    }
    .faq-list summary {
      gap: 10px;
      font-size: 14px;
      padding-block: 20px;
    }
    .faq-list details p {
      padding-left: 25px;
    }
    .start-inner {
      grid-template-columns: 1fr;
      padding-top: 35px;
      padding-bottom: 0;
    }
    .start-inner .workshop-art {
      max-width: 300px;
      margin: -15px 0 -20px auto;
    }
    .start-inner .studio-kicker {
      font-size: 10px;
    }
  }
</style>
