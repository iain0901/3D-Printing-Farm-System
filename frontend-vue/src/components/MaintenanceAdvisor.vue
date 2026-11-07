<template>
  <section class="advisor" aria-label="設備診斷與跨機保養顧問">
    <h2>設備診斷與保養顧問</h2>
    <p>日誌與試印照片共同判讀；跨機保養採歷史資料推估，不是故障確診或壽命保證。所有建議先由工程師確認，不會操作機台。</p>
    <label>機台
      <select v-model="printerId" :disabled="busy" aria-label="顧問機台">
        <option value="">請選擇</option>
        <option v-for="printer in printers" :key="printer.id" :value="printer.id">{{ printer.name }}（{{ printer.id }}）</option>
      </select>
    </label>
    <details>
      <summary>日誌＋試印照片診斷</summary>
      <label>機器日誌（請先移除個資、密鑰與無關資訊）
        <textarea v-model="logs" maxlength="6000" rows="5" :disabled="busy" placeholder="貼上同一時段的警告與觀測，不要貼入憑證。" />
      </label>
      <label>試印照片（最多 3 張，每張 1 MB）<input type="file" accept="image/png,image/jpeg,image/webp" multiple :disabled="busy" @change="photosChanged" /></label>
      <p>{{ photos.map((p) => p.id).join('、') || '尚未選擇照片' }}</p>
      <label><input v-model="consent" type="checkbox" :disabled="busy" />我已檢查資料，允許將本次日誌與照片送至 OpenAI 供診斷。</label>
      <button :disabled="busy || !printerId || !logs.trim() || !photos.length || !consent" @click="diagnose">共同判讀日誌與照片</button>
    </details>
    <details>
      <summary>跨機保養資料與推估</summary>
      <p>輸入同機型、相同製程的實際累計工時及異常事件。每次保養需標記 serviced；至少兩台其他機器、三個完整保養間隔才推估。新增觀測後請重新計算。</p>
      <p>格式：<code>[{"printerId":"機台 ID","observedAt":"2026-10-01T00:00:00.000Z","totalPrintHours":100,"abnormalEvents":2,"serviced":true}]</code></p>
      <label>觀測 JSON<textarea v-model="observations" rows="5" :disabled="busy" aria-label="跨機保養觀測 JSON" /></label>
      <button :disabled="busy || !observations.trim()" @click="importObservations">驗證並保存觀測</button>
      <button :disabled="busy || !printerId" @click="forecast">重新推估保養區間</button>
      <p>運算視窗最多 200 筆。滿額時先下載完整歷史，再封存並匯入整理後的近期資料；保留每台最近保養基準及完整比較間隔。</p>
      <button :disabled="busy" @click="exportObservations">下載完整觀測</button>
      <button :disabled="busy || !exportDigest" @click="archiveObservations">封存已下載的觀測</button>
    </details>
    <p v-if="busy" role="status">正在處理，請稍候…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <h3>已保存的建議與依據</h3>
    <p v-if="!reports.length">尚無顧問紀錄。資料不足時不會捏造預測。</p>
    <article v-for="report in reports.filter((r) => r.advisorType !== 'observations')" :key="report.id">
      <h4>{{ report.advisorType === 'diagnosis' ? 'AI 日誌與照片判讀' : '跨機保養參考' }} · {{ report.printerId }}</h4>
      <p>{{ report.createdAt }} · 紀錄 {{ report.id }}</p>
      <template v-if="report.diagnosis">
        <p>{{ report.diagnosis.summary }}</p><p>限制：{{ report.diagnosis.uncertainty }}</p>
        <div v-for="(finding, index) in report.diagnosis.findings" :key="index">
          <p>{{ finding.hypothesis }}｜依據：{{ finding.logIds.join('、') }}＋{{ finding.photoIds.join('、') }}</p>
          <ul><li v-for="step in finding.nextSteps" :key="step">{{ step }}</li></ul>
        </div>
        <details><summary>保存的依據</summary><p v-for="log in report.logs" :key="log.id">{{ log.id }}：{{ log.text }}</p><p v-for="photo in report.photos" :key="photo.id">{{ photo.id }} · SHA-256 {{ photo.sha256 }}</p><p>照片只送出本次，不長期保存原圖；需要複核時請保留原始檔。</p></details>
      </template>
      <template v-if="report.forecast">
        <p v-if="report.forecast.status === 'estimate'">距人工保養檢查參考：{{ report.forecast.remainingHours[0] }}～{{ report.forecast.remainingHours[1] }} 列印小時；{{ report.forecast.peerCount }} 台其他機器／{{ report.forecast.sampleCount }} 個間隔。</p>
        <p v-else>資料不足，尚不能推估。</p>
        <p>{{ report.forecast.limitation }}</p>
        <ul><li v-for="item in report.forecast.requirements" :key="item">{{ item }}</li></ul>
        <details v-if="report.forecast.evidence"><summary>跨機比較依據</summary><p v-for="(row, index) in report.forecast.evidence" :key="index">{{ row.printerId }}：{{ row.hours }} 小時、{{ row.events }} 次異常；{{ row.from }}～{{ row.to }}</p></details>
      </template>
      <p v-if="report.linkedJobId">已建立人工維護任務：{{ report.linkedJobId }}</p>
      <button v-else-if="report.diagnosis || report.forecast?.status === 'estimate'" :disabled="busy" @click="createTask(report)">確認後建立人工檢查任務</button>
    </article>
  </section>
</template>
<script setup>
  import { onMounted, ref } from 'vue'
  import request from '@/utils/request'
  defineProps({ printers: { type: Array, default: () => [] } })
  const emit = defineEmits(['task-created'])
  const printerId = ref(''), logs = ref(''), photos = ref([]), consent = ref(false), observations = ref('')
  const busy = ref(false), error = ref(''), notice = ref(''), reports = ref([])
  const exportDigest = ref('')
  const api = (path, method = 'get', data) => request({ url: '/api/maintenance/advisor' + path, method, data, timeout: 65000 })
  async function load() { reports.value = await api('/reports') }
  async function run(fn) {
    if (busy.value) return
    busy.value = true; error.value = ''; notice.value = ''
    try { await fn(); await load() } catch (e) { error.value = e.response?.data?.error || e.message || '無法取得顧問資料。' }
    finally { busy.value = false }
  }
  async function photosChanged(event) {
    photos.value = []; error.value = ''
    const files = [...event.target.files]
    if (files.length > 3 || files.some((f) => f.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type))) {
      error.value = '請選擇最多 3 張 PNG／JPEG／WebP，每張不超過 1 MB。'; event.target.value = ''; return
    }
    try {
      photos.value = await Promise.all(files.map((file, index) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = () => reject(new Error('無法讀取照片。'))
        reader.onload = () => resolve({ id: `P${index + 1}`, image: reader.result }); reader.readAsDataURL(file)
      })))
    } catch (e) { error.value = e.message }
  }
  const diagnose = () => run(async () => {
    await api('/diagnose', 'post', { printerId: printerId.value, consent: consent.value, logs: [{ id: 'L1', text: logs.value }], photos: photos.value })
    notice.value = '判讀已保存；請核對引用依據後再決定人工處理。'
  })
  const importObservations = () => run(async () => { await api('/observations', 'post', JSON.parse(observations.value)); observations.value = ''; exportDigest.value = ''; notice.value = '觀測已保存，請重新推估。' })
  const exportObservations = () => run(async () => {
    const value = await api('/observations/export')
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = '3drfm-maintenance-observations.json'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportDigest.value = value.activeDigest; notice.value = '下載已開始，請確認檔案保存成功後才封存。'
  })
  const archiveObservations = () => {
    if (!window.confirm('已確認下載檔案完整保存？封存不會刪除歷史，但舊推估失效；需要重新匯入含保養基準的觀測才能推估。確定封存？')) return
    return run(async () => { const result = await api('/observations/archive', 'post', { confirm: true, activeDigest: exportDigest.value }); exportDigest.value = ''; notice.value = result.notice })
  }
  const forecast = () => run(async () => { await api('/forecast', 'post', { printerId: printerId.value }); notice.value = '已依最新跨機資料重新計算。' })
  const createTask = (report) => {
    if (!window.confirm('只建立人工檢查任務，不會控制機台。確定建立？')) return
    return run(async () => { await api(`/reports/${report.id}/task`, 'post', { confirm: true }); notice.value = '人工維護任務已建立。'; emit('task-created') })
  }
  onMounted(() => run(async () => {}))
</script>
<style scoped>
  .advisor { margin-top: 24px; padding: 20px; border: 1px solid #dce2e8; border-radius: 12px; }
  label { display: block; margin: 12px 0; }
  textarea { display: block; width: 100%; box-sizing: border-box; }
  button, select { min-height: 40px; margin: 4px; }
  details { margin: 12px 0; }
  article { border-top: 1px solid #dce2e8; padding: 12px 0; overflow-wrap: anywhere; }
  code { overflow-wrap: anywhere; }
</style>
