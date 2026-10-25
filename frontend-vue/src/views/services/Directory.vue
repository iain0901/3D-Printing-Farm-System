<template>
  <public-shell>
    <div class="services-page" :style="{ '--service-color': audience ? audience.color : '#dbe5cc' }">
      <section class="service-hero">
        <div class="studio-wrap">
          <nav class="service-breadcrumb" aria-label="麵包屑">
            <router-link to="/">首頁</router-link>
            <span aria-hidden="true">／</span>
            <router-link v-if="audience" to="/services">FDM 服務</router-link>
            <span v-if="audience" aria-hidden="true">／</span>
            <span aria-current="page">{{ audience ? audience.title : 'FDM 服務總覽' }}</span>
          </nav>
          <div class="service-hero-grid">
            <div>
              <p class="studio-kicker">{{ audience ? audience.shortTitle : '專注 FDM・從用途找到製作方式' }}</p>
              <h1>
                <span v-for="line in headline" :key="line">{{ line }}</span>
              </h1>
              <p class="service-lead">{{ description }}</p>
              <a href="#service-options" class="studio-button" @click.prevent="browse">
                {{ audience ? '找適合我的用途' : '探索製作服務' }}
                <span aria-hidden="true">↓</span>
              </a>
              <p class="service-hero-note">{{ audience ? audience.note : '單件原型到小批量，都從確認需求開始。' }}</p>
            </div>
            <div class="service-hero-art">
              <object-collage />
            </div>
          </div>
        </div>
      </section>
      <nav class="audience-nav studio-wrap" aria-label="選擇服務客群">
        <router-link to="/services" :aria-current="!audience ? 'page' : undefined">全部用途</router-link>
        <router-link
          v-for="item in audiences"
          :key="item.id"
          :to="`/for/${item.id}`"
          :aria-current="audienceId === item.id ? 'page' : undefined"
        >
          {{ item.title }}
        </router-link>
      </nav>
      <instruction-notes :placement="$route.path" class="studio-wrap" />
      <section v-if="audience" class="studio-wrap audience-priorities">
        <p class="studio-kicker">這次製作，先釐清三件事</p>
        <ol>
          <li v-for="(priority, index) in audience.priorities" :key="priority">
            <span>0{{ index + 1 }}</span>
            {{ priority }}
          </li>
        </ol>
      </section>
      <div id="service-options" ref="options" tabindex="-1" class="studio-wrap service-options">
        <section v-for="group in groups" :key="group.id" class="service-group" :aria-labelledby="`group-${group.id}`">
          <div class="service-section-heading">
            <div>
              <p class="studio-kicker">{{ group.shortTitle }}</p>
              <h2 :id="`group-${group.id}`">{{ audience ? '這次，你想做哪一種？' : group.title }}</h2>
            </div>
            <router-link v-if="!audience" :to="`/for/${group.id}`">進入{{ group.shortTitle }}專區 →</router-link>
          </div>
          <div class="use-case-grid">
            <router-link
              v-for="service in groupServices(group.id)"
              :key="service.id"
              :to="`/services/${service.id}`"
              class="use-case-card"
              :style="{ '--card-color': group.color }"
            >
              <div class="use-case-art">
                <span>{{ service.tag }}</span>
              </div>
              <h3>
                {{ service.title }}
                <span aria-hidden="true">→</span>
              </h3>
              <p>{{ service.summary }}</p>
              <span class="use-case-examples">{{ service.examples.join(' ／ ') }}</span>
            </router-link>
          </div>
        </section>
      </div>
      <section class="service-tip studio-wrap">
        <span class="service-tip-mark" aria-hidden="true">i</span>
        <div>
          <h2>{{ audience ? '還有一些，你可能沒想到的用途。' : '先看用途，再決定 FDM 適不適合。' }}</h2>
          <p>
            {{
              audience
                ? audience.extra
                : 'FDM 適合討論造型、組裝與小量製作，也有層紋、方向性與尺寸限制。微小細節、透明外觀或安全關鍵用途，需要先確認是否適合這個製程。'
            }}
          </p>
        </div>
      </section>
      <section class="service-footer-cta">
        <div class="studio-wrap">
          <div>
            <p class="studio-kicker">全部服務，皆以塑膠線材 FDM 製作</p>
            <h2>
              有模型，就直接開始。
              <br />
              讓系統先幫你估價。
            </h2>
            <p>不提供樹脂光固化或金屬列印。材料供應、可製作尺寸與交期需依案件確認。</p>
          </div>
          <router-link to="/quote" class="studio-button light">開始自動估價 →</router-link>
        </div>
      </section>
    </div>
  </public-shell>
</template>
<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import ObjectCollage from '@/components/public/ObjectCollage.vue'
  import InstructionNotes from '@/components/public/InstructionNotes.vue'
  import { audiences, getAudience, servicesForAudience } from '@/content/fdmServices.mjs'
  import '@/styles/public-services.scss'
  export default {
    name: 'ServiceDirectory',
    components: { PublicShell, ObjectCollage, InstructionNotes },
    props: { audienceId: { type: String, default: '' } },
    data: () => ({ audiences }),
    computed: {
      audience() {
        return getAudience(this.audienceId)
      },
      groups() {
        return this.audience ? [this.audience] : audiences
      },
      headline() {
        return this.audience ? this.audience.headline : ['FDM 製作服務，', '從需求到實體。']
      },
      description() {
        return this.audience
          ? this.audience.description
          : '提供學校研究、企業開發與個人創作所需的 FDM 代印服務。依用途確認材料、模型與製作條件，從單件原型到小批量交付。'
      },
    },
    methods: {
      groupServices: servicesForAudience,
      browse() {
        this.$refs.options.focus()
        this.$refs.options.scrollIntoView({ block: 'start' })
      },
    },
  }
</script>
