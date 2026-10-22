<template>
  <public-shell class="station-slicer">
    <div class="studio-wrap slicer-wrap">
      <nav class="slicer-breadcrumb" aria-label="麵包屑">
        <router-link to="/free-print">免費列印</router-link>
        <span>／</span>
        <router-link :to="station.path">{{ station.name }}</router-link>
        <span>／ 線上切片</span>
      </nav>
      <header class="slicer-intro">
        <div>
          <p class="slicer-kicker">3DRFM ／ 開放切片工作台</p>
          <h1>讓模型，準備成形。</h1>
          <p>上傳、調整、切片。在送印之前，先看清每一層。</p>
        </div>
        <div class="slicer-station">
          <span>已選站點</span>
          <strong>
            {{ station.institution }}
            <br />
            {{ station.name }}
          </strong>
          <router-link to="/free-print">更換站點 ↗</router-link>
        </div>
      </header>
      <aside class="slicer-disclosure" role="note">
        <b>免登入試切片・不建立付費訂單</b>
        <p>
          目前採用 Artillery M1 Pro／0.4 mm
          噴嘴參考設定，尚未對應水木書苑的實際機台。切片結果可供準備與討論，不代表免費額度或預約成功；現階段不提供直接送印或機器控制。
        </p>
      </aside>
      <div class="slicer-grid">
        <section class="slicer-panel model-panel" aria-labelledby="model-title">
          <div class="panel-title">
            <span>01</span>
            <h2 id="model-title">放上你的模型</h2>
          </div>
          <station-layout :disabled="busy" :automatic="settings.autoArrange" @change="changeLayout" />
          <p v-if="job && !layout.files.length" class="slicer-small">已恢復先前工作。基於隱私不保留模型檔案；如要修改，請重新加入模型。</p>
        </section>
        <section class="slicer-panel" aria-labelledby="settings-title">
          <div class="panel-title">
            <span>02</span>
            <h2 id="settings-title">設定這次切片</h2>
          </div>
          <form @submit.prevent="submit">
            <fieldset :disabled="busy" class="slice-settings">
              <legend class="visually-hidden">列印設定</legend>
              <div class="fixed-material">
                <span>免費列印指定材料</span>
                <strong>3DSTU_PETG</strong>
                <p class="slicer-small">固定使用既有 PETG 切片設定，無須選擇材料。</p>
              </div>
              <label>
                層高
                <select v-model.number="settings.layerHeight">
                  <option :value="0.12">0.12 mm・細緻</option>
                  <option :value="0.16">0.16 mm・平衡</option>
                  <option :value="0.2">0.20 mm・標準</option>
                  <option :value="0.28">0.28 mm・快速</option>
                </select>
              </label>
              <div class="settings-pair">
                <label>
                  填充率（%）
                  <input v-model.number="settings.infill" type="number" min="0" max="100" required />
                </label>
                <label>
                  外壁圈數
                  <input v-model.number="settings.walls" type="number" min="1" max="12" required />
                </label>
              </div>
              <label class="check-label">
                <input v-model="settings.autoSupports" type="checkbox" />
                自動產生支撐
              </label>
              <label class="check-label">
                <input v-model="settings.autoOrient" type="checkbox" />
                交由切片器自動選擇擺放方向
              </label>
              <label class="check-label">
                <input v-model="settings.autoArrange" type="checkbox" />
                切片時由 Orca 自動排版
              </label>
              <p class="slicer-small">
                {{
                  settings.autoOrient
                    ? '切片器會重新選擇方向，結果可能與模型預覽不同；請以逐層路徑為準。'
                    : settings.autoArrange
                    ? '保留模型方向，由切片器重新安排位置；最終布局以逐層結果為準。'
                    : '保留工作台上的方向與位置，不會在切片時重新排列。'
                }}
              </p>
            </fieldset>
            <button class="studio-button slice-submit" type="submit" :disabled="!layout.ready || busy">
              {{ uploading ? '上傳模型中…' : busy ? '切片工作進行中…' : '開始切片 ↗' }}
            </button>
            <p class="slicer-small">真實 OrcaSlicer 運算，較複雜的模型可能需要數分鐘。結果不會自動送到印表機。</p>
          </form>
          <p v-if="error" class="slicer-error" role="alert">{{ error }}</p>
        </section>
      </div>
      <section class="slicer-panel slice-results" aria-labelledby="result-title" :aria-busy="busy">
        <div class="panel-title">
          <span>03</span>
          <h2 id="result-title">看見切片結果</h2>
        </div>
        <p v-if="!job">完成切片後，這裡會顯示實際預估時間、用料與逐層路徑，不使用假進度或示意結果。</p>
        <template v-else>
          <div class="slice-job-status" role="status">
            <strong>{{ statusLabel }}</strong>
            <span>{{ jobName }}</span>
          </div>
          <p class="slicer-small">
            本次設定：{{ job.materialLabel || '3DSTU_PETG' }}・層高 {{ job.layerHeight }} mm・填充 {{ job.infill }}%・{{
              job.walls
            }}
            圈外壁・{{ job.autoOrient ? '自動定向' : '保留方向' }}・{{ job.autoArrange ? '切片器自動排版' : '保留平台布局' }}・{{
              job.autoSupports ? '自動支撐' : '無支撐'
            }}
          </p>
          <p v-if="job.status === 'queued'">已送到切片佇列，等待運算服務接手；這不是現場的列印排隊。</p>
          <p v-if="job.status === 'processing'">OrcaSlicer 正在處理模型。可以保留此頁，完成後會自動顯示結果。</p>
          <p v-if="waitingLong" role="note">等待時間較長，切片服務可能忙碌或尚未啟動。此頁不會自行假設成功；可稍後回來查詢原工作。</p>
          <button
            v-if="['queued', 'processing'].includes(job.status)"
            type="button"
            class="slicer-text-button"
            :disabled="cancelling"
            @click="cancelJob"
          >
            {{ cancelling ? '取消中…' : '取消這次工作' }}
          </button>
          <p v-if="job.status === 'cancelled'">已取消。正在執行的運算可能仍會在背景結束，結果不再採用；你可以調整模型重新切片。</p>
          <p v-if="pollError" class="slicer-error" role="alert">{{ pollError }}</p>
          <button v-if="pollError" class="slicer-text-button" type="button" @click="poll">重新查詢原工作</button>
          <p v-if="job.status === 'failed'" class="slicer-error" role="alert">
            切片未完成。請檢查模型是否封閉、尺寸是否過大，或稍後重試；若持續失敗，請聯絡站點人員。
          </p>
          <details v-if="job.status === 'failed' && job.error">
            <summary>技術訊息</summary>
            <p>{{ job.error }}</p>
          </details>
          <template v-if="job.status === 'completed'">
            <div class="slice-metrics">
              <div>
                <span>預估列印時間</span>
                <strong>{{ duration(job.estimatedMinutes) }}</strong>
              </div>
              <div>
                <span>總用料</span>
                <strong>{{ grams(job.totalGrams) }} g</strong>
              </div>
              <div>
                <span>模型／支撐／其他</span>
                <strong class="metric-small">
                  {{ grams(job.modelGrams) }}／{{ grams(job.supportGrams) }}／{{ grams(job.otherGrams) }} g
                </strong>
              </div>
            </div>
            <p class="slicer-small">
              來源：{{ job.engine }} {{ job.engineVersion }} 實際切片。此為參考機型的運算預估，現場時間與用料仍可能不同。
            </p>
            <details>
              <summary>使用的參考設定與技術訊息</summary>
              <p>{{ job.profileName }}</p>
              <p v-for="(warning, i) in job.warnings" :key="i">{{ warning }}</p>
            </details>
            <layer-preview v-if="preview" :preview="preview" />
            <p v-else-if="!pollError" role="status">讀取逐層路徑中…</p>
          </template>
        </template>
      </section>
    </div>
  </public-shell>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import PublicShell from '@/components/public/PublicShell.vue'
  import StationLayout from '@/components/StationLayout.vue'
  import LayerPreview from '@/components/LayerPreview.vue'
  import { getFreePrintStation } from '@/content/freePrintStations.mjs'
  import { createStationSlice, fetchStationSlice, cancelStationSlice } from '@/api/public'

  const props = defineProps({ stationId: { type: String, required: true } })
  const station = computed(() => getFreePrintStation(props.stationId))
  const settings = reactive({
    material: 'PETG',
    layerHeight: 0.2,
    infill: 15,
    walls: 2,
    autoSupports: true,
    autoOrient: false,
    autoArrange: false,
  })
  const layout = ref({ files: [], names: [], placements: [], ready: false })
  const uploading = ref(false),
    error = ref(''),
    pollError = ref(''),
    job = ref(null),
    jobName = ref(''),
    preview = ref(null)
  const waitingLong = ref(false)
  const cancelling = ref(false)
  let pollRevision = 0
  let active = true,
    pollTimer,
    token = '',
    pollJobId = '',
    restoring = true
  const sessionKey = `3drfm-station-slice:${props.stationId}`
  const busy = computed(() => uploading.value || ['queued', 'processing'].includes(job.value?.status))
  const statusLabel = computed(
    () =>
      ({ queued: '等待切片', processing: '正在切片', completed: '切片完成', failed: '切片失敗', cancelled: '已取消切片' }[
        job.value?.status
      ] || '')
  )
  const grams = (value) => Number(value || 0).toFixed(2)
  const duration = (value) => {
    const minutes = Math.max(1, Math.ceil(value))
    return minutes >= 60 ? `${Math.floor(minutes / 60)} 小時 ${minutes % 60} 分` : `${minutes} 分鐘`
  }
  function invalidate() {
    if (restoring || busy.value) return
    clearTimeout(pollTimer)
    job.value = null
    preview.value = null
    pollError.value = ''
    token = ''
    waitingLong.value = false
    try {
      sessionStorage.removeItem(sessionKey)
    } catch {
      /* Storage is optional. */
    }
  }
  watch(settings, invalidate)
  watch(
    () => settings.autoOrient,
    (value) => {
      if (value) settings.autoArrange = true
    }
  )
  watch(
    () => settings.autoArrange,
    (value) => {
      if (!value) settings.autoOrient = false
    }
  )
  function changeLayout(value) {
    invalidate()
    layout.value = value
  }
  async function submit() {
    if (!layout.value.ready || busy.value) return
    invalidate()
    uploading.value = true
    error.value = ''
    pollError.value = ''
    try {
      const result = await createStationSlice(layout.value.files, {
        ...settings,
        material: 'PETG',
        stationId: props.stationId,
        placements: layout.value.placements,
      })
      if (!active) return
      token = result.accessToken
      job.value = result.slicingQuote
      jobName.value = layout.value.names.join('、')
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({ id: job.value.id, token, name: jobName.value }))
      } catch {
        /* Poll still works without persistence. */
      }
      poll()
    } catch (err) {
      if (active) error.value = err.response?.data?.error || '無法確認工作是否建立，請檢查網路後再試；請勿連續重複送出。'
    } finally {
      if (active) uploading.value = false
    }
  }
  async function poll() {
    clearTimeout(pollTimer)
    const id = job.value?.id
    const revision = pollRevision
    const requestKey = `${id}:${revision}`
    if (!active || !id || pollJobId === requestKey) return
    pollJobId = requestKey
    pollError.value = ''
    try {
      const result = await fetchStationSlice(id, token)
      if (!active || job.value?.id !== id || pollRevision !== revision) return
      job.value = result.slicingQuote
      waitingLong.value = ['queued', 'processing'].includes(job.value.status) && Date.now() - Date.parse(job.value.createdAt) > 120000
      if (job.value.status === 'completed') {
        const layers = await fetchStationSlice(id, token, true)
        if (active && job.value?.id === id) preview.value = layers.preview
      } else if (['queued', 'processing'].includes(job.value.status)) pollTimer = setTimeout(poll, 3000)
    } catch (err) {
      if (active && job.value?.id === id && pollRevision === revision)
        pollError.value =
          err.response?.status === 404
            ? '查不到原切片工作，可能資料已清除。請重新載入模型後再試。'
            : '暫時無法取得進度或路徑，請重新查詢；不需要重複上傳模型。'
      if (err.response?.status === 404 && active && job.value?.id === id && pollRevision === revision) {
        job.value.status = 'failed'
        try {
          sessionStorage.removeItem(sessionKey)
        } catch {
          /* optional */
        }
      }
    } finally {
      if (pollJobId === requestKey) pollJobId = ''
    }
  }
  async function cancelJob() {
    if (cancelling.value || !job.value) return
    cancelling.value = true
    pollRevision++
    clearTimeout(pollTimer)
    const id = job.value.id
    try {
      const result = await cancelStationSlice(id, token)
      if (!active || job.value?.id !== id) return
      job.value = result.slicingQuote
      waitingLong.value = false
      pollError.value = ''
      if (job.value.status === 'completed') pollTimer = setTimeout(poll, 300)
    } catch {
      if (active) pollError.value = '無法確認取消結果，請重新查詢原工作。'
    } finally {
      if (active) cancelling.value = false
    }
  }
  onMounted(async () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null')
      if (saved?.id && saved?.token) {
        token = saved.token
        jobName.value = saved.name || '先前模型'
        job.value = { id: saved.id, status: 'queued' }
        await poll()
        if (active && job.value?.material)
          for (const key of Object.keys(settings)) if (job.value[key] !== undefined) settings[key] = job.value[key]
      }
    } catch {
      /* A malformed or unavailable session must not block a fresh upload. */
    }
    await nextTick()
    restoring = false
  })
  onBeforeUnmount(() => {
    active = false
    clearTimeout(pollTimer)
  })
</script>

<style scoped>
  .fixed-material {
    display: grid;
    gap: 8px;
    padding: 16px;
    background: #f7f3e9;
  }
  .fixed-material strong {
    font-size: 22px;
  }
  .station-slicer {
    color: #192e53;
  }
  .slicer-wrap {
    padding-top: 28px;
    padding-bottom: 70px;
  }
  .slicer-breadcrumb {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 13px;
  }
  .slicer-intro {
    display: flex;
    justify-content: space-between;
    gap: 28px;
    align-items: center;
    padding: 44px 0 30px;
  }
  .slicer-kicker {
    font-size: 12px;
    letter-spacing: 0.12em;
  }
  h1 {
    font-size: clamp(32px, 4vw, 54px);
    letter-spacing: -0.05em;
    margin: 14px 0;
  }
  .slicer-intro p {
    line-height: 1.7;
  }
  .slicer-station {
    display: grid;
    gap: 8px;
    padding-left: 24px;
    border-left: 3px solid #e46635;
    min-width: 190px;
  }
  .slicer-station span,
  .slicer-station a {
    font-size: 13px;
  }
  .slicer-station strong {
    font-size: 20px;
    line-height: 1.5;
  }
  .slicer-disclosure {
    background: #eee8d9;
    border-left: 3px solid #c8491a;
    padding: 18px 22px;
    margin-bottom: 24px;
  }
  .slicer-disclosure p {
    margin: 8px 0 0;
    line-height: 1.8;
    font-size: 14px;
  }
  .slicer-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .slicer-panel {
    padding: 28px;
    background: #fffdf8;
    border: 1px solid #192e5328;
    min-width: 0;
  }
  .panel-title {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 22px;
  }
  .panel-title > span {
    color: #c8491a;
    font-size: 14px;
  }
  h2 {
    font-size: 22px;
    margin: 0;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  label {
    font-size: 14px;
    line-height: 1.6;
  }
  .slice-settings > label,
  .settings-pair label {
    display: grid;
    gap: 6px;
  }
  input[type='number'],
  select {
    border: 1px solid #192e5350;
    border-radius: 0;
    padding: 10px 12px;
    background: #fff;
    color: #192e53;
    width: 100%;
    min-width: 0;
    font: inherit;
    box-sizing: border-box;
  }
  input:focus-visible,
  select:focus-visible,
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid #203ec3;
    outline-offset: 3px;
  }
  .slice-settings {
    display: grid;
    gap: 18px;
  }
  .settings-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
  }
  .slice-settings .check-label {
    display: flex;
    align-items: start;
    gap: 10px;
  }
  input[type='checkbox'] {
    accent-color: #c8491a;
    width: 18px;
    height: 18px;
    margin-top: 2px;
    flex-shrink: 0;
  }
  .slicer-small {
    font-size: 12px;
    line-height: 1.8;
    color: #566176;
  }
  .slice-settings .slicer-small {
    margin: -8px 0 0;
  }
  .slice-submit {
    width: 100%;
    justify-content: center;
    margin-top: 28px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .slicer-text-button {
    background: none;
    border: none;
    padding: 4px 0;
    text-align: left;
    text-decoration: underline;
    color: #192e53;
    font: inherit;
    cursor: pointer;
  }
  .slicer-error {
    color: #a32e15;
    background: #fff0e9;
    padding: 12px;
    line-height: 1.7;
  }
  .slice-results {
    margin-top: 24px;
  }
  .slice-results p,
  details {
    line-height: 1.8;
    overflow-wrap: anywhere;
  }
  .slice-job-status {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    align-items: center;
    overflow-wrap: anywhere;
  }
  .slice-job-status strong {
    background: #192e53;
    color: #fff;
    padding: 6px 12px;
    font-size: 14px;
  }
  .slice-metrics {
    display: grid;
    grid-template-columns: 1fr 1fr 1.2fr;
    gap: 20px;
    margin: 24px 0;
  }
  .slice-metrics > div {
    display: grid;
    gap: 12px;
    border-top: 1px solid #192e5330;
    padding-top: 18px;
  }
  .slice-metrics span {
    font-size: 13px;
  }
  .slice-metrics strong {
    font-size: 28px;
  }
  .slice-metrics .metric-small {
    font-size: 20px;
  }
  summary {
    cursor: pointer;
    font-size: 13px;
  }
  details p {
    font-size: 12px;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @media (max-width: 900px) {
    .slicer-grid {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 560px) {
    .slicer-intro {
      align-items: start;
      flex-direction: column;
      padding-top: 28px;
    }
    .slicer-station {
      padding-left: 16px;
    }
    .slicer-panel {
      padding: 20px 16px;
    }
    .slicer-disclosure {
      padding: 16px;
    }
    .slice-metrics {
      grid-template-columns: 1fr;
    }
    .slice-metrics > div {
      gap: 8px;
    }
  }
</style>
