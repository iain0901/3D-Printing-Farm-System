<template>
  <div class="slicer-lab brand-surface" :class="{ embedded }">
    <header class="lab-header">
      <router-link v-if="!embedded" to="/" class="lab-brand">
        <brand-mark compact />
      </router-link>
      <div>
        <h1>{{ isFree ? '水木書苑・雲端切片' : '雲端切片工作區' }}</h1>
        <p>{{ isFree ? '清華大學水木書苑／3DSTU_PETG' : '模型準備、真實切片與三維路徑預覽' }}</p>
      </div>
      <div class="lab-file-actions">
        <details class="file-menu">
          <summary>檔案</summary>
          <div class="file-menu-items">
            <input ref="projectInput" class="sr-only" type="file" accept=".zip" aria-label="開啟切片專案" @change="onProjectInput" />
            <button type="button" :disabled="busy" @click="projectInput.click()">開啟專案</button>
            <button type="button" :disabled="busy" @click="openLibrary">模型庫</button>
            <button type="button" :disabled="busy || !layout.models.length" @click="saveProject">保存專案</button>
            <button v-if="!embedded" type="button" :disabled="busy || !layout.ready" @click="cloudOpen = true">雲端保存</button>
            <router-link to="/portal/workspace?section=drafts">我的草稿 →</router-link>
            <button type="button" :disabled="busy || !layout.models.length" @click="clearLocal">清除此裝置的工作</button>
          </div>
        </details>
      </div>
    </header>
    <nav class="lab-workflow" aria-label="切片工作流程">
      <button v-if="mode === 'preview'" type="button" :disabled="busy || !layout.models.length" @click="mode = 'prepare'">
        ← 返回編輯模型與參數
      </button>
      <button type="button" :aria-current="mode === 'prepare' ? 'step' : undefined" @click="mode = 'prepare'">01　準備模型</button>
      <button type="button" :disabled="!preview" :aria-current="mode === 'preview' ? 'step' : undefined" @click="mode = 'preview'">
        02　切片預覽
      </button>
      <span>{{ job ? statusText : '先匯入模型，開始你的製作。' }}</span>
    </nav>
    <main class="lab-body">
      <div class="lab-model">
        <station-layout
          v-show="mode === 'prepare'"
          ref="station"
          studio
          :empty-artwork="''"
          :disabled="busy"
          :automatic="settings.autoArrange"
          @change="changeLayout"
        />
        <toolpath-viewer
          v-if="preview && mode === 'preview'"
          ref="agentPreview"
          :preview="preview"
          :files="layout.files"
          :placements="layout.placements"
        />
      </div>
      <aside class="lab-settings" aria-label="切片設定與工作結果">
        <section class="lab-machine">
          <label v-if="agentAccess">
            <input v-model="autoIllustration" type="checkbox" />
            切片完成後自動生成 AI 成品示意（每日最多 3 次）
          </label>
          <label>
            模型用途（選填）
            <textarea v-model="agentPurpose" maxlength="1000" placeholder="例如：室內花盆支架。切片前可依用途取得參數建議。" />
          </label>
          <details>
            <summary>進階：參考機台與尺寸限制</summary>
            <div class="lab-section-title">
              <h2>機台</h2>
              <span>FDM</span>
            </div>
            <label>
              列印設定檔
              <select aria-label="切片機台" disabled>
                <option>Artillery M1 Pro・0.4 mm（參考）</option>
              </select>
            </label>
            <p>260 × 260 × 260 mm。此為可試切片的參考設定，不代表站點或新機型的實際設備。</p>
          </details>
        </section>
        <section class="lab-material">
          <div class="lab-section-title">
            <h2>耗材</h2>
            <span>{{ isFree ? '站點指定' : '參考耗材設定' }}</span>
          </div>
          <label v-if="!isFree">
            材料
            <select v-model="settings.material" :disabled="busy" aria-label="切片材料">
              <option value="PETG">PETG・優先推薦</option>
              <option value="PLA">PLA</option>
              <option value="ASA">ASA</option>
              <option value="TPU">TPU</option>
            </select>
          </label>
          <div v-else class="locked-filament">
            <span class="filament-dot" />
            <strong>3DSTU_PETG</strong>
            <small>免費列印固定材料</small>
          </div>
          <p v-if="!isFree">
            此工作區試切單色。更多材料、多色與上色需求，請使用
            <router-link to="/quote">代印工作台 →</router-link>
            。
          </p>
        </section>
        <fieldset :disabled="busy" class="lab-parameter-fieldset">
          <slicer-settings
            :settings="settings"
            :disabled="busy || layout.preparing"
            :has-models="!!layout.models.length"
            @orient="station.command('orientAll')"
            @arrange="station.command('pack')"
          />
        </fieldset>
        <section v-if="job" class="lab-result">
          <div class="lab-section-title">
            <h2>切片結果</h2>
            <span :class="'job-' + job.status">{{ statusText }}</span>
          </div>
          <p v-if="job.status === 'queued'">等待實際運算服務接手；不是現場列印排隊。</p>
          <p v-if="job.status === 'processing'">OrcaSlicer 正在處理模型，完成後自動載入路徑。</p>
          <p v-if="waitingLong">等待較久，運算服務可能忙碌或尚未啟動；可稍後重新查詢。</p>
          <p v-if="job.status === 'cancelled'">已取消工作，晚到的結果不會採用。</p>
          <p v-if="job.status === 'failed'" class="lab-error">切片未完成，請檢查模型及設定後重試。</p>
          <template v-if="job.status === 'completed'">
            <button v-if="agentAccess" :disabled="illustrationBusy" @click="makeIllustration">
              {{ illustrationBusy ? '正在生成成品示意…' : '生成 AI 成品示意圖' }}
            </button>
            <p v-if="illustrationError" role="alert">{{ illustrationError }}</p>
            <template v-if="illustration">
              <img :src="illustration" alt="AI 生成的 FDM 成品示意" style="width: 100%" />
              <p>AI 成品示意，實際尺寸、顏色、表面及強度以製作結果為準。</p>
              <a :href="illustration" download="3drfm-print-illustration.png">下載示意圖</a>
            </template>
            <div class="result-numbers">
              <div>
                <span>列印時間</span>
                <strong>{{ duration(job.estimatedMinutes) }}</strong>
              </div>
              <div>
                <span>總用料</span>
                <strong>{{ Number(job.totalGrams).toFixed(2) }} g</strong>
              </div>
            </div>
            <p>
              模型 {{ Number(job.modelGrams).toFixed(2) }} g ／支撐 {{ Number(job.supportGrams).toFixed(2) }} g ／其他
              {{ Number(job.otherGrams).toFixed(2) }} g
            </p>
            <button v-if="preview" type="button" @click="mode = 'preview'">開啟切片預覽</button>
            <p v-else-if="!pollError" role="status">正在讀取真實 G-code 路徑…</p>
            <details>
              <summary>切片來源</summary>
              <p>{{ job.engine }} {{ job.engineVersion }}</p>
              <p>{{ job.profileName }}</p>
              <p v-for="(warning, index) in job.warnings" :key="index">{{ warning }}</p>
            </details>
          </template>
          <p v-if="pollError" role="alert" class="lab-error">{{ pollError }}</p>
          <button v-if="pollError" type="button" @click="poll">重新查詢原工作</button>
          <details v-if="job.error">
            <summary>技術訊息</summary>
            <p>{{ job.error }}</p>
          </details>
        </section>
        <p v-if="error" class="lab-error" role="alert">{{ error }}</p>
        <p v-if="notice" class="lab-notice" role="status">{{ notice }}</p>
        <div class="lab-primary">
          <slicing-progress v-if="sliceProgress" :state="sliceProgress" />
          <button v-if="busy" type="button" :disabled="cancelling || uploading || previewLoading" @click="cancel">
            {{ previewLoading ? '正在載入路徑…' : cancelling ? '取消中…' : '取消切片工作' }}
          </button>
          <button v-else type="button" class="slice-button" :disabled="!layout.ready || !!parameterError" @click="submit">
            {{ job?.status === 'failed' ? '重新切片' : '開始切片' }}
          </button>
          <button v-if="isFree && job?.status === 'completed'" type="button" :disabled="busy" @click="queueOpen = true">
            加入免費列印排隊
          </button>
          <p>
            {{ isFree ? '加入排隊後，輪到你時寄 Email 通知。到場依引導準備並開始列印。' : '切片預覽不會建立付費案件、訂單或控制機器。' }}
          </p>
          <router-link v-if="isFree" to="/portal/free-print">我的排隊與列印操作 →</router-link>
          <button v-else type="button" :disabled="busy || !layout.models.length" @click="continueQuote">送出代印需求</button>
          <p v-if="parameterError" role="alert">{{ parameterError }}</p>
        </div>
      </aside>
    </main>
    <el-dialog v-model="libraryOpen" class="brand-dialog" title="從模型庫加入" width="550px">
      <p v-if="libraryBusy" role="status">正在載入模型庫…</p>
      <p v-if="libraryError" role="alert">{{ libraryError }}</p>
      <div v-for="model in libraryModels" :key="model.id" class="library-row">
        <span>{{ model.name }}</span>
        <button type="button" :disabled="libraryBusy" @click="addLibraryModel(model)">加入平台</button>
      </div>
      <p v-if="!libraryBusy && !libraryModels.length && !libraryError">目前沒有可加入的 STL 模型。</p>
      <quote-account v-if="!embedded && !memberToken" />
    </el-dialog>
    <el-dialog v-model="queueOpen" class="brand-dialog" title="加入水木書苑免費列印排隊" width="550px">
      <p>使用這次已切好的模型，固定 3DSTU_PETG。輪到你與列印完成時，都會寄 Email 通知。</p>
      <quote-account />
      <button v-if="memberToken" type="button" :disabled="queueBusy" @click="joinQueue">
        {{ queueBusy ? '正在加入…' : '確認加入排隊' }}
      </button>
      <p v-if="queueError" role="alert">{{ queueError }}</p>
    </el-dialog>
    <el-dialog v-model="cloudOpen" class="brand-dialog" title="保存到會員雲端草稿" width="550px">
      <quote-account />
      <template v-if="memberToken">
        <label class="cloud-project-label">
          草稿名稱
          <input v-model="cloudName" maxlength="120" />
        </label>
        <p>保存原始模型、方向、非等比縮放、鏡像、位置與製程設定。保存後仍不會建立訂單。</p>
        <button type="button" :disabled="cloudBusy || !layout.ready" @click="saveCloud">
          {{ cloudBusy ? '上傳保存中…' : '保存雲端草稿' }}
        </button>
        <router-link v-if="cloudId" :to="{ path: '/quote', query: { draft: cloudId } }">繼續配色或送出代印需求 →</router-link>
      </template>
      <p v-if="cloudMessage" role="status">{{ cloudMessage }}</p>
    </el-dialog>
    <footer class="lab-status">
      <span>
        {{ layout.models.length }} 個模型 ·
        {{ layout.ready ? '可開始切片' : layout.models.length ? '請確認平台範圍與間距' : '等待匯入 STL' }}
      </span>
      <span>{{ job ? statusText : '模型先在瀏覽器處理，開始切片才會上傳。' }}</span>
    </footer>
  </div>
</template>
<style scoped>
  .file-menu { position: relative; }
  .file-menu summary { cursor: pointer; padding: 10px 16px; border: 1px solid var(--rfm-line); border-radius: var(--rfm-radius-control); font-size: 16px; }
  .file-menu-items { position: absolute; z-index: 30; right: 0; top: 100%; width: 240px; max-width: calc(100vw - 32px); max-height: 70vh; overflow-y: auto; padding: 12px; background: var(--rfm-surface); border: 1px solid var(--rfm-line); box-shadow: 0 8px 20px #192e5320; }
  .file-menu .file-menu-items > button, .file-menu .file-menu-items > a { display: block; width: 100%; margin-top: 8px; text-align: left; font-size: 14px; }
  .slicer-lab .lab-settings p, .slicer-lab .lab-settings small, .slicer-lab .lab-status, .slicer-lab .lab-settings label { font-size: 14px; line-height: 1.8; }
  .slicer-lab .lab-header p { font-size: 14px; }
  .slicer-lab .lab-header h1 { font-size: 16px; }
  .lab-machine summary { cursor: pointer; font-size: 14px; margin-top: 14px; }
</style>
<script setup>
  import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { useStore } from 'vuex'
  import { useRouter } from 'vue-router'
  import { captureWorkspace, localWorkspace, checkpointWorkspace } from '@/utils/workspace-recovery.js'
  import JSZip from 'jszip'
  import StationLayout from '@/components/StationLayout.vue'
  import SlicerSettings from '@/components/SlicerSettings.vue'
  import ToolpathViewer from '@/components/ToolpathViewer.vue'
  import QuoteAccount from '@/components/QuoteAccount.vue'
  import BrandMark from '@/components/public/BrandMark.vue'
  import SlicingProgress from './SlicingProgress.vue'
  import { slicingProgress } from '@/utils/slicing-progress.mjs'
  import { workspace, uploadWorkspace, modelFile } from '@/api/memberWorkspace'
  import staffRequest from '@/utils/request'
  import { createQuoteDraft, defaultQuoteSettings } from '@/utils/quote-workspace.mjs'
  import { createStudioSlice, createStationSlice, fetchStationSlice, fetchToolpaths, cancelStationSlice } from '@/api/public'
  import { slicerSettingFields } from '@/utils/slicer-settings.mjs'
  const props = defineProps({ stationId: { type: String, default: '' }, embedded: Boolean })
  const router = useRouter()
  const queueOpen = ref(false),
    queueBusy = ref(false),
    queueError = ref('')
  async function joinQueue() {
    if (!job.value || !memberToken.value || queueBusy.value) return
    queueBusy.value = true
    queueError.value = ''
    try {
      await workspace(
        '/free-print/reservations',
        'post',
        { stationId: props.stationId, slicingQuoteId: job.value.id, sliceToken: token },
        { skipCustomerAuthRedirect: true }
      )
      queueOpen.value = false
      await router.push('/portal/free-print')
    } catch (err) {
      queueError.value = err.response?.data?.error || '加入排隊失敗，請稍後重試。'
    } finally {
      queueBusy.value = false
    }
  }
  const store = useStore(),
    memberToken = computed(() => store.getters['customerAuth/accessToken'])
  const libraryOpen = ref(false),
    libraryBusy = ref(false),
    libraryError = ref(''),
    libraryModels = ref([]),
    cloudOpen = ref(false),
    cloudBusy = ref(false),
    cloudName = ref('我的切片專案'),
    cloudMessage = ref(''),
    cloudId = ref(''),
    cloudRevision = ref(0)
  let cloudOwner = ''
  async function openLibrary() {
    libraryOpen.value = true
    libraryBusy.value = true
    libraryError.value = ''
    try {
      if (props.embedded) libraryModels.value = (store.getters['files/list'] || []).filter((f) => f.type === 'STL')
      else if (memberToken.value) {
        const result = await workspace('', 'get', undefined, { skipCustomerAuthRedirect: true })
        libraryModels.value = result.models.filter((m) => !m.archivedAt)
      } else libraryModels.value = []
    } catch {
      libraryError.value = '無法載入模型庫，請確認登入狀態後重試。'
    } finally {
      libraryBusy.value = false
    }
  }
  watch(memberToken, () => {
    if (libraryOpen.value) openLibrary()
  })
  async function addLibraryModel(model) {
    libraryBusy.value = true
    libraryError.value = ''
    try {
      const bytes = props.embedded
        ? await staffRequest({ url: `/api/files/${encodeURIComponent(model.id)}/download`, responseType: 'arraybuffer' })
        : await modelFile(model.id, false, { skipCustomerAuthRedirect: true })
      if (!libraryOpen.value) return
      station.value.selectFiles([new File([bytes], model.name, { type: 'application/octet-stream' })])
      libraryOpen.value = false
    } catch {
      libraryError.value = '無法讀取模型，請確認檔案或登入狀態。'
    } finally {
      libraryBusy.value = false
    }
  }
  async function saveCloud() {
    if (!memberToken.value || cloudBusy.value || !layout.value.ready) return
    cloudBusy.value = true
    cloudMessage.value = ''
    try {
      const slots = [{ id: 'slot-1', label: '顏色待確認', hex: '#b6c2c0' }],
        assignments = Object.fromEntries(
          layout.value.models.map((m) => [m.id, { quantity: 1, slotId: 'slot-1', bands: [], surfacePaint: {} }])
        )
      const manifest = createQuoteDraft(layout.value, { ...defaultQuoteSettings(), ...settings, colorMode: 'single' }, slots, assignments)
      const ownerId = store.getters['customerAuth/customer']?.id || ''
      const update = cloudId.value && cloudOwner === ownerId
      const result = await uploadWorkspace(
        update ? `/drafts/${cloudId.value}` : '/drafts',
        { name: cloudName.value.trim() || '我的切片專案', revision: cloudRevision.value, manifest },
        layout.value.files,
        layout.value.sources,
        update ? 'put' : 'post',
        { skipCustomerAuthRedirect: true }
      )
      cloudId.value = result.draft.id
      cloudRevision.value = result.draft.revision
      cloudOwner = ownerId
      cloudMessage.value = '已保存到會員雲端草稿，可跨裝置繼續編輯。'
    } catch (err) {
      cloudMessage.value = err.response?.data?.error || err.message || '雲端保存失敗，請重試。'
    } finally {
      cloudBusy.value = false
    }
  }
  const isFree = computed(() => !!props.stationId),
    station = ref(null),
    projectInput = ref(null),
    mode = ref('prepare')
  const settings = reactive({
    material: 'PETG',
    layerHeight: 0.2,
    infill: 15,
    walls: 2,
    autoSupports: true,
    autoOrient: false,
    autoArrange: false,
    advanced: {},
  })
  const agentPurpose = ref(''),
    agentReviewing = ref(false)
  const agentAccess = computed(() => (props.embedded ? store.getters['user/accessToken'] : memberToken.value))
  const agentPreview = ref(null),
    autoIllustration = ref(false),
    illustration = ref(''),
    illustrationBusy = ref(false),
    illustrationError = ref('')
  async function makeIllustration() {
    if (illustrationBusy.value) return
    if (mode.value !== 'preview') {
      mode.value = 'preview'
      illustrationError.value = '請等待模型預覽載入後，再按生成。'
      return
    }
    illustrationBusy.value = true
    illustrationError.value = ''
    const id = job.value?.id
    const identity = agentAccess.value
    try {
      const image = await agentPreview.value.capture()
      const result = await (props.embedded
        ? staffRequest({
            url: '/api/staff-agent/illustration',
            method: 'post',
            data: { image, material: settings.material },
            timeout: 70000,
          })
        : workspace('/../agent/illustration', 'post', { image, material: settings.material }, { timeout: 70000 }))
      if (active && id === job.value?.id && identity === agentAccess.value) illustration.value = result.image
    } catch (e) {
      illustrationError.value = e.response?.data?.error || e.message || '無法生成示意圖，請稍後重試。'
    } finally {
      illustrationBusy.value = false
    }
  }
  watch(agentAccess, () => {
    illustration.value = ''
    illustrationError.value = ''
  })
  const layout = ref({ files: [], sources: [], names: [], models: [], placements: [], ready: false }),
    job = ref(null),
    preview = ref(null),
    uploading = ref(false),
    uploadPercent = ref(null),
    previewLoading = ref(false),
    attempted = ref(false),
    cancelling = ref(false),
    waitingLong = ref(false),
    error = ref(''),
    pollError = ref(''),
    notice = ref('')
  const busy = computed(() => uploading.value || previewLoading.value || ['queued', 'processing'].includes(job.value?.status))
  const parameterError = computed(() =>
    ![0.12, 0.16, 0.2, 0.28].includes(settings.layerHeight)
      ? '請選擇有效層高。'
      : !Number.isInteger(settings.infill) || settings.infill < 0 || settings.infill > 100
      ? '填充率須為 0–100 的整數。'
      : !Number.isInteger(settings.walls) || settings.walls < 1 || settings.walls > 12
      ? '外壁圈數須為 1–12 的整數。'
      : ''
  )
  const sliceProgress = computed(() =>
    attempted.value || job.value
      ? slicingProgress({
          uploading: uploading.value,
          uploadPercent: uploadPercent.value,
          job: job.value,
          preview: preview.value,
          previewLoading: previewLoading.value,
          error: error.value,
          pollError: pollError.value,
        })
      : null
  )
  const statusText = computed(
    () =>
      ({ queued: '等待切片', processing: '正在切片', completed: '切片完成', failed: '切片失敗', cancelled: '已取消切片' }[
        job.value?.status
      ] || '')
  )
  const sessionKey = props.stationId ? `3drfm-station-slice:${props.stationId}` : '3drfm-studio-slice:reference'
  let active = true,
    timer,
    token = '',
    revision = 0,
    polling = '',
    restoring = false,
    restoringResult = false,
    downloadUrl = ''
  const duration = (value) => {
    const n = Math.max(1, Math.ceil(value))
    return n >= 60 ? `${Math.floor(n / 60)} 小時 ${n % 60} 分` : `${n} 分鐘`
  }
  function invalidate() {
    if (restoring || busy.value) return
    revision++
    attempted.value = false
    job.value = null
    preview.value = null
    illustration.value = ''
    illustrationError.value = ''
    pollError.value = ''
    token = ''
    mode.value = 'prepare'
    waitingLong.value = false
    clearTimeout(timer)
    try {
      sessionStorage.removeItem(sessionKey)
    } catch {}
  }
  function changeLayout(value) {
    if (restoringResult) {
      layout.value = value
      if (!value.preparing) {
        restoringResult = false
        poll()
      }
      return
    }
    const signature = (l) =>
      JSON.stringify(l.models.map((m) => ({ id: m.id, geometryHash: m.geometryHash, transform: m.transform, position: m.position })))
    if (signature(value) !== signature(layout.value)) invalidate()
    layout.value = value
    persistLocal()
  }
  watch(settings, invalidate, { deep: true })
  async function submit() {
    if (!layout.value.ready || busy.value || agentReviewing.value || parameterError.value) return
    if (agentPurpose.value.trim() && agentAccess.value) {
      agentReviewing.value = true
      const before = JSON.stringify(settings)
      const decision = await new Promise((resolve) =>
        window.dispatchEvent(
          new CustomEvent('3drfm:before-slice', {
            detail: {
              purpose: agentPurpose.value,
              models: layout.value.models.map((m) => ({ name: m.name || '模型', dimensions: m.dimensions || null })),
              settings: { material: settings.material, infill: settings.infill, walls: settings.walls },
              resolve,
            },
          })
        )
      )
      agentReviewing.value = false
      if (!active) return
      if (decision.infill !== undefined) settings.infill = decision.infill
      if (!decision.proceed || before !== JSON.stringify(settings)) return
    }
    invalidate()
    uploading.value = true
    attempted.value = true
    uploadPercent.value = null
    error.value = ''
    try {
      const payload = {
        ...settings,
        autoOrient: false,
        autoArrange: false,
        material: isFree.value ? 'PETG' : settings.material,
        placements: layout.value.placements,
        stationId: props.stationId || undefined,
      }
      const result = await (isFree.value ? createStationSlice : createStudioSlice)(layout.value.files, payload, (event) => {
        if (active) uploadPercent.value = event.total > 0 ? Math.min(100, Math.floor((event.loaded / event.total) * 100)) : null
      })
      if (!active) return
      job.value = result.slicingQuote
      token = result.accessToken
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify({ id: job.value.id, token, name: layout.value.names.join('、') }))
      } catch {}
      poll()
    } catch (err) {
      error.value = err.response?.data?.detail || err.response?.data?.error || '無法確認工作是否建立，請檢查網路；請勿連續重複送出。'
    } finally {
      uploading.value = false
    }
  }
  async function poll() {
    clearTimeout(timer)
    if (!active || !job.value) return
    const id = job.value.id,
      current = revision
    const pollKey = `${id}:${current}`
    if (polling === pollKey) return
    polling = pollKey
    pollError.value = ''
    try {
      const result = await fetchStationSlice(id, token)
      if (!active || revision !== current || job.value?.id !== id) return
      job.value = result.slicingQuote
      waitingLong.value = ['queued', 'processing'].includes(job.value.status) && Date.now() - Date.parse(job.value.createdAt) > 120000
      if (job.value.status === 'completed') {
        previewLoading.value = true
        const paths = await fetchToolpaths(id, token)
        if (active && revision === current) {
          preview.value = markRaw(paths.preview)
          mode.value = 'preview'
          if (autoIllustration.value && agentAccess.value) {
            await nextTick()
            makeIllustration()
          }
        }
      } else if (['queued', 'processing'].includes(job.value.status)) timer = setTimeout(poll, 2500)
    } catch (err) {
      if (active && revision === current) {
        pollError.value = err.response?.data?.error || '暫時無法取得切片進度，請重新查詢，不需重新上傳。'
        if (err.response?.status === 404) {
          job.value.status = 'failed'
          try {
            sessionStorage.removeItem(sessionKey)
          } catch {}
        }
      }
    } finally {
      if (polling === pollKey) {
        polling = ''
        previewLoading.value = false
      }
    }
  }
  async function cancel() {
    if (cancelling.value || !job.value) return
    cancelling.value = true
    revision++
    clearTimeout(timer)
    try {
      const result = await cancelStationSlice(job.value.id, token)
      if (active) job.value = result.slicingQuote
    } catch {
      pollError.value = '暫時無法確認取消結果，請重新查詢原工作。'
    } finally {
      cancelling.value = false
      if (active && job.value?.status === 'completed') {
        notice.value = '取消前引擎已完成，正在讀取這次切片結果。'
        poll()
      }
    }
  }
  function download(blob, name) {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    downloadUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = name
    a.click()
  }
  async function saveProject() {
    error.value = ''
    try {
      const zip = new JSZip()
      const project = {
        schemaVersion: '3drfm.slicer-project.v1',
        settings: JSON.parse(JSON.stringify(settings)),
        models: layout.value.models.map((m, index) => ({
          id: String(m.id),
          name: m.name,
          transform: m.transform,
          position: m.position,
          hidden: !!m.hidden,
          source: `sources/${index}.stl`,
        })),
      }
      zip.file('project.json', JSON.stringify(project, null, 2))
      for (let i = 0; i < layout.value.sources.length; i++) zip.file(`sources/${i}.stl`, await layout.value.sources[i].arrayBuffer())
      download(
        new Blob([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })], { type: 'application/zip' }),
        '3DRFM-切片專案.zip'
      )
      notice.value = '模型與製程設定已保存，可用「開啟專案」還原。'
    } catch (err) {
      error.value = err.message || '專案保存失敗'
    }
  }
  async function loadProject(file) {
    if (!file || busy.value) return
    error.value = ''
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error('專案檔案上限 12 MB')
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      const entries = Object.values(zip.files)
      if (entries.length > 14 || entries.reduce((n, f) => n + (f._data?.uncompressedSize || 0), 0) > 12 * 1024 * 1024)
        throw new Error('專案內容超過容量限制')
      const entry = zip.file('project.json')
      if (!entry) throw new Error('找不到 3DRFM 專案設定')
      const project = JSON.parse(await entry.async('string'))
      if (
        project.schemaVersion !== '3drfm.slicer-project.v1' ||
        !Array.isArray(project.models) ||
        !project.models.length ||
        project.models.length > 5
      )
        throw new Error('專案格式或模型數量不正確')
      if (layout.value.models.length && !window.confirm('開啟專案會取代目前未保存的模型與設定，確定繼續？')) return
      const s = project.settings
      if (
        !['PETG', 'PLA', 'ASA', 'TPU'].includes(s.material) ||
        ![0.12, 0.16, 0.2, 0.28].includes(s.layerHeight) ||
        !Number.isInteger(s.infill) ||
        s.infill < 0 ||
        s.infill > 100 ||
        !Number.isInteger(s.walls) ||
        s.walls < 1 ||
        s.walls > 12
      )
        throw new Error('專案製程設定無效')
      const models = []
      for (const [index, m] of project.models.entries()) {
        const src = zip.file(`sources/${index}.stl`)
        if (!src) throw new Error('專案缺少原始模型')
        const bytes = await src.async('uint8array')
        models.push({
          id: String(index + 1),
          name: String(m.name).slice(0, 180),
          file: new File([bytes], String(m.name)),
          transform: m.transform,
          position: m.position,
          hidden: !!m.hidden,
        })
      }
      if (models.reduce((n, m) => n + m.file.size, 0) > 10 * 1024 * 1024) throw new Error('模型總大小上限 10 MB')
      invalidate()
      restoring = true
      Object.assign(settings, {
        material: isFree.value ? 'PETG' : s.material,
        layerHeight: s.layerHeight,
        infill: s.infill,
        walls: s.walls,
        autoSupports: !!s.autoSupports,
        autoOrient: false,
        autoArrange: false,
        advanced: Object.fromEntries(
          slicerSettingFields.filter((f) => s.advanced?.[f.id] !== undefined).map((f) => [f.id, s.advanced[f.id]])
        ),
      })
      station.value.restoreModels(models)
      notice.value =
        '切片專案已載入；模型處理完成後即可繼續。' +
        (s.autoOrient || s.autoArrange ? ' 舊版延後定向／排版已停用，請按「立即自動朝向」或「立即自動排版」確認。' : '')
      mode.value = 'prepare'
    } catch (err) {
      error.value = err.message || '專案無法開啟'
    } finally {
      restoring = false
    }
  }
  function onProjectInput(event) {
    loadProject(event.target.files[0])
    event.target.value = ''
  }
  const recoveryKey = `slicer:${props.stationId || 'studio'}`
  let recoveryTimer,
    recovering = false,
    recoveryReady = false
  function persistLocal() {
    clearTimeout(recoveryTimer)
    if (recovering || !recoveryReady || props.embedded || layout.value.sources.some((f) => !f)) return
    checkpointWorkspace(recoveryKey, layout.value.models.length ? captureWorkspace(layout.value, settings) : null)
    recoveryTimer = setTimeout(
      () =>
        localWorkspace(recoveryKey, layout.value.models.length ? captureWorkspace(layout.value, settings) : null).catch((err) => {
          notice.value = err.message
        }),
      400
    )
  }
  watch(settings, persistLocal, { deep: true })
  async function continueQuote() {
    try {
      await localWorkspace('quote:handoff', captureWorkspace(layout.value, { ...defaultQuoteSettings(), ...settings }))
      await router.push('/quote?handoff=1')
    } catch (err) {
      error.value = err.message
    }
  }
  async function clearLocal() {
    if (!window.confirm('清除此裝置的模型與設定？雲端草稿和原始 STL 不會刪除。')) return
    await localWorkspace(recoveryKey, null)
    invalidate()
    station.value.restoreModels([])
    notice.value = '本機工作已清除。'
  }
  onMounted(async () => {
    window.dispatchEvent(new Event('3drfm:slicer-enter'))
    let savedJob
    try {
      savedJob = JSON.parse(sessionStorage.getItem(sessionKey) || 'null')
      if (savedJob?.id && savedJob.token) {
        job.value = { id: savedJob.id, status: 'queued' }
        token = savedJob.token
      }
    } catch {}
    try {
      const saved = !props.embedded && (await localWorkspace(recoveryKey))
      if (saved?.models?.length) {
        recovering = true
        restoringResult = !!savedJob?.id
        Object.assign(settings, saved.settings, { material: isFree.value ? 'PETG' : saved.settings.material })
        station.value.restoreModels(saved.models)
        notice.value = '已還原此瀏覽器上次的模型與設定。'
      }
    } catch {
    } finally {
      recovering = false
      recoveryReady = true
    }
    if (savedJob?.id && !restoringResult) poll()
  })
  onBeforeUnmount(() => {
    active = false
    revision++
    clearTimeout(timer)
    clearTimeout(recoveryTimer)
    if (!props.embedded && layout.value.models.length) localWorkspace(recoveryKey, captureWorkspace(layout.value, settings)).catch(() => {})
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  })
</script>
<style scoped>
  .slicer-lab {
    height: 100vh;
    min-height: 760px;
    display: flex;
    flex-direction: column;
    background: var(--rfm-workspace);
    color: var(--rfm-ink);
    font-family: var(--rfm-font);
    box-sizing: border-box;
  }
  .slicer-lab * {
    box-sizing: border-box;
  }
  .slicer-lab a {
    color: inherit;
    text-decoration: none;
  }
  .lab-header {
    height: 66px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 22px;
    border-bottom: 1px solid var(--rfm-line);
    padding: 0 24px;
    background: var(--rfm-surface);
  }
  .lab-brand {
    font-size: 23px;
    font-weight: 900;
    letter-spacing: -1px;
  }
  .lab-header h1 {
    font-size: 13px;
    margin: 0 0 4px;
  }
  .lab-header p {
    font-size: 9px;
    color: var(--rfm-muted);
    margin: 0;
  }
  .lab-file-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .slicer-lab button {
    font: inherit;
    font-size: 11px;
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    border-radius: var(--rfm-radius-control);
    padding: 9px 12px;
    color: inherit;
    cursor: pointer;
  }
  .slicer-lab button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .slicer-lab button:focus-visible,
  .slicer-lab a:focus-visible {
    outline: 2px solid var(--rfm-focus);
    outline-offset: 3px;
  }
  .lab-file-actions a {
    font-size: 10px;
    padding: 8px;
  }
  .lab-workflow {
    height: 45px;
    flex-shrink: 0;
    padding: 0 22px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--rfm-line);
    background: var(--rfm-paper);
  }
  .lab-workflow button {
    border: 0;
    background: none;
    font-size: 11px;
    padding: 10px 14px;
  }
  .lab-workflow button[aria-current='step'] {
    background: var(--rfm-selected);
    color: var(--rfm-ink);
    font-weight: 700;
  }
  .lab-workflow > span {
    margin-left: auto;
    color: var(--rfm-muted);
    font-size: 10px;
  }
  .lab-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 315px;
    gap: 0;
    flex: 1;
    min-height: 0;
  }
  .lab-model {
    min-width: 0;
    position: relative;
    overflow: hidden;
  }
  .lab-model :deep(.layout-editor) {
    height: 100%;
    position: relative;
  }
  .lab-model :deep(.slicer-stage),
  .lab-model :deep(.toolpath-viewer) {
    height: 100%;
    min-height: 100%;
    border-radius: 0;
  }
  .lab-model :deep(.layout-error) {
    position: absolute;
    left: 85px;
    right: 15px;
    bottom: 92px;
    padding: 10px 14px;
    background: #fff1e9f2;
    z-index: 4;
    color: #91432f;
    border-radius: var(--rfm-radius-control);
    font-size: 11px;
    margin: 0;
  }
  .lab-model :deep(.studio-preparing) {
    position: absolute;
    bottom: 98px;
    left: 85px;
    font-size: 11px;
    background: var(--rfm-surface);
    padding: 8px;
    z-index: 4;
  }
  .lab-settings {
    overflow: auto;
    min-width: 0;
    border-left: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    padding: 20px 20px 0;
  }
  .lab-settings section {
    border-bottom: 1px solid var(--rfm-line);
    padding-bottom: 18px;
    margin-bottom: 18px;
  }
  .lab-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .lab-section-title h2 {
    font-size: 12px;
    margin: 0 0 12px;
  }
  .lab-section-title span {
    font-size: 9px;
    color: var(--rfm-muted);
  }
  .lab-settings label {
    font-size: 10px;
    display: grid;
    gap: 8px;
  }
  .lab-settings select {
    padding: 9px;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    background: var(--rfm-surface);
    color: inherit;
    font: inherit;
    font-size: 11px;
  }
  .lab-settings p {
    font-size: 10px;
    line-height: 1.8;
    color: var(--rfm-muted);
  }
  .lab-settings p a {
    text-decoration: underline;
  }
  .locked-filament {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    padding: 12px;
  }
  .locked-filament strong {
    font-size: 12px;
  }
  .locked-filament small {
    margin-left: auto;
    font-size: 8px;
    color: var(--rfm-muted);
  }
  .filament-dot {
    width: 20px;
    height: 20px;
    border: 4px solid var(--rfm-line);
    border-radius: 50%;
    background: #688671;
  }
  .lab-parameter-fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    min-width: 0;
  }
  .lab-primary {
    position: sticky;
    bottom: 0;
    padding: 16px 0;
    background: var(--rfm-surface);
    border-top: 1px solid var(--rfm-line);
    backdrop-filter: blur(10px);
  }
  .slicer-lab .slice-button {
    background: var(--rfm-ink);
    color: white;
    border-color: var(--rfm-ink);
    width: 100%;
    font-size: 13px;
    padding: 12px;
  }
  .lab-primary > button {
    width: 100%;
  }
  .lab-primary > p {
    font-size: 9px;
  }
  .lab-primary > a {
    font-size: 10px;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .lab-result {
    margin-top: 22px;
  }
  .result-numbers {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .result-numbers span {
    display: block;
    font-size: 9px;
    color: var(--rfm-muted);
    margin-bottom: 5px;
  }
  .result-numbers strong {
    font-size: 17px;
    font-weight: 600;
  }
  .lab-settings .lab-error {
    color: var(--rfm-danger);
    background: var(--rfm-danger-bg);
    border: 1px solid #efcec0;
    padding: 10px;
    border-radius: var(--rfm-radius-control);
  }
  .lab-notice {
    color: var(--rfm-success) !important;
    background: var(--rfm-success-bg);
    padding: 10px;
    border-radius: var(--rfm-radius-control);
  }
  .lab-result summary {
    font-size: 10px;
    color: var(--rfm-muted);
    cursor: pointer;
  }
  .lab-result details {
    margin-top: 12px;
  }
  .lab-status {
    height: 28px;
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 0 20px;
    font-size: 9px;
    color: var(--rfm-muted);
    border-top: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
  .library-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
    padding: 12px 0;
    border-bottom: 1px solid var(--rfm-line);
  }
  .library-row span {
    overflow-wrap: anywhere;
    min-width: 0;
    font-size: 13px;
  }
  .cloud-project-label {
    display: grid;
    gap: 8px;
    margin: 16px 0;
    font-size: 12px;
  }
  .cloud-project-label input {
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    padding: 10px;
    font: inherit;
    color: inherit;
  }
  .embedded {
    height: calc(100vh - 100px);
    min-height: 720px;
  }
  .embedded .lab-header {
    padding: 0 16px;
  }
  .embedded .lab-brand {
    display: none;
  }
  @media (max-width: 900px) {
    .slicer-lab,
    .embedded {
      height: auto;
      min-height: 0;
    }
    .lab-header {
      height: auto;
      min-height: 68px;
      padding: 14px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .lab-file-actions {
      gap: 4px;
    }
    .lab-file-actions a {
      display: none;
    }
    .lab-header h1 {
      font-size: 11px;
    }
    .lab-header p {
      display: none;
    }
    .lab-file-actions button {
      font-size: 10px;
      padding: 7px;
    }
    .lab-workflow {
      padding: 0 10px;
      gap: 0;
    }
    .lab-workflow > span {
      font-size: 8px;
      max-width: 100px;
      text-align: right;
    }
    .lab-workflow button {
      font-size: 10px;
      padding: 10px;
    }
    .lab-body {
      grid-template-columns: 1fr;
    }
    .lab-model {
      height: 660px;
    }
    .lab-model:has(.toolpath-viewer) {
      height: auto;
    }
    .lab-model :deep(.toolpath-viewer) {
      height: auto;
    }
    .lab-model :deep(.slicer-stage),
    .lab-model :deep(.toolpath-viewer) {
      min-height: 660px;
    }
    .lab-settings {
      border-left: 0;
      border-top: 1px solid var(--rfm-line);
      overflow: visible;
      padding: 20px;
    }
    .lab-primary {
      position: static;
    }
    .lab-status {
      height: auto;
      min-height: 30px;
      font-size: 8px;
      padding: 8px 12px;
    }
    .lab-status span:last-child {
      max-width: 50%;
      text-align: right;
    }
    .lab-brand {
      font-size: 20px;
    }
  }
</style>
