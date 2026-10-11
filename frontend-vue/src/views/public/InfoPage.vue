<template>
  <public-shell>
    <article v-if="page" class="info-page" :style="{ '--page-tone': page.tone }">
      <header class="info-hero">
        <div class="studio-wrap">
          <nav class="info-breadcrumb" aria-label="麵包屑">
            <router-link to="/">首頁</router-link>
            <span aria-hidden="true">／</span>
            <span aria-current="page">{{ page.title }}</span>
          </nav>
          <div class="info-hero-grid">
            <div>
              <p class="studio-kicker">{{ page.eyebrow }}</p>
              <h1>
                <span v-for="line in page.headline" :key="line">{{ line }}</span>
              </h1>
              <p>{{ page.lead }}</p>
              <router-link v-if="page.cta" :to="page.cta.to" class="studio-button">
                {{ page.cta.label }}
                <span aria-hidden="true">↗</span>
              </router-link>
            </div>
            <div class="info-hero-art">
              <object-collage :kind="page.art" />
              <span>三點成型／FDM 製作筆記</span>
            </div>
          </div>
        </div>
      </header>
      <main class="studio-wrap info-content">
        <section
          v-for="block in page.blocks"
          :key="block.heading"
          class="info-block"
          :class="`info-${block.type}`"
          :aria-labelledby="`section-${block.heading}`"
        >
          <div v-if="block.type !== 'notice'" class="info-heading">
            <p class="studio-kicker">{{ page.title }}</p>
            <h2 :id="`section-${block.heading}`">{{ block.heading }}</h2>
            <p v-if="block.intro">{{ block.intro }}</p>
          </div>
          <template v-if="block.type === 'cards' || block.type === 'actions'">
            <div class="info-card-grid">
              <component
                :is="isExternal(card[2]) ? 'a' : 'router-link'"
                v-for="card in block.cards"
                :key="card[0]"
                class="info-card"
                :href="isExternal(card[2]) ? card[2] : undefined"
                :to="!isExternal(card[2]) ? card[2] : undefined"
              >
                <h3>
                  {{ card[0] }}
                  <span v-if="block.type === 'actions'" aria-hidden="true">↗</span>
                </h3>
                <p>{{ card[1] }}</p>
              </component>
            </div>
          </template>
          <template v-else-if="block.type === 'comparison'">
            <div class="info-comparison-wrap" tabindex="0">
              <table class="info-comparison">
                <thead>
                  <tr>
                    <th v-for="column in block.columns" :key="column" scope="col">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in block.rows" :key="row.material" :class="{ recommended: row.recommended }">
                    <th scope="row">
                      {{ row.material }}
                      <span v-if="row.recommended">最推薦</span>
                    </th>
                    <td>{{ row.use }}</td>
                    <td>{{ row.feature }}</td>
                    <td>{{ row.check }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <template v-else-if="block.type === 'split' || block.type === 'steps'">
            <ol class="info-list" :class="{ numbered: block.type === 'steps' }">
              <li v-for="(item, index) in block.items" :key="item[0]">
                <span v-if="block.type === 'steps'">0{{ index + 1 }}</span>
                <div>
                  <h3>{{ item[0] }}</h3>
                  <p>{{ item[1] }}</p>
                </div>
              </li>
            </ol>
          </template>
          <template v-else-if="block.type === 'faq'">
            <div class="info-faq">
              <details v-for="item in block.items" :key="item[0]">
                <summary>
                  {{ item[0] }}
                  <span aria-hidden="true">＋</span>
                </summary>
                <p>{{ item[1] }}</p>
              </details>
            </div>
          </template>
          <template v-else-if="block.type === 'notice'">
            <div class="info-notice">
              <p class="studio-kicker">重要提醒</p>
              <h2 :id="`section-${block.heading}`">{{ block.heading }}</h2>
              <p>{{ block.text }}</p>
            </div>
          </template>
        </section>
      </main>
      <section class="info-end">
        <div class="studio-wrap">
          <div>
            <p class="studio-kicker">把你的下一步，變得更具體</p>
            <h2>
              還在想怎麼開始？
              <br />
              先看看服務情境，或直接估價。
            </h2>
          </div>
          <div>
            <router-link to="/services" class="info-text-link">探索 FDM 製作服務 ↗</router-link>
            <router-link to="/quote" class="studio-button light">開始自動估價 ↗</router-link>
          </div>
        </div>
      </section>
    </article>
  </public-shell>
</template>

<script>
  import PublicShell from '@/components/public/PublicShell.vue'
  import ObjectCollage from '@/components/public/ObjectCollage.vue'
  import { getPublicPage } from '@/content/publicPages.mjs'
  import '@/styles/public-info.scss'

  export default {
    name: 'InfoPage',
    components: { PublicShell, ObjectCollage },
    props: { pageId: { type: String, required: true } },
    computed: {
      page() {
        return getPublicPage(this.pageId)
      },
    },
    methods: {
      isExternal(value) {
        return typeof value === 'string' && (value.startsWith('mailto:') || value.startsWith('https:'))
      },
    },
  }
</script>
