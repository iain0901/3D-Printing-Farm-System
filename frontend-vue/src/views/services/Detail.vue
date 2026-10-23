<template>
  <public-shell>
    <div v-if="service" class="services-page" :style="{ '--service-color': audience.color }">
      <section class="service-hero">
        <div class="studio-wrap">
          <nav class="service-breadcrumb" aria-label="麵包屑">
            <router-link to="/services">FDM 服務</router-link>
            <span aria-hidden="true">／</span>
            <router-link :to="`/for/${audience.id}`">{{ audience.title }}</router-link>
            <span aria-hidden="true">／</span>
            <span aria-current="page">{{ service.title }}</span>
          </nav>
          <div class="service-hero-grid">
            <div>
              <p class="studio-kicker">{{ service.title }}・FDM 製作</p>
              <h1>
                <span v-for="line in service.headline" :key="line">{{ line }}</span>
              </h1>
              <p class="service-lead">{{ service.summary }}</p>
              <router-link :to="quoteRoute" class="studio-button">
                開始自動估價
                <span aria-hidden="true">↗</span>
              </router-link>
              <p class="service-hero-note">
                {{
                  service.id === 'rush-print'
                    ? '急件也可自動初估；能否趕上指定時間仍需確認。'
                    : '上傳模型、設定材料與數量，使用既有系統取得切片前初估。'
                }}
              </p>
            </div>
            <div class="service-hero-art">
              <object-collage />
            </div>
          </div>
        </div>
      </section>
      <div class="service-examples studio-wrap">
        <span>可以從這些需求開始</span>
        <ul>
          <li v-for="example in service.examples" :key="example">{{ example }}</li>
        </ul>
      </div>
      <section class="studio-wrap service-detail-section">
        <instruction-notes :placement="$route.path" />
        <div class="service-section-heading">
          <div>
            <p class="studio-kicker">這類作品，我們先討論這些</p>
            <h2>
              重點不只印出來，
              <br />
              還要符合你的用途。
            </h2>
          </div>
          <span class="service-editorial-note">{{ service.tag }}</span>
        </div>
        <div class="service-priority-grid">
          <article v-for="(priority, i) in service.priorities" :key="priority[0]">
            <span class="service-index">0{{ i + 1 }}</span>
            <h3>{{ priority[0] }}</h3>
            <p>{{ priority[1] }}</p>
          </article>
        </div>
      </section>
      <section class="service-material-band">
        <div class="studio-wrap service-material-grid">
          <div>
            <p class="studio-kicker">材料是起點，條件才是關鍵</p>
            <h2>
              先有方向，
              <br />
              再確認規格。
            </h2>
            <p>
              以下是討論方向，不是材料性能或供貨承諾。
              <br />
              實際選材需依形狀、受力與使用環境確認。
            </p>
            <dl class="service-material-list">
              <div v-for="material in service.materials" :key="material[0]">
                <dt>{{ material[0] === 'Nylon' ? '尼龍' : material[0] }}</dt>
                <dd>{{ material[1] }}</dd>
              </div>
            </dl>
          </div>
          <aside class="service-boundary">
            <p class="studio-kicker">製作前，這些限制要先知道</p>
            <h3>
              FDM 有擅長的事，
              <br />
              也有需要停下來確認的地方。
            </h3>
            <p>{{ service.boundary }}</p>
            <span>本服務僅提供 FDM 塑膠線材列印。</span>
          </aside>
        </div>
      </section>
      <section class="studio-wrap service-detail-section inquiry-preparation">
        <div>
          <p class="studio-kicker">讓第一次詢價，就有討論方向</p>
          <h2>
            先準備這些，
            <br />
            我們更容易接住你的想法。
          </h2>
          <p>
            勾選手邊已有的資料，或複製清單整理需求。
            <br />
            這裡只是準備筆記，不會上傳檔案或送出案件。
          </p>
          <p class="preparation-progress" role="status">已備妥 {{ prepared.length }} ／ {{ service.checklist.length }} 項</p>
          <button type="button" class="studio-button" @click="copyChecklist">
            複製詢價清單
            <span aria-hidden="true">↗</span>
          </button>
          <p class="copy-status" role="status">{{ copyStatus }}</p>
        </div>
        <div class="preparation-checklist">
          <label v-for="(item, index) in service.checklist" :key="`${service.id}-${index}`">
            <input v-model="prepared" type="checkbox" :value="index" />
            <span>
              <small>0{{ index + 1 }}</small>
              {{ item }}
            </span>
          </label>
          <label v-if="showCopyFallback" class="copy-fallback">
            無法自動複製，請選取下方文字：
            <textarea readonly rows="8" :value="checklistText" aria-label="詢價清單文字" @focus="$event.target.select()" />
          </label>
        </div>
      </section>
      <section class="studio-wrap service-faq">
        <div>
          <p class="studio-kicker">關於{{ service.title }}</p>
          <h2>你可能也想問。</h2>
        </div>
        <div>
          <details>
            <summary>
              {{ service.question }}
              <span aria-hidden="true">＋</span>
            </summary>
            <p>{{ service.answer }}</p>
          </details>
          <details>
            <summary>
              FDM 成品表面會有層紋嗎？
              <span aria-hidden="true">＋</span>
            </summary>
            <p>
              會。FDM
              以塑膠線材逐層堆疊，層紋、接縫與支撐接觸痕會隨模型和方向改變。若有主要展示面或後處理需求，請在詢價時標出，由專員確認可達到的效果與費用。
            </p>
          </details>
        </div>
      </section>
      <section class="service-footer-cta">
        <div class="studio-wrap">
          <div>
            <p class="studio-kicker">{{ service.tag }}</p>
            <h2>
              帶著你的需求，
              <br />
              一起確認下一步。
            </h2>
            <p>自動估價時會帶入「{{ service.title }}」用途提示，你仍可以修改與補充。</p>
          </div>
          <router-link :to="quoteRoute" class="studio-button light">開始自動估價 ↗</router-link>
        </div>
      </section>
      <section class="studio-wrap service-related">
        <p class="studio-kicker">也看看其他製作方向</p>
        <div>
          <router-link v-for="item in related" :key="item.id" :to="`/services/${item.id}`">
            {{ item.title }}
            <span aria-hidden="true">↗</span>
          </router-link>
          <router-link to="/services">
            全部 FDM 服務
            <span aria-hidden="true">↗</span>
          </router-link>
        </div>
      </section>
    </div>
  </public-shell>
</template>
<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import ObjectCollage from '@/components/public/ObjectCollage.vue'
  import InstructionNotes from '@/components/public/InstructionNotes.vue'
  import { getService, getAudience, servicesForAudience, inquiryRoute } from '@/content/fdmServices.mjs'
  import '@/styles/public-services.scss'
  export default {
    name: 'ServiceDetail',
    components: { PublicShell, ObjectCollage, InstructionNotes },
    props: { serviceId: { type: String, required: true } },
    data: () => ({ prepared: [], copyStatus: '', showCopyFallback: false }),
    computed: {
      service() {
        return getService(this.serviceId)
      },
      audience() {
        return getAudience(this.service.audience)
      },
      quoteRoute() {
        return inquiryRoute(this.serviceId)
      },
      related() {
        return servicesForAudience(this.service.audience).filter((item) => item.id !== this.serviceId)
      },
      checklistText() {
        return [
          `FDM 詢價｜${this.service.title}`,
          ...this.service.checklist.map((item, i) => `${this.prepared.includes(i) ? '已備妥' : '待補充'}：${item}`),
          `製作提醒：${this.service.boundary}`,
        ].join('\n')
      },
    },
    watch: {
      serviceId() {
        this.prepared = []
        this.copyStatus = ''
        this.showCopyFallback = false
      },
    },
    methods: {
      async copyChecklist() {
        const serviceId = this.serviceId
        try {
          await navigator.clipboard.writeText(this.checklistText)
          if (serviceId === this.serviceId) {
            this.copyStatus = '詢價清單已複製，可以貼到筆記中補充資料。'
            this.showCopyFallback = false
          }
        } catch {
          if (serviceId === this.serviceId) {
            this.copyStatus = '請從下方文字框手動複製。'
            this.showCopyFallback = true
          }
        }
      },
    },
  }
</script>
