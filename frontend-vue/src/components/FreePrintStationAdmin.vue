<template>
  <section v-if="allowed" class="station-admin">
    <h2>水木書苑・自助免費列印站</h2>
    <p>指定機台、核對切片設定及耗材溫度後開放排隊。輪到使用者、列印完成與取件交棒會自動通知。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <button :disabled="busy" @click="load">更新站點狀態</button>
    <ul>
      <li v-for="reason in state.readiness" :key="reason">{{ reason }}</li>
    </ul>
    <form v-if="state.config" class="station-form" @submit.prevent="save">
      <label>
        站點機台
        <select v-model="config.printerId" required>
          <option value="">請選擇</option>
          <option v-for="p in state.printers" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </label>
      <label>
        確認可用的切片設定名稱
        <input v-model="config.profileName" list="station-profiles" required maxlength="500" />
        <datalist id="station-profiles"><option v-for="p in state.profiles" :key="p" :value="p" /></datalist>
      </label>
      <p>設定名稱必須與此機台實際驗證過的免費切片結果完全一致。機台連線請先在硬體橋接設定完成；目前支援 OctoPrint 與 Moonraker。</p>
      <label>
        噴嘴預熱 °C
        <input v-model.number="config.nozzleTemperature" type="number" min="180" max="280" required />
      </label>
      <label>
        熱床預熱 °C
        <input v-model.number="config.bedTemperature" type="number" min="0" max="110" required />
      </label>
      <label>
        允許進退料最低 °C
        <input v-model.number="config.minimumExtrudeTemperature" type="number" min="170" max="260" required />
      </label>
      <label>
        允許取件最高熱床 °C
        <input v-model.number="config.releaseBedTemperature" type="number" min="25" max="50" required />
      </label>
      <label>
        到場報到期限（分鐘）
        <input v-model.number="config.arrivalMinutes" type="number" min="5" max="120" required />
      </label>
      <label>
        到場後準備期限（分鐘）
        <input v-model.number="config.preparationMinutes" type="number" min="5" max="120" required />
      </label>
      <label>
        <input v-model="config.enabled" type="checkbox" />
        開放自助排隊與機台操作
      </label>
      <button :disabled="busy">保存站點設定</button>
    </form>
    <h3>使用時段</h3>
    <article v-for="r in state.allReservations" :key="r.id">
      <p>第 {{ r.sequence }} 號 · {{ status(r.status) }} · 會員 {{ r.customerId }}</p>
      <p v-if="r.lastError">{{ r.lastError }}</p>
      <div v-if="['attention', 'awaiting_removal', 'starting', 'printing', 'paused', 'preparing', 'notified'].includes(r.status)">
        <label>
          現場處理紀錄
          <input v-model="notes[r.id]" minlength="5" maxlength="1000" placeholder="確認機台停止、冷卻且平台已清空" />
        </label>
        <button :disabled="busy || !notes[r.id] || notes[r.id].length < 5" @click="resolve(r)">確認現場已清空，結束時段</button>
      </div>
    </article>
    <h3>Email 寄送</h3>
    <p v-for="mail in state.mail" :key="mail.id">{{ mail.subject }} · {{ mailStatus(mail.status) }}（{{ mail.attempts }} 次）</p>
  </section>
</template>
<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useStore } from 'vuex'
  import request from '@/utils/request'
  const store = useStore(),
    allowed = computed(() => ['Owner', 'Admin'].includes(store.getters['user/role']))
  const state = ref({}),
    config = reactive({}),
    notes = reactive({}),
    busy = ref(false),
    error = ref(''),
    notice = ref('')
  const root = '/api/member-service/free-print-station'
  const keys = [
    'enabled',
    'printerId',
    'profileName',
    'nozzleTemperature',
    'bedTemperature',
    'minimumExtrudeTemperature',
    'releaseBedTemperature',
    'arrivalMinutes',
    'preparationMinutes',
  ]
  const status = (s) =>
    ({
      queued: '等待',
      notified: '已通知到場',
      preparing: '準備中',
      starting: '送印中',
      printing: '列印中',
      paused: '暫停',
      awaiting_removal: '等待取件',
      attention: '需要協助',
      completed: '已完成',
      cancelled: '已取消',
      expired: '已逾時',
    }[s] || s)
  const mailStatus = (s) => ({ pending: '等待寄送', sending: '寄送中', sent: '已寄出', retry: '等待重試', failed: '寄送失敗' }[s] || s)
  function update(value) {
    state.value = value
    Object.assign(config, Object.fromEntries(keys.map((k) => [k, value.config[k]])))
  }
  async function run(fn) {
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      update(await fn())
    } catch (e) {
      error.value = e.response?.data?.error || '無法更新站點'
    } finally {
      busy.value = false
    }
  }
  async function load() {
    if (allowed.value) await run(() => request({ url: root }))
  }
  async function save() {
    await run(() => request({ url: root, method: 'put', data: { ...config } }))
    if (!error.value) notice.value = '站點設定已保存。'
  }
  async function resolve(r) {
    await run(() => request({ url: root + '/resolve', method: 'post', data: { id: r.id, bedClear: true, note: notes[r.id] } }))
  }
  onMounted(load)
</script>
<style scoped>
  .station-admin {
    padding: 24px;
    border: 1px solid var(--rfm-line);
    border-radius: 12px;
    background: var(--rfm-surface);
    color: var(--rfm-ink);
    margin: 24px 0;
  }
  .station-form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .station-form p {
    grid-column: 1/-1;
  }
  label {
    display: grid;
    gap: 8px;
  }
  input,
  select,
  button {
    font: inherit;
    padding: 10px;
    min-height: 42px;
    border: 1px solid var(--rfm-line);
    border-radius: 6px;
    background: var(--rfm-surface);
    color: inherit;
  }
  article {
    border-top: 1px solid var(--rfm-line);
    padding: 16px 0;
  }
  @media (max-width: 700px) {
    .station-form {
      grid-template-columns: 1fr;
    }
    .station-admin {
      padding: 16px;
    }
  }
</style>
