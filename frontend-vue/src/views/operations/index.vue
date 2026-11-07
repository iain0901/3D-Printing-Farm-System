<template>
  <main class="factory-workspace brand-surface">
    <header class="factory-heading">
      <div><p class="eyebrow">3DRFM / 智慧工場</p><h1>{{ titles[section] }}</h1><p>{{ subtitles[section] }}</p></div>
      <span class="demo-badge">互動展示 · 非即時機台</span>
    </header>
    <nav class="factory-tabs" aria-label="智慧工場功能">
      <router-link v-for="(title, id) in titles" :key="id" :to="'/operations/' + id" :aria-current="section === id ? 'page' : undefined"><vab-icon :icon="icons[id]" /> {{ title }}</router-link>
    </nav>
    <div class="demo-toolbar"><span>合成資料與 AI 生成示意照片 · 操作僅儲存在此瀏覽器</span><button @click="resetVisible = true">重設展示</button></div>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>

    <template v-if="section === 'monitor'">
      <section class="factory-stats" aria-label="機台摘要"><div v-for="m in metrics" :key="m.label"><span>{{ m.label }}</span><strong>{{ m.value }}</strong></div></section>
      <div class="section-heading"><h2>機台現場</h2><div class="actions"><label>顯示 <select v-model="filter" aria-label="機台狀態篩選"><option value="all">全部機台</option><option value="printing">列印中</option><option value="error">異常</option><option value="offline">離線</option></select></label><button @click="toggleReplay">{{ replaying ? '暫停展示回放' : '播放展示事件' }}</button><button @click="nextEvent">下一筆事件</button></div></div>
      <div class="monitor-grid">
        <button v-for="p in filteredMachines" :key="p.id" class="machine-card" :class="{ selected: selectedId === p.id }" @click="selectMachine(p.id)">
          <div v-if="p.image !== null" class="photo camera" :style="sprite('/images/operations/farm-cameras.webp', p.image)"><span>AI 示意影像</span></div><div v-else class="camera missing"><vab-icon icon="video-slash" /><span>尚無影像 · 連線中斷</span></div>
          <div class="machine-body"><div class="section-heading"><b>{{ p.name }}</b><span class="status" :class="p.status">{{ statusText[p.status] }}</span></div><small>{{ p.id }} · {{ p.model }}</small><p>{{ p.job }}</p><progress :value="p.progress" max="100" :aria-label="p.name + '展示進度'" /><div class="readings"><span>{{ p.progress }}%</span><span>{{ p.status === 'printing' ? '噴嘴 245°C / 熱床 75°C' : '溫度 —' }}</span></div></div>
        </button>
      </div>
      <div class="factory-columns">
        <section class="factory-panel"><div class="section-heading"><h2>{{ selected.name }} · 狀態詳情</h2><span class="status" :class="selected.status">{{ statusText[selected.status] }}</span></div><p>{{ selected.id }} · 0.4 mm · {{ selected.material }}</p><div class="detail-metrics"><div><small>累計列印</small><b>{{ selected.hours }} h</b></div><div><small>七日異常</small><b>{{ selected.events }} 次</b></div><div><small>上次保養</small><b>{{ selected.lastService }}</b></div></div>
          <h3>噴嘴溫度趨勢 <small>展示樣本 / °C</small></h3><div v-if="selected.status === 'printing'" class="temperature-bars" aria-label="十筆合成溫度樣本"><div v-for="(t, i) in temperatures" :key="i" :style="{ height: (t - 220) * 2 + 'px' }"><span>{{ t }}</span></div></div><p v-else>離線、異常或保養中不顯示虛構溫度讀值。</p><router-link class="action-link" :to="'/operations/maintenance?printer=' + selected.id">查看保養依據與排程</router-link>
        </section>
        <section class="factory-panel"><div class="section-heading"><h2>事件日誌</h2><span>{{ replaying ? '展示回放中' : '展示回放已暫停' }}</span></div><p class="muted">{{ selected.name }} · {{ selectedLogs.length }} 筆 · 回放 {{ state.tick * 5 }} 秒</p><div class="event-list"><article v-for="log in selectedLogs" :key="log.id"><span class="event-dot" :class="log.severity" /><div><small>{{ log.time }} · {{ log.id }}</small><b>{{ log.code }}</b><p>{{ log.text }}</p></div></article><p v-if="!selectedLogs.length">這台機器尚無展示事件。</p></div></section>
      </div>
    </template>

    <template v-else-if="section === 'maintenance'">
      <section class="factory-stats"><div><span>需優先檢查</span><strong>{{ forecasts.filter(f => f.status === 'urgent').length }}</strong></div><div><span>已安排任務</span><strong>{{ state.tasks.filter(t => t.status !== 'done').length }}</strong></div><div><span>資料不足</span><strong>{{ forecasts.filter(f => f.status === 'insufficient').length }}</strong></div><div><span>比較歷史</span><strong>12 <small>個間隔</small></strong></div></section>
      <div class="factory-columns maintenance-layout"><section class="factory-panel"><h2>保養風險佇列</h2><p class="muted">從機台查看歷史，再決定檢查時段。</p><button v-for="p in state.machines" :key="p.id" class="risk-row" :class="{ selected: selectedId === p.id }" @click="selectMachine(p.id)"><span><b>{{ p.name }}</b><small>{{ p.id }}</small></span><span class="status" :class="forecastMachine(p, state.today).status">{{ riskLabel(forecastMachine(p, state.today)) }}</span></button></section>
      <section class="factory-panel"><div class="section-heading"><h2>{{ selected.name }} · 推估依據</h2><span class="demo-badge">統計規則示範</span></div><p class="forecast-reason">{{ forecast.reason }}</p><div v-if="forecast.status !== 'insufficient'" class="forecast-window"><small>建議檢查窗口</small><strong>{{ forecast.earliest }} ～ {{ forecast.latest }}</strong><span>規則計算，不代表該日一定故障。</span></div><div class="history-timeline"><article v-for="h in selected.history" :key="h.id"><time>{{ h.date }}</time><div><b>{{ h.action }}</b><p>上一個間隔 {{ h.interval }} 天 · {{ h.hours }} 小時</p><small>依據 {{ h.id }}</small></div></article></div><details><summary>錯誤日誌與跨機比較</summary><p v-for="log in selectedLogs" :key="log.id">{{ log.id }} · {{ log.text }}</p><p v-for="p in state.machines.filter(p => p.intervals.length && p.id !== selectedId)" :key="p.id">{{ p.id }}：{{ p.intervals.join(' / ') }} 天。相同機型供比較，未訓練故障模型。</p></details><div class="actions"><button class="primary" @click="openSchedule">安排人工保養</button><router-link to="/maintenance/index">開啟既有維修管理</router-link></div></section></div>
      <section class="factory-panel calendar-panel"><div class="section-heading"><div><p class="eyebrow">MAINTENANCE PLAN</p><h2>保養日曆</h2></div><div class="actions"><button aria-label="前一週" @click="weekOffset -= 7">上一週</button><button @click="weekOffset = 0">本週</button><button aria-label="下一週" @click="weekOffset += 7">下一週</button></div></div><div class="calendar-grid"><div v-for="day in days" :key="day" class="calendar-day" :class="{ today: day === state.today }"><time>{{ day.slice(5) }} <small>{{ weekday(day) }}</small></time><article v-for="task in state.tasks.filter(t => t.date === day)" :key="task.id" class="calendar-task" :class="{ done: task.status === 'done' }"><b>{{ task.time }} · {{ task.duration }} 分</b><span>{{ task.printerId }}</span><span>{{ task.title }}</span><small>{{ task.owner }} · {{ task.status === 'done' ? '已完成' : '已排程' }}</small><button v-if="task.status !== 'done'" @click="completeTask(task)">標記展示完成</button></article><small v-if="!state.tasks.some(t => t.date === day)" class="muted">未安排</small></div></div><p class="muted">可避開列印中的當日與保養重疊時段；本展示不會改動正式生產排程。</p></section>
    </template>

    <template v-else>
      <div class="quality-intro"><div><h2>每件不同，也能有依據地檢查。</h2><p>對齊模型與拍攝角度 → 檢查可見缺陷 → 人工複核</p></div><span class="demo-badge">預設情境結果 · 未呼叫 AI</span></div>
      <div class="factory-columns quality-layout"><section class="factory-panel"><h2>待驗物件</h2><button v-for="item in inspectionCases" :key="item.id" class="risk-row" :class="{ selected: caseId === item.id }" @click="selectCase(item.id)"><span><b>{{ item.title }}</b><small>{{ item.order }} · {{ item.printerId }}</small></span><vab-icon icon="chevron-right" /></button><h3>檢查條件</h3><p>模型：L 型支架 v1（展示幾何）</p><p>材料：3DSTU_PETG<br />層高：0.20 mm · 噴嘴：0.4 mm<br />範圍：缺料、分層、拉絲、輪廓</p><p class="muted">不評估內部填充、強度或精密尺寸。</p></section>
      <section class="factory-panel"><div class="section-heading"><h2>{{ currentCase.id }} · 多角度檢查</h2><span>{{ stageText }}</span></div><ol class="inspection-steps"><li :class="{ active: captured.length === 0 }">1 準備模型</li><li :class="{ active: captured.length > 0 && !result }">2 拍攝四面</li><li :class="{ active: !!result }">3 複核結果</li></ol>
        <div class="inspection-view"><div class="reference-view"><BracketReference :key="currentCase.scenario" :variant="currentCase.scenario" :angle="angle * 90" /><span>3D 幾何參考 · 尚未相機校正</span></div><div class="photo inspection-photo" :style="sprite(qualityImage, angle)"><span>AI 生成示意 · {{ angle * 90 }}°</span><div v-for="finding in (result?.findings || []).filter(f => f.angle === angle)" :key="finding.label" class="defect-marker" :style="{ left: finding.x + '%', top: finding.y + '%' }"><b>{{ finding.label }}</b></div></div></div>
        <div class="angle-tabs"><button v-for="a in [0, 1, 2, 3]" :key="a" :class="{ selected: angle === a }" @click="angle = a">{{ a * 90 }}° <span>{{ captured.includes(a) ? '✓' : '待拍' }}</span></button></div>
        <div class="actions"><button class="primary" :disabled="busy" @click="capture">{{ captured.length ? '重新回放拍攝' : '開始轉盤拍攝展示' }}</button><button :disabled="busy || !captured.length" @click="analyze">判讀展示結果</button></div><progress v-if="busy" :value="captured.length" max="4" aria-label="拍攝進度" />
        <section v-if="result" class="inspection-result" :class="result.result"><h3>{{ resultLabels[result.result] }}</h3><p>{{ result.summary }}</p><p v-for="f in result.findings" :key="f.label">{{ f.angle * 90 }}° · {{ f.label }}：{{ f.action }}</p><small>此框位置與判斷是展示標註，不是模型實際推論。</small><label>複核紀錄<textarea v-model="reviewNote" rows="2" placeholder="記錄判定依據或補拍原因" /></label><div class="actions"><button @click="review('pass')">人工確認通過</button><button @click="review('hold')">退回重印</button><button @click="review('review')">要求補拍</button></div></section>
      </section></div>
      <section class="factory-panel"><div class="section-heading"><h2>複核紀錄</h2><button :disabled="!state.reviews.length" @click="exportReport">下載展示報告</button></div><p v-if="!state.reviews.length" class="muted">完成判讀與人工複核後，這裡會留下物件、機台、結果與原因。</p><article v-for="r in state.reviews" :key="r.id" class="review-row"><b>{{ r.caseId }} · {{ r.printerId }}</b><span>{{ resultLabels[r.decision] }}</span><p>{{ r.note }}</p><small>{{ r.time }} · 展示操作員</small><router-link v-if="r.decision === 'hold'" :to="'/operations/maintenance?printer=' + r.printerId">追查機台保養</router-link></article></section>
    </template>

    <el-dialog v-model="scheduleVisible" title="安排展示保養" width="480px" class="brand-dialog"><form @submit.prevent="saveSchedule"><p>{{ selected.name }} · {{ selected.id }}</p><label>日期<input v-model="schedule.date" type="date" :min="state.today" required /></label><label>開始時間<input v-model="schedule.time" type="time" required /></label><label>時長（分鐘）<input v-model.number="schedule.duration" type="number" min="15" max="240" required /></label><label>負責人<input v-model="schedule.owner" maxlength="60" required /></label><p v-if="scheduleError" role="alert" class="error">{{ scheduleError }}</p><button class="primary" type="submit">加入展示日曆</button></form></el-dialog>
    <el-dialog v-model="resetVisible" title="重設這份展示？" width="420px" class="brand-dialog"><p>只清除此瀏覽器的展示保養、事件與複核紀錄；正式資料不受影響。</p><template #footer><button @click="resetVisible = false">保留紀錄</button><button @click="reset">重設展示資料</button></template></el-dialog>
  </main>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import BracketReference from './BracketReference.vue'
import { makeOperationsDemo, forecastMachine, scheduleMaintenance, inspectionCases, inspectionResult, replayEvent, addDays } from '@/utils/operations-demo.mjs'
const route = useRoute(), store = useStore()
const storageKey = `3drfm-operations-demo-v1:${store.getters['user/currentUser']?.id || 'staff'}`
const state = ref(makeOperationsDemo()), notice = ref(''), error = ref('')
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved?.version === 1 && saved.today === state.value.today && saved.machines?.length === 5 && Array.isArray(saved.tasks) && Array.isArray(saved.reviews) && Array.isArray(saved.logs)) state.value = saved } catch { /* Start clean when storage is unavailable. */ }
const persist = () => { try { localStorage.setItem(storageKey, JSON.stringify(state.value)) } catch { error.value = '瀏覽器無法保存展示紀錄；重新整理後可能遺失。' } }
const titles = { monitor: '機台監控', maintenance: '保養預測與日曆', quality: '多角度品管' }
const subtitles = { monitor: '先看現場，再處理需要關注的設備。', maintenance: '從歷史與異常找到檢查時機，安排到可執行的日曆。', quality: '讓每件客製列印，都留下可追溯的檢查紀錄。' }
const icons = { monitor: 'satellite-dish', maintenance: 'calendar-check', quality: 'magnifying-glass' }
const section = computed(() => route.path.split('/').at(-1))
const statusText = { printing: '列印中', error: '異常待查', maintenance: '保養中', offline: '離線' }
const selectedId = ref('DEMO-HI-01'), filter = ref('all'), replaying = ref(false)
const selected = computed(() => state.value.machines.find(p => p.id === selectedId.value) || state.value.machines[0])
const selectedLogs = computed(() => state.value.logs.filter(l => l.printerId === selected.value.id))
const filteredMachines = computed(() => state.value.machines.filter(p => filter.value === 'all' || p.status === filter.value))
const metrics = computed(() => [{ label: '列印中', value: state.value.machines.filter(p => p.status === 'printing').length }, { label: '需要關注', value: state.value.machines.filter(p => p.status === 'error').length }, { label: '保養中', value: state.value.machines.filter(p => p.status === 'maintenance').length }, { label: '離線', value: state.value.machines.filter(p => p.status === 'offline').length }])
const temperatures = computed(() => [244, 245, 246, 245, 244, 245, 246, 244, 245, 245].map((v, i) => v + ((state.value.tick + i) % 3 === 0 ? 1 : 0)))
const sprite = (url, i) => ({ backgroundImage: `url(${url})`, backgroundPosition: `${i % 2 ? 100 : 0}% ${i > 1 ? 100 : 0}%` })
function selectMachine(id) { selectedId.value = id; notice.value = ''; error.value = '' }
watch(() => route.query.printer, id => { if (state.value.machines.some(p => p.id === id)) selectedId.value = id }, { immediate: true })
let replayTimer, captureTimer
function stopReplay() { clearInterval(replayTimer); replaying.value = false }
function nextEvent() { replayEvent(state.value); persist() }
function toggleReplay() { if (replaying.value) return stopReplay(); replaying.value = true; nextEvent(); replayTimer = setInterval(() => { if (!document.hidden) nextEvent() }, 5000) }
function visibilityChanged() { if (document.hidden) stopReplay() }
onMounted(() => document.addEventListener('visibilitychange', visibilityChanged))
onBeforeUnmount(() => { stopReplay(); clearInterval(captureTimer); document.removeEventListener('visibilitychange', visibilityChanged) })
watch(section, () => { stopReplay(); clearInterval(captureTimer); busy.value = false })
const forecasts = computed(() => state.value.machines.map(p => forecastMachine(p, state.value.today)))
const forecast = computed(() => forecastMachine(selected.value, state.value.today))
const riskLabel = f => f.status === 'insufficient' ? '資料不足' : f.status === 'urgent' ? '優先檢查' : `${f.remaining} 天後檢查`
const weekOffset = ref(0)
const days = computed(() => { const day = new Date(state.value.today + 'T12:00:00Z').getUTCDay(); const start = addDays(state.value.today, -((day + 6) % 7) + weekOffset.value); return Array.from({ length: 7 }, (_, i) => addDays(start, i)) })
const weekday = day => ['日', '一', '二', '三', '四', '五', '六'][new Date(day + 'T12:00:00Z').getUTCDay()]
const scheduleVisible = ref(false), resetVisible = ref(false), scheduleError = ref(''), schedule = ref({})
function openSchedule() { scheduleError.value = ''; schedule.value = { date: forecast.value.date || addDays(state.value.today, 1), time: '14:00', duration: 60, owner: '展示工程師' }; if (selected.value.status === 'printing' && schedule.value.date === state.value.today) schedule.value.date = addDays(state.value.today, 1); scheduleVisible.value = true }
function saveSchedule() { try { const task = scheduleMaintenance(state.value, { ...schedule.value, printerId: selected.value.id }); persist(); scheduleVisible.value = false; weekOffset.value = Math.floor((Date.parse(task.date) - Date.parse(days.value[0])) / 604800000) * 7 + weekOffset.value; notice.value = `已安排 ${selected.value.name}，${task.date} ${task.time}；僅寫入展示日曆。` } catch (e) { scheduleError.value = e.message } }
function completeTask(task) { task.status = 'done'; persist(); notice.value = `${task.id} 已標記展示完成；未改動真實機台。` }
const caseId = ref('QC-023'), angle = ref(0), captured = ref([]), busy = ref(false), result = ref(null), reviewNote = ref('')
const currentCase = computed(() => inspectionCases.find(c => c.id === caseId.value))
const qualityImage = computed(() => currentCase.value.scenario === 'defect' ? '/images/operations/inspection-defect.webp' : '/images/operations/inspection-clean.webp')
const stageText = computed(() => busy.value ? `拍攝 ${captured.value.length} / 4` : result.value ? '等待人工決定' : '準備就緒')
const resultLabels = { pass: '可見外觀通過', hold: '退回檢查／重印', review: '待補拍／複核' }
function selectCase(id) { clearInterval(captureTimer); busy.value = false; caseId.value = id; angle.value = 0; captured.value = []; result.value = null; reviewNote.value = ''; notice.value = ''; error.value = '' }
function capture() { clearInterval(captureTimer); captured.value = []; result.value = null; busy.value = true; angle.value = 0; captureTimer = setInterval(() => { const n = captured.value.length; captured.value.push(n); angle.value = n; if (captured.value.length === (currentCase.value.scenario === 'missing' ? 2 : 4)) { clearInterval(captureTimer); busy.value = false; notice.value = currentCase.value.scenario === 'missing' ? '展示情境：只收到兩面影像，判讀應要求補拍。' : '四個角度展示完成，可查看判讀。' } }, 650) }
function analyze() { result.value = inspectionResult(currentCase.value, captured.value); if (result.value.findings.length) angle.value = result.value.findings[0].angle }
function review(decision) { error.value = ''; if (!reviewNote.value.trim()) { error.value = '請填寫複核理由，讓下一位同事知道判斷依據。'; return } if (decision === 'pass' && (captured.value.length < 4 || result.value?.result === 'review')) { error.value = '影像不足，請先補拍；此情境不能直接標為通過。'; return } state.value.reviews.unshift({ id: crypto.randomUUID(), caseId: caseId.value, printerId: currentCase.value.printerId, decision, note: reviewNote.value.trim(), time: new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }), source: 'synthetic-demo', automatedResult: result.value.result }); persist(); notice.value = '人工複核已保存在此瀏覽器；未修改正式訂單。' }
function exportReport() { const blob = new Blob([JSON.stringify({ source: 'synthetic-demo-not-real-inspection', reviews: state.value.reviews }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = '3drfm-demo-inspections.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }
function reset() { stopReplay(); state.value = makeOperationsDemo(); selectCase('QC-023'); selectedId.value = 'DEMO-HI-01'; weekOffset.value = 0; persist(); resetVisible.value = false; notice.value = '展示已重設。' }
</script>

<style scoped src="./operations.css"></style>
