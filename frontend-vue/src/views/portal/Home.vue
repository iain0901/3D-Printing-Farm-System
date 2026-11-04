<template>
  <dashboard v-if="$route.query.tab" />
  <div v-else class="member-home">
    <header class="home-heading">
      <div>
        <p class="home-kicker">我的製作工作台</p>
        <h1>今天想做什麼？</h1>
        <p>選擇列印方式，從模型開始。</p>
      </div>
      <button :disabled="loading" @click="load">{{ loading ? '更新中…' : '更新進度' }}</button>
    </header>
    <section class="start-options" aria-label="選擇列印方式">
      <router-link class="start-option paid" to="/portal/print">
        <span class="option-tag">交給我們製作</span>
        <h2>
          付費代印
          <span aria-hidden="true">→</span>
        </h2>
        <p>準備模型、切片估價，確認後送出。</p>
        <div class="option-bottom">
          <strong>NT$2／克</strong>
          <span>開始估價 →</span>
        </div>
      </router-link>
      <router-link class="start-option free" to="/portal/free-slicer">
        <span class="option-tag">到站自助列印</span>
        <h2>
          免費列印
          <span aria-hidden="true">→</span>
        </h2>
        <p>清華大學水木書苑 · 3DSTU_PETG</p>
        <div class="option-bottom">
          <strong>切片後加入排隊</strong>
          <span>準備模型 →</span>
        </div>
      </router-link>
    </section>
    <nav class="quick-tools" aria-label="模型工具">
      <router-link to="/portal/workspace?section=agent">還沒有模型？建模工具 →</router-link>
      <router-link to="/portal/workspace?section=models">我的模型與下載 →</router-link>
      <router-link to="/portal/workspace?section=drafts">繼續上次的草稿 →</router-link>
    </nav>
    <section class="home-progress">
      <div class="progress-heading">
        <div>
          <h2>接下來要做的事</h2>
          <p>需要你操作的項目會排在前面。</p>
        </div>
        <router-link to="/portal/dashboard?tab=cases">所有案件 →</router-link>
      </div>
      <p v-if="loading" role="status">正在讀取製作進度…</p>
      <div v-for="error in errors" :key="error" class="progress-error" role="alert">
        {{ error }}
        <button @click="load">重新讀取</button>
      </div>
      <template v-if="!loading">
        <article v-for="item in items" :key="item.key" class="progress-item" :class="{ attention: item.next.attention }">
          <span class="progress-dot" aria-hidden="true"></span>
          <div class="progress-copy">
            <small>{{ item.kindLabel }}</small>
            <h3>{{ item.name }}</h3>
            <strong>{{ item.next.title }}</strong>
            <p>{{ item.next.detail }}</p>
          </div>
          <router-link :to="item.to">{{ item.next.action }} →</router-link>
        </article>
        <div v-if="!items.length && !errors.length" class="first-project">
          <span>01</span>
          <div>
            <h3>從第一個模型開始</h3>
            <p>選擇上方的付費或免費列印，上傳 STL。送出後，這裡會顯示你的製作進度。</p>
          </div>
        </div>
      </template>
    </section>
    <section class="home-route-map" aria-label="製作流程">
      <h2>從模型到完成</h2>
      <ol>
        <li>
          <b>01</b>
          <strong>準備模型</strong>
          <span>上傳 STL 或從模型庫選取</span>
        </li>
        <li>
          <b>02</b>
          <strong>切片與確認</strong>
          <span>調整方向、參數並查看結果</span>
        </li>
        <li>
          <b>03</b>
          <strong>送出製作</strong>
          <span>付費：確認報價／免費：加入排隊</span>
        </li>
        <li>
          <b>04</b>
          <strong>追蹤與取件</strong>
          <span>查看訂單或到站操作，完成後取件</span>
        </li>
      </ol>
    </section>
  </div>
</template>
<script setup>
  import { ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import Dashboard from './Dashboard.vue'
  import { workspace } from '@/api/memberWorkspace'
  import { fetchMyCases, fetchMyOrders, fetchMyQuotes } from '@/api/customerPortal'
  import { nextMemberAction } from '@/utils/member-journey.mjs'
  const loading = ref(false),
    errors = ref([]),
    items = ref([])
  async function load() {
    if (loading.value) return
    loading.value = true
    const results = await Promise.allSettled([
      fetchMyCases(),
      fetchMyOrders(),
      workspace(''),
      workspace('/free-print/station'),
      fetchMyQuotes(),
    ])
    const labels = ['案件', '訂單', '草稿', '免費列印', '報價']
    errors.value = results.flatMap((r, i) => (r.status === 'rejected' ? [`${labels[i]}暫時無法讀取，請重試。`] : []))
    const value = (i, fallback) => (results[i].status === 'fulfilled' ? results[i].value : fallback)
    const cases = value(0, {}).cases || [],
      orders = value(1, []),
      drafts = value(2, {}).drafts || [],
      reservations = value(3, {}).reservations || [],
      quotes = value(4, [])
    const records = [
      ...cases.map((c) => ({
        key: `case:${c.id}`,
        kindLabel: '付費案件',
        name: c.project || c.caseNo,
        status: c.status,
        to: { path: '/portal/workspace', query: { section: 'case', id: c.id } },
      })),
      ...orders
        .filter((o) => !o.caseId && !['completed', 'cancelled'].includes(o.status))
        .map((o) => ({
          key: `order:${o.id}`,
          kindLabel: '訂單',
          name: o.project || o.id,
          status: o.payment?.status === 'unpaid' ? 'unpaid' : o.status,
          to: '/portal/dashboard?tab=orders',
        })),
      ...quotes
        .filter((q) => !q.orderId && q.status === 'quoted')
        .map((q) => ({
          key: `quote:${q.id}`,
          kindLabel: '報價',
          name: q.project || q.id,
          status: q.status,
          to: '/portal/dashboard?tab=quotes',
        })),
      ...reservations
        .filter((r) => !['completed', 'cancelled', 'expired'].includes(r.status))
        .map((r) => ({
          key: `free:${r.id}`,
          kindLabel: '免費列印',
          name: `水木書苑 · ${r.sequence ? `第 ${r.sequence} 號` : '列印申請'}`,
          status: r.status,
          to: '/portal/free-print',
        })),
      ...drafts
        .filter((d) => !d.caseId)
        .map((d) => ({
          key: `draft:${d.id}`,
          kindLabel: '模型草稿',
          name: d.name,
          status: 'draft',
          to: { path: '/portal/print', query: { draft: d.id } },
        })),
    ]
    items.value = records
      .filter((r) => !['completed', 'cancelled'].includes(r.status))
      .map((r) => ({ ...r, next: nextMemberAction(r.status) }))
      .sort((a, b) => Number(b.next.attention) - Number(a.next.attention))
    loading.value = false
  }
  const route = useRoute()
  watch(
    () => route.query.tab,
    (tab) => {
      if (!tab) load()
    },
    { immediate: true }
  )
</script>
<style scoped>
  .member-home {
    max-width: 1280px;
    margin: auto;
  }
  .home-heading,
  .progress-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-bottom: 28px;
  }
  .home-kicker {
    font-size: 12px;
    letter-spacing: 0.14em;
    font-weight: 700;
  }
  h1 {
    font-size: clamp(28px, 3vw, 42px);
    margin: 8px 0;
  }
  h2 {
    font-size: 23px;
    margin: 0;
  }
  p {
    color: var(--rfm-muted);
    margin: 8px 0;
  }
  button {
    padding: 10px 16px;
    border: 1px solid var(--rfm-line);
    background: white;
    cursor: pointer;
    border-radius: 8px;
    color: inherit;
  }
  .start-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }
  .start-option {
    padding: 30px;
    border-radius: 16px;
    display: block;
    border: 1px solid var(--rfm-line);
  }
  .paid {
    background: #1b3051;
    color: white !important;
  }
  .paid p {
    color: #d7e0eb;
  }
  .free {
    background: #eaf0e9;
  }
  .option-tag {
    display: inline-block;
    font-size: 12px;
    margin-bottom: 24px;
  }
  .start-option h2 {
    display: flex;
    justify-content: space-between;
    font-size: 30px;
  }
  .option-bottom {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 32px;
    padding-top: 18px;
    border-top: 1px solid #81908e55;
  }
  .option-bottom strong {
    font-size: 14px;
  }
  .quick-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    padding: 24px 0 36px;
    font-weight: 600;
    font-size: 14px;
  }
  .home-progress {
    background: white;
    border: 1px solid var(--rfm-line);
    border-radius: 16px;
    padding: 28px;
  }
  .progress-heading p {
    font-size: 14px;
  }
  .progress-heading > a {
    font-size: 14px;
    white-space: nowrap;
  }
  .progress-item {
    display: flex;
    gap: 18px;
    align-items: center;
    padding: 22px 0;
    border-top: 1px solid var(--rfm-line);
  }
  .progress-copy {
    flex: 1;
    min-width: 0;
  }
  .progress-copy h3 {
    margin: 4px 0 10px;
    font-size: 17px;
    overflow-wrap: anywhere;
  }
  .progress-copy small {
    color: var(--rfm-muted);
  }
  .progress-copy strong {
    font-size: 14px;
  }
  .progress-copy p {
    font-size: 14px;
  }
  .progress-dot {
    width: 9px;
    height: 9px;
    background: #8796a9;
    border-radius: 50%;
    flex: none;
  }
  .attention .progress-dot {
    background: #b46924;
  }
  .attention strong {
    color: #915015;
  }
  .progress-item > a {
    padding: 10px 16px;
    background: #f0f3f7;
    border-radius: 8px;
    font-weight: 600;
    font-size: 14px;
  }
  .first-project {
    display: flex;
    gap: 24px;
    padding: 30px 0;
  }
  .first-project > span {
    font-size: 38px;
    color: #8c9cb1;
  }
  .first-project h3 {
    margin: 4px 0;
  }
  .home-route-map {
    margin-top: 36px;
  }
  .home-route-map ol {
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 20px;
  }
  .home-route-map li {
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 2px solid #ced6df;
    padding-top: 18px;
  }
  .home-route-map b {
    color: #8c9cb1;
  }
  .home-route-map span {
    font-size: 13px;
    color: var(--rfm-muted);
  }
  .progress-error {
    padding: 12px;
    background: #fff5e9;
    margin-bottom: 10px;
  }
  @media (max-width: 760px) {
    .start-options {
      grid-template-columns: 1fr;
    }
    .home-heading {
      align-items: flex-start;
    }
    .start-option {
      padding: 24px;
    }
    .home-progress {
      padding: 20px;
    }
    .progress-item {
      flex-wrap: wrap;
    }
    .progress-copy {
      flex-basis: 80%;
    }
    .progress-item > a {
      margin-left: 27px;
    }
    .home-route-map ol {
      grid-template-columns: 1fr 1fr;
    }
    .quick-tools {
      gap: 16px;
    }
    .progress-heading {
      align-items: flex-start;
    }
  }
</style>
