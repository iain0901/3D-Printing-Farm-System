<template>
  <public-shell class="free-print-site">
    <header class="free-hero">
      <div class="studio-wrap">
        <nav class="free-breadcrumb" aria-label="麵包屑">
          <router-link to="/">首頁</router-link>
          <span aria-hidden="true">／</span>
          <router-link v-if="station" to="/free-print">免費列印</router-link>
          <span v-else aria-current="page">免費列印</span>
          <template v-if="station">
            <span aria-hidden="true">／</span>
            <span aria-current="page">{{ station.name }}</span>
          </template>
        </nav>
        <div class="free-hero-grid">
          <div>
            <p class="free-eyebrow">3DRFM ／ 免費列印站</p>
            <template v-if="station">
              <p class="free-campus">{{ station.institution }}</p>
              <h1>{{ station.name }}</h1>
              <p class="free-lead">{{ station.description }}</p>
              <router-link to="/free-print" class="free-text-link">← 重新選擇站點</router-link>
            </template>
            <template v-else>
              <h1>
                免費列印，
                <br />
                <span>從選站開始。</span>
              </h1>
              <p class="free-lead">找到你身邊的列印站，把螢幕上的想法，帶進真實生活。</p>
              <p class="free-subtitle">先選站點，再了解使用方式。瀏覽站點不需要登入。</p>
            </template>
          </div>
          <aside class="free-edition" :aria-label="station ? '已選站點' : '目前站點數'">
            <span>{{ station ? '你的列印目的地' : '從一個站點，開始連結' }}</span>
            <strong aria-hidden="true">
              01
              <span>／</span>
            </strong>
            <p v-if="station">已選擇：{{ station.institution }}・{{ station.name }}</p>
            <p v-else>
              目前 {{ stations.length }} 個站點
              <br />
              國立清華大學・水木書苑
            </p>
            <small>FDM 逐層成型・在地使用</small>
          </aside>
        </div>
      </div>
    </header>

    <div class="studio-wrap free-content">
      <section v-if="!station" aria-labelledby="stations-heading" class="free-stations">
        <div class="free-section-heading">
          <p class="free-eyebrow">01 ／ 站點選擇</p>
          <h2 id="stations-heading">你想在哪裡列印？</h2>
          <p>目前僅提供以下站點；新增站點會在此更新。</p>
        </div>
        <article v-for="item in stations" :key="item.id" class="free-station-card">
          <div class="free-station-identity">
            <span class="free-tag">{{ item.category }}</span>
            <p>{{ item.institution }}</p>
            <h3>{{ item.name }}</h3>
            <p class="free-card-description">{{ item.description }}</p>
          </div>
          <div class="free-station-action">
            <dl>
              <div>
                <dt>製程</dt>
                <dd>FDM 3D 列印</dd>
              </div>
              <div>
                <dt>使用方式</dt>
                <dd>依站點公告與現場指引</dd>
              </div>
            </dl>
            <router-link :to="item.path" class="studio-button" :aria-label="`選擇${item.institution}・${item.name}站點`">
              選擇此站點
              <span aria-hidden="true">↗</span>
            </router-link>
          </div>
        </article>
      </section>

      <section v-else class="free-station-details" aria-labelledby="station-heading">
        <div class="free-section-heading">
          <p class="free-eyebrow">01 ／ 站點說明</p>
          <h2 id="station-heading">出發前，先確認。</h2>
          <p>你已選擇{{ station.institution }}・{{ station.name }}。</p>
        </div>
        <div class="free-notice" role="note">
          <span class="free-tag">線上切片與會員申請</span>
          <h3>先把模型準備好，從線上切片開始。</h3>
          <p>
            現在可以免登入上傳
            STL、調整模型並進行切片。切片使用參考機型，不代表現場設備；完成切片不等於取得免費名額，也不會加入列印佇列或操作機器。
          </p>
          <p>免費列印固定使用 3DSTU_PETG。開放資格、免費額度、服務時段與設備，請依站點公告及現場指引確認。</p>
          <router-link :to="`${station.path}/slicer`" class="studio-button">開啟線上切片 ↗</router-link>
          <router-link to="/portal/workspace?section=free-print" class="free-text-link">會員免費列印申請與進度 ↗</router-link>
          <router-link to="/guides/file-prep" class="free-text-link">先看模型檔案準備指南 ↗</router-link>
        </div>
      </section>

      <section class="free-process" aria-labelledby="free-process-heading">
        <div class="free-section-heading">
          <p class="free-eyebrow">02 ／ 使用流程</p>
          <h2 id="free-process-heading">從模型，到手上的物件。</h2>
          <p>登入會員、保存單色 PETG 模型草稿後可提出申請；由站點確認資格與製作安排。</p>
        </div>
        <ol class="free-steps">
          <li v-for="(step, index) in steps" :key="step.title">
            <span class="free-step-number" aria-hidden="true">0{{ index + 1 }}</span>
            <div>
              <h3>{{ step.title }}</h3>
              <p>{{ step.detail }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="free-faq" aria-labelledby="free-faq-heading">
        <div class="free-section-heading">
          <p class="free-eyebrow">03 ／ 先了解</p>
          <h2 id="free-faq-heading">關於免費列印</h2>
        </div>
        <details>
          <summary>一定要是清華大學學生才能使用嗎？</summary>
          <p>使用資格尚未在本站公布，請依水木書苑的站點公告確認；目前不預設學生、教職員或校外人士的使用權限。</p>
        </details>
        <details>
          <summary>免費列印有材料、尺寸或時間限制嗎？</summary>
          <p>
            免費列印固定使用
            3DSTU_PETG，不提供其他材料選項。列印尺寸、單次額度與服務時段仍依站點規範確認；本站不顯示尚未確認的額度或機台資訊。
          </p>
        </details>
        <details>
          <summary>選擇站點後，就已經排到列印了嗎？</summary>
          <p>還沒有。選擇站點只會進入該站說明頁，目前不會建立列印工作、預約或佇列。</p>
        </details>
        <details>
          <summary>和 3DRFM 的一般代印有什麼不同？</summary>
          <p>免費列印依各站點的服務規範提供；一般代印使用獨立的付費估價與案件流程。這裡不會把你選擇的免費站點轉成付費訂單。</p>
        </details>
      </section>
      <aside class="free-commercial">
        <div>
          <h2>需要一般代印服務？</h2>
          <p>急件、指定規格或其他製作需求，可另外使用 3DRFM 付費代印估價。</p>
        </div>
        <router-link to="/quote" class="free-text-link">前往付費代印估價 ↗</router-link>
      </aside>
    </div>
  </public-shell>
</template>

<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import { freePrintStations, getFreePrintStation, freePrintSteps } from '@/content/freePrintStations.mjs'

  export default {
    name: 'FreePrint',
    components: { PublicShell },
    props: { stationId: { type: String, default: '' } },
    data: () => ({ stations: freePrintStations, steps: freePrintSteps }),
    computed: {
      station() {
        return getFreePrintStation(this.stationId)
      },
    },
  }
</script>

<style scoped>
  .free-print-site {
    --paper: var(--rfm-paper);
    --ink: var(--rfm-ink);
    --blue: var(--rfm-interactive);
  }
  .free-hero {
    padding: 30px 0 65px;
    border-bottom: 1px solid #192e5326;
  }
  .free-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12px;
    margin-bottom: 55px;
  }
  .free-breadcrumb a:hover,
  .free-text-link:hover {
    color: var(--rfm-accent);
  }
  .free-hero-grid {
    display: grid;
    grid-template-columns: 1.6fr 1fr;
    gap: 70px;
    align-items: end;
  }
  .free-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    margin: 0 0 24px;
  }
  h1 {
    font-size: var(--rfm-title-page);
    line-height: 1.18;
    letter-spacing: -0.06em;
    margin: 0 0 28px;
    font-weight: 900;
  }
  h1 > span {
    color: var(--rfm-accent);
  }
  .free-lead {
    max-width: 480px;
    font-size: 18px;
    line-height: 1.85;
    margin: 0 0 14px;
  }
  .free-subtitle {
    font-size: 13px;
    margin: 0;
    color: var(--rfm-muted);
  }
  .free-campus {
    font-size: 20px;
    margin: 0 0 15px;
  }
  .free-edition {
    border-top: 3px solid;
    border-bottom: 1px solid;
    padding: 20px 0;
  }
  .free-edition > span,
  .free-edition small {
    font-size: 11px;
    letter-spacing: 0.08em;
  }
  .free-edition > strong {
    display: block;
    font: 150px/1.2 Arial, sans-serif;
    letter-spacing: -0.08em;
    color: var(--rfm-interactive);
  }
  .free-edition > strong > span {
    font-size: 80px;
    color: var(--rfm-accent);
    margin-left: 14px;
  }
  .free-edition p {
    margin: 8px 0 22px;
    font-size: 15px;
  }
  .free-content {
    padding-top: 65px;
    padding-bottom: 70px;
  }
  .free-section-heading h2 {
    font-size: var(--rfm-title-section);
    line-height: 1.4;
    letter-spacing: -0.04em;
    margin: 0 0 16px;
  }
  .free-section-heading > p:last-child {
    font-size: 14px;
    color: var(--rfm-muted);
    margin: 0 0 30px;
  }
  .free-station-card {
    display: grid;
    grid-template-columns: 1.35fr 1fr;
    gap: 45px;
    padding: 40px;
    background: var(--rfm-subtle);
    border-top: 3px solid var(--rfm-ink);
  }
  .free-tag {
    display: inline-block;
    font-size: 11px;
    line-height: 1.5;
    padding: 5px 11px;
    border: 1px solid currentColor;
    border-radius: 2px;
  }
  .free-station-identity > p {
    font-size: 14px;
    margin: 24px 0 6px;
  }
  .free-station-identity h3 {
    font-size: 43px;
    line-height: 1.3;
    letter-spacing: -0.04em;
    margin: 0 0 16px;
  }
  .free-station-identity > .free-card-description {
    margin-top: 16px;
    max-width: 360px;
  }
  .free-station-action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
  }
  dl {
    width: 100%;
    margin: 0 0 26px;
  }
  dl > div {
    display: grid;
    grid-template-columns: 75px 1fr;
    gap: 10px;
    border-bottom: 1px solid #192e5333;
    padding: 13px 0;
    font-size: 13px;
  }
  dt {
    font-weight: 700;
  }
  dd {
    margin: 0;
  }
  .free-process,
  .free-faq {
    margin-top: 80px;
  }
  .free-steps {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    padding: 0;
    margin: 35px 0 0;
    list-style: none;
    gap: 30px;
  }
  .free-steps li {
    border-top: 1px solid;
    padding-top: 20px;
  }
  .free-step-number {
    font: 46px/1 Arial, sans-serif;
    color: var(--rfm-accent);
  }
  .free-steps h3 {
    font-size: 18px;
    margin: 23px 0 12px;
  }
  .free-steps p {
    font-size: 13px;
    line-height: 1.8;
    margin: 0;
    color: var(--rfm-muted);
  }
  .free-notice {
    border-left: 4px solid var(--rfm-interactive);
    background: var(--rfm-selected);
    padding: 32px;
  }
  .free-notice h3 {
    font-size: 25px;
    line-height: 1.5;
    margin: 20px 0 15px;
  }
  .free-notice p {
    font-size: 14px;
    max-width: 750px;
  }
  .free-text-link {
    display: inline-block;
    border-bottom: 1px solid;
    font-size: 13px;
    font-weight: 700;
    padding: 5px 0;
  }
  .free-faq details {
    border-top: 1px solid #192e5333;
  }
  .free-faq details:last-child {
    border-bottom: 1px solid #192e5333;
  }
  .free-faq summary {
    cursor: pointer;
    padding: 23px 4px;
    font-size: 15px;
    font-weight: 700;
  }
  .free-faq details p {
    font-size: 14px;
    line-height: 1.85;
    max-width: 800px;
    padding: 0 4px 20px;
    margin: 0;
  }
  .free-commercial {
    margin-top: 70px;
    border-top: 1px solid;
    padding-top: 25px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 30px;
  }
  .free-commercial h2 {
    font-size: 19px;
    margin: 0 0 8px;
  }
  .free-commercial p {
    font-size: 13px;
    margin: 0;
  }
  .free-commercial > a {
    flex-shrink: 0;
  }
  @media (max-width: 800px) {
    .free-hero-grid {
      gap: 30px;
      grid-template-columns: 1.5fr 1fr;
    }
    .free-edition > strong {
      font-size: 110px;
    }
    .free-edition > strong > span {
      font-size: 50px;
    }
    .free-station-card {
      padding: 30px;
      gap: 25px;
    }
    .free-steps {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .free-hero {
      padding: 22px 0 35px;
    }
    .free-breadcrumb {
      margin-bottom: 32px;
      font-size: 11px;
    }
    .free-hero-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 35px;
    }
    h1 {
      font-size: var(--rfm-title-page);
    }
    .free-lead {
      font-size: 15px;
    }
    .free-edition {
      display: grid;
      grid-template-columns: 1fr auto;
      column-gap: 12px;
      align-items: center;
      padding: 14px 0;
    }
    .free-edition > strong {
      font-size: 70px;
      grid-column: 2;
      grid-row: 1 / 4;
    }
    .free-edition > strong > span {
      display: none;
    }
    .free-edition p {
      font-size: 13px;
      margin: 8px 0;
    }
    .free-content {
      padding-top: 38px;
      padding-bottom: 45px;
    }
    .free-station-card {
      grid-template-columns: minmax(0, 1fr);
      gap: 22px;
      padding: 25px 22px;
    }
    .free-station-identity h3 {
      font-size: 37px;
    }
    .free-station-action .studio-button {
      width: 100%;
      justify-content: space-between;
    }
    .free-process,
    .free-faq {
      margin-top: 50px;
    }
    .free-steps {
      gap: 28px 20px;
    }
    .free-steps h3 {
      font-size: 16px;
    }
    .free-notice {
      padding: 24px 20px;
    }
    .free-notice h3 {
      font-size: 22px;
    }
    .free-commercial {
      align-items: flex-start;
      flex-direction: column;
      gap: 14px;
      margin-top: 45px;
    }
  }
</style>
