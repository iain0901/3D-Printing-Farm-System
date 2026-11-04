<template>
  <main class="operations-home">
    <header class="operations-heading">
      <div>
        <p class="overline">3DRFM · 管理工作台</p>
        <h1>今天的營運，從這裡開始。</h1>
        <p>先處理卡點，再安排製作。</p>
      </div>
      <router-link class="primary-link" to="/todos/index">查看待辦 →</router-link>
    </header>
    <p v-if="backendStatus !== 'connected'" class="connection-alert" role="alert">
      資料連線尚未確認，以下可能是上次狀態；請確認連線後再安排生產。
    </p>
    <section class="operations-metrics" aria-label="營運摘要">
      <router-link v-for="metric in metrics" :key="metric.label" :to="metric.to" :class="{ urgent: metric.urgent }">
        <span>{{ metric.label }}</span>
        <strong>{{ backendStatus === 'connected' ? metric.value : '—' }}</strong>
        <small>查看明細 →</small>
      </router-link>
    </section>
    <div class="operations-panels">
      <section class="operations-panel">
        <header>
          <h2>優先處理</h2>
          <router-link to="/todos/index">所有待辦 →</router-link>
        </header>
        <p v-if="!attention.length" class="empty-state">
          {{ backendStatus === 'connected' ? '目前沒有到期風險或設備異常。' : '等待資料連線。' }}
        </p>
        <router-link v-for="item in attention" :key="item.id" :to="item.to" class="attention-row">
          <span>
            <b>{{ item.title }}</b>
            <small>{{ item.note }}</small>
          </span>
          <span>{{ item.action }} →</span>
        </router-link>
      </section>
      <section class="operations-panel" aria-label="免費站點概況">
        <header>
          <h2>免費列印站</h2>
          <router-link v-if="isAdmin" to="/free-print-admin">管理站點 →</router-link>
        </header>
        <template v-if="isAdmin">
          <p v-if="stationError" role="alert">
            {{ stationError }}
            <button @click="loadStation">重試</button>
          </p>
          <p v-else-if="!station">正在讀取站點…</p>
          <template v-else>
            <p>{{ station.station?.availability }}</p>
            <div class="station-counts">
              <span>
                等待
                <b>{{ station.station?.queueLength ?? '—' }}</b>
              </span>
              <span>
                待協助
                <b>{{ station.allReservations?.filter((r) => r.status === 'attention').length || 0 }}</b>
              </span>
              <span>
                通知異常
                <b>{{ station.mail?.filter((m) => ['failed', 'retry'].includes(m.status)).length || 0 }}</b>
              </span>
            </div>
            <p class="muted">{{ station.readiness?.[0] || '到場準備 → 列印 → 取件交棒' }}</p>
          </template>
        </template>
        <p v-else class="muted">站點設定與時段處理由管理員負責；你的可用功能列於下方。</p>
      </section>
    </div>
    <section class="operations-tools" aria-label="管理功能">
      <div v-for="group in toolGroups" :key="group.label" class="tool-group">
        <h2>{{ group.label }}</h2>
        <div class="tool-grid">
          <router-link v-for="tool in group.items" :key="tool.to" :to="tool.to">
            <b>
              {{ tool.title }}
              <span aria-hidden="true">→</span>
            </b>
            <p>{{ tool.note }}</p>
          </router-link>
        </div>
      </div>
    </section>
    <section class="operations-panel equipment-panel">
      <header>
        <h2>設備概況</h2>
        <router-link to="/printers/index">所有設備 →</router-link>
      </header>
      <p v-if="!printers.length" class="muted">尚無設備資料；請至設備頁確認連線。</p>
      <div class="equipment-grid">
        <router-link v-for="p in printers.slice(0, 8)" :key="p.id" to="/printers/index">
          <b>{{ p.name }}</b>
          <span>{{ statusLabel(p.status) }}</span>
          <small>{{ p.model }} · {{ p.location || '未設定位置' }}</small>
        </router-link>
      </div>
    </section>
  </main>
</template>
<script>
  import { mapGetters } from 'vuex'
  import request from '@/utils/request'
  import { isDueRisk } from '@/utils/queue'
  import { visibleAdminTools } from '@/utils/admin-workspace.mjs'
  export default {
    name: 'Dashboard',
    data: () => ({ station: null, stationError: '' }),
    computed: {
      ...mapGetters({
        printers: 'printers/list',
        queue: 'queue/list',
        todos: 'queue/todos',
        permissions: 'user/permissions',
        role: 'user/role',
        backendStatus: 'app/backendStatus',
      }),
      isAdmin() {
        return ['Owner', 'Admin'].includes(this.role)
      },
      dueSoon() {
        return this.queue.filter(isDueRisk)
      },
      problemPrinters() {
        return this.printers.filter((p) => ['error', 'offline', 'maintenance'].includes(p.status))
      },
      metrics() {
        return [
          {
            label: '待製作工作',
            value: this.queue.filter((j) => !['complete', 'cancelled'].includes(j.status)).length,
            to: '/queue/index',
          },
          { label: '到期風險', value: this.dueSoon.length, to: '/scheduler/index', urgent: !!this.dueSoon.length },
          { label: '需確認設備', value: this.problemPrinters.length, to: '/printers/index', urgent: !!this.problemPrinters.length },
          { label: '待辦事項', value: this.todos.length, to: '/todos/index' },
        ]
      },
      attention() {
        return [
          ...this.problemPrinters.map((p) => ({
            id: 'p-' + p.id,
            title: p.name,
            note: this.statusLabel(p.status),
            to: '/printers/index',
            action: '確認設備',
          })),
          ...this.dueSoon.map((j) => ({
            id: 'j-' + j.id,
            title: j.file,
            note: '交期：' + (j.due || '待確認'),
            to: '/scheduler/index',
            action: '調整排程',
          })),
          ...this.todos.map((t) => ({
            id: 't-' + t.id,
            title: t.title,
            note: t.owner || '待認領',
            to: '/todos/index',
            action: '處理待辦',
          })),
        ].slice(0, 5)
      },
      toolGroups() {
        const tools = visibleAdminTools(this.permissions)
        return ['接單與服務', '生產與設備', 'AI 與整合']
          .map((label) => ({ label, items: tools.filter((t) => t.group === label) }))
          .filter((g) => g.items.length)
      },
    },
    mounted() {
      this.loadStation()
    },
    methods: {
      statusLabel(s) {
        return (
          { idle: '閒置', printing: '列印中', paused: '暫停', error: '異常', offline: '離線', maintenance: '維護中' }[s] || '狀態待確認'
        )
      },
      async loadStation() {
        if (!this.isAdmin) return
        this.stationError = ''
        try {
          this.station = await request({ url: '/api/member-service/free-print-station' })
        } catch {
          this.stationError = '站點狀態讀取失敗，請重試。'
        }
      },
    },
  }
</script>
<style scoped>
  .operations-home {
    padding: 32px;
    color: var(--rfm-ink);
    background: var(--rfm-workspace);
    min-height: 100vh;
  }
  .operations-heading,
  .operations-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: clamp(24px, 3vw, 34px);
    margin: 10px 0;
  }
  h2 {
    font-size: 19px;
    margin: 0;
  }
  p {
    line-height: 1.65;
  }
  a {
    color: inherit;
    text-decoration: none;
  }
  a:focus-visible,
  button:focus-visible {
    outline: 2px solid var(--rfm-focus);
    outline-offset: 3px;
  }
  .overline,
  .muted,
  .operations-heading p,
  .empty-state {
    color: var(--rfm-muted);
  }
  .overline {
    font-size: 12px;
    letter-spacing: 0.1em;
  }
  .primary-link {
    padding: 14px 20px;
    background: var(--rfm-ink);
    color: white;
    border-radius: 8px;
  }
  .operations-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 24px 0;
  }
  .operations-metrics a {
    padding: 22px;
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    border-radius: 12px;
    display: grid;
    gap: 12px;
  }
  .operations-metrics strong {
    font-size: 32px;
  }
  small {
    color: var(--rfm-muted);
  }
  .urgent strong {
    color: #a34231;
  }
  .operations-panels {
    display: grid;
    grid-template-columns: 1.3fr 1fr;
    gap: 20px;
  }
  .operations-panel {
    background: var(--rfm-surface);
    border: 1px solid var(--rfm-line);
    padding: 24px;
    border-radius: 12px;
    min-width: 0;
  }
  .operations-panel header {
    margin-bottom: 18px;
  }
  .attention-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 14px 0;
    border-top: 1px solid var(--rfm-line);
    font-size: 13px;
  }
  .attention-row small {
    display: block;
    margin-top: 6px;
  }
  .attention-row b {
    overflow-wrap: anywhere;
  }
  .station-counts {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    margin: 24px 0;
  }
  .station-counts b {
    display: block;
    margin-top: 10px;
    font-size: 25px;
  }
  .tool-group {
    margin: 28px 0;
  }
  .tool-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-top: 16px;
  }
  .tool-grid a {
    background: var(--rfm-surface);
    border: 1px solid var(--rfm-line);
    padding: 20px;
    border-radius: 10px;
  }
  .tool-grid a:hover {
    border-color: var(--rfm-ink);
  }
  .tool-grid b {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .tool-grid p {
    color: var(--rfm-muted);
    margin-bottom: 0;
    font-size: 13px;
  }
  .equipment-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
  }
  .equipment-grid a {
    display: grid;
    gap: 10px;
    padding: 16px;
    background: var(--rfm-paper);
    border-radius: 8px;
    overflow-wrap: anywhere;
  }
  .connection-alert {
    background: #fff5df;
    border: 1px solid #d8bd87;
    padding: 16px;
    border-radius: 8px;
  }
  @media (max-width: 900px) {
    .operations-panels {
      grid-template-columns: 1fr;
    }
    .tool-grid,
    .equipment-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 550px) {
    .operations-home {
      padding: 20px 12px;
    }
    .operations-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .operations-metrics a,
    .operations-panel {
      padding: 16px;
    }
    .tool-grid,
    .equipment-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
