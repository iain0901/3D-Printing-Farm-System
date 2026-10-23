<template>
  <public-shell class="quote-workbench">
    <div class="studio-wrap workbench-wrap">
      <header class="workbench-intro">
        <div>
          <p class="workbench-kicker">3DRFM ／ 線上切片估價</p>
          <h1>把想法，放上列印平台。</h1>
          <p>調整模型、選擇耗材，讓每個顏色都有自己的位置。</p>
        </div>
        <button class="text-button" type="button" @click="askSpecialist">需要建模或轉檔？專員協助 ↗</button>
      </header>
      <div class="workbench-file-actions">
        <input ref="archiveInput" class="sr-only" type="file" accept=".zip" aria-label="開啟完整代印專案" @change="openArchive" />
        <button type="button" @click="archiveInput.click()">開啟完整專案</button>
        <button type="button" :disabled="!!storageIssues.length" @click="downloadArchive">下載完整專案 ZIP</button>
        <button type="button" :disabled="!layout.models.length" @click="clearLocal">清除此裝置的工作</button>
        <span>此瀏覽器會保留工作。共用裝置使用完畢請清除。</span>
      </div>
      <p v-if="service" class="service-note">已帶入「{{ service.title }}」的用途說明，可在製作備註調整。</p>
      <aside class="backend-notice" role="note">
        <b>先準備模型與設定，新機型切片估價即將接上。</b>
        <p>
          可調整擺放、選材與配色，登入後保存雲端草稿或送交專員報價。260 × 260 × 260 mm
          為編輯參考平台；自動切片價格將於新機型設定完成後開放。
        </p>
      </aside>
      <nav class="workbench-steps" aria-label="估價流程">
        <a href="#quote-models" @click.prevent="focusSection('quote-models')">
          <span>01</span>
          模型與擺放
        </a>
        <a href="#quote-settings" @click.prevent="focusSection('quote-settings')">
          <span>02</span>
          耗材與配色
        </a>
        <button type="button" @click="review">
          <span>03</span>
          登入與確認
        </button>
      </nav>
      <div class="workbench-grid">
        <section id="quote-models" class="workbench-panel model-panel" tabindex="-1" aria-labelledby="quote-model-title">
          <div class="panel-heading">
            <span>01</span>
            <div>
              <h2 id="quote-model-title">你的模型，你來安排。</h2>
              <p>手動擺放，或讓工具先排好一版。</p>
            </div>
          </div>
          <station-layout
            ref="stationLayout"
            studio
            empty-artwork="upload"
            :automatic="settings.autoArrange"
            :model-appearance="appearance"
            :painting="painting"
            empty-hint="先加入 STL，再調整方向、位置與配色。登入並保存草稿時會上傳模型。"
            @change="changeLayout"
            @paint="paintStroke"
          >
            <template #surface-tools="{ model }">
              <section v-if="settings.colorMode === 'multi'" class="surface-tools" aria-label="模型表面上色工具">
                <h3>直接為 {{ model.name }} 上色</h3>
                <div class="paint-tool-buttons" aria-label="上色操作">
                  <button
                    v-for="tool in paintTools"
                    :key="tool.id"
                    type="button"
                    :aria-pressed="paintTool === tool.id"
                    @click="paintTool = tool.id"
                  >
                    {{ tool.label }}
                  </button>
                </div>
                <div class="field-pair">
                  <label class="field">
                    筆刷色槽
                    <select v-model="paintSlot" aria-label="筆刷色槽">
                      <option v-for="(slot, index) in slots" :key="slot.id" :value="slot.id">{{ index + 1 }}・{{ slot.label }}</option>
                    </select>
                  </label>
                  <label class="field">
                    筆刷半徑（mm）
                    <input v-model.number="paintRadius" type="range" min="1" max="30" step="1" />
                    <span>{{ paintRadius }} mm</span>
                  </label>
                </div>
                <div class="paint-tool-buttons">
                  <button type="button" :disabled="!paintHistory[model.id]?.undo.length" @click="undoPaint(model.id)">復原上色</button>
                  <button type="button" :disabled="!paintHistory[model.id]?.redo.length" @click="redoPaint(model.id)">重做上色</button>
                  <button
                    type="button"
                    :disabled="!Object.keys(assignments[model.id]?.surfacePaint || {}).length"
                    @click="clearPaint(model.id)"
                  >
                    清除模型上色
                  </button>
                </div>
                <p class="workbench-note" role="status">
                  已塗色 {{ Object.keys(assignments[model.id]?.surfacePaint || {}).length }}／{{ model.triangleCount }}
                  個三角面。表面塗色優先於高度換色，橡皮擦會恢復高度色或基底色。
                </p>
                <p class="workbench-note">
                  筆刷沿相連、相近朝向的三角面上色；平面填色以點選面的方向為準（夾角 30°
                  內），不跨越分離零件。低面數模型會有較粗的上色邊界；手機可切換旋轉模式查看另一面。
                </p>
              </section>
              <p v-else class="workbench-note">想直接在模型上塗色？請在右側選擇「多色列印」。</p>
            </template>
          </station-layout>
          <p class="workbench-note">
            目前工作台接受 STL，支援三角面上色。3MF 多物件與 STEP 轉檔請先由專員處理；不會把整份多色 3MF 當成單色檔送出。
          </p>
        </section>
        <section id="quote-settings" class="workbench-panel settings-panel" tabindex="-1" aria-labelledby="quote-settings-title">
          <div class="panel-heading">
            <span>02</span>
            <div>
              <h2 id="quote-settings-title">材質與顏色，都是設計的一部分。</h2>
              <p>同一平台使用同種材料；不同材質請分開製作。</p>
            </div>
          </div>
          <label class="field">
            列印材料
            <select v-model="settings.material" aria-label="列印材料">
              <option v-for="material in quoteMaterials" :key="material.id" :value="material.id">
                {{ material.label }}{{ material.recommended ? '・優先推薦' : '' }}
              </option>
            </select>
          </label>
          <p class="material-note">{{ material.note }}</p>
          <div class="color-illustrated-tip">
            <instruction-art kind="color" />
            <p>先整理基底色與色槽。螢幕配色用來溝通，不代表已完成多色切片。</p>
          </div>
          <fieldset class="color-mode">
            <legend>配色方式</legend>
            <label>
              <input v-model="settings.colorMode" type="radio" value="single" />
              單色列印
            </label>
            <label>
              <input v-model="settings.colorMode" type="radio" value="multi" />
              多色列印
            </label>
          </fieldset>
          <div class="slots-heading">
            <h3>{{ settings.colorMode === 'single' ? '成品顏色' : '設定耗材色槽' }}</h3>
            <button v-if="settings.colorMode === 'multi'" type="button" :disabled="slots.length >= MAX_COLOR_SLOTS" @click="addSlot">
              ＋ 新增色槽
            </button>
          </div>
          <div v-for="(slot, index) in visibleSlots" :key="slot.id" class="color-slot">
            <div class="slot-top">
              <b>{{ settings.colorMode === 'single' ? '主要顏色' : `色槽 ${index + 1}` }}</b>
              <span>{{ material.label }}</span>
              <button
                v-if="settings.colorMode === 'multi'"
                type="button"
                :disabled="slots.length <= 2"
                :aria-label="`移除色槽 ${index + 1}`"
                @click="removeSlot(slot.id)"
              >
                移除
              </button>
            </div>
            <div class="slot-inputs">
              <label class="swatch-input">
                <span class="sr-only">{{ `色槽 ${index + 1} 色碼` }}</span>
                <input v-model="slot.hex" type="color" :aria-label="`色槽 ${index + 1} 色碼`" />
              </label>
              <label class="field">
                <span class="sr-only">{{ `色槽 ${index + 1} 色名` }}</span>
                <input v-model="slot.label" :aria-label="`色槽 ${index + 1} 色名`" maxlength="60" placeholder="色名或色號說明" />
              </label>
            </div>
            <div class="palette" :aria-label="`色槽 ${index + 1} 常用色`">
              <button
                v-for="color in quotePalette"
                :key="color.hex"
                type="button"
                :style="{ background: color.hex }"
                :aria-label="`色槽 ${index + 1} 選擇${color.label}`"
                :aria-pressed="slot.hex === color.hex"
                @click="chooseColor(slot, color)"
              />
            </div>
          </div>
          <p class="workbench-note">
            螢幕顏色僅供溝通，非現貨色卡或精準色差保證。{{
              settings.colorMode === 'multi'
                ? '最多 8 個色槽為介面編輯上限，不代表新機型支援 8 色；相容耗材、可用色數及換料耗損需由後端確認。移除色槽會將使用該色的設定改到第一個保留色槽。'
                : '實際供應顏色將依耗材設定確認。'
            }}
          </p>
          <section v-if="layout.models.length" class="model-assignments" aria-label="模型配色與數量">
            <h3>每個模型的製作設定</h3>
            <article v-for="model in layout.models" :key="model.id" class="assignment-card">
              <h4>{{ model.name }}</h4>
              <div class="field-pair">
                <label class="field">
                  {{ model.name }} 數量
                  <input v-model.number="assignments[model.id].quantity" type="number" min="1" max="10000" step="1" />
                </label>
                <label v-if="settings.colorMode === 'multi'" class="field">
                  {{ model.name }} 基底色
                  <select v-model="assignments[model.id].slotId" :aria-label="`${model.name} 基底色`">
                    <option v-for="(slot, index) in slots" :key="slot.id" :value="slot.id">{{ index + 1 }}・{{ slot.label }}</option>
                  </select>
                </label>
              </div>
              <template v-if="settings.colorMode === 'multi'">
                <div class="bands-heading">
                  <span>同一模型按高度換色</span>
                  <button
                    type="button"
                    :disabled="!model.dimensions || assignments[model.id].bands.length >= MAX_HEIGHT_BANDS"
                    :aria-label="`${model.name} 新增換色區間`"
                    @click="addBand(model)"
                  >
                    ＋ 區間
                  </button>
                </div>
                <div v-for="(band, index) in assignments[model.id].bands" :key="band.id" class="height-band">
                  <div class="field-pair">
                    <label class="field">
                      起始高度（mm）
                      <input
                        v-model.number="band.from"
                        :aria-label="`${model.name} 區間 ${index + 1} 起始高度`"
                        type="number"
                        min="0"
                        :max="model.dimensions?.[2]"
                        step="0.01"
                      />
                    </label>
                    <label class="field">
                      結束高度（mm）
                      <input
                        v-model.number="band.to"
                        :aria-label="`${model.name} 區間 ${index + 1} 結束高度`"
                        type="number"
                        min="0"
                        :max="model.dimensions?.[2]"
                        step="0.01"
                      />
                    </label>
                  </div>
                  <div class="band-bottom">
                    <label class="field">
                      區間色槽
                      <select v-model="band.slotId" :aria-label="`${model.name} 區間 ${index + 1} 色槽`">
                        <option v-for="(slot, slotIndex) in slots" :key="slot.id" :value="slot.id">
                          {{ slotIndex + 1 }}・{{ slot.label }}
                        </option>
                      </select>
                    </label>
                    <button
                      type="button"
                      :aria-label="`${model.name} 移除區間 ${index + 1}`"
                      @click="assignments[model.id].bands.splice(index, 1)"
                    >
                      移除
                    </button>
                  </div>
                </div>
                <p class="workbench-note">
                  高度以調整後模型底部為 0；區間以外保留基底色。3D 僅預覽配色，不是實際切片層；換色層高將由新切片設定確認。
                </p>
              </template>
            </article>
            <p class="workbench-note">平台目前顯示每個模型一份；訂購多份時，實際排盤與平台數由後端切片決定。</p>
          </section>
          <details class="print-settings" open>
            <summary>列印品質與排列偏好</summary>
            <label class="field">
              層高
              <select v-model.number="settings.layerHeight" aria-label="層高">
                <option :value="0.12">0.12 mm・細緻</option>
                <option :value="0.16">0.16 mm・平衡</option>
                <option :value="0.2">0.20 mm・標準</option>
                <option :value="0.28">0.28 mm・快速</option>
              </select>
            </label>
            <div class="field-pair">
              <label class="field">
                填充率（%）
                <input v-model.number="settings.infill" type="number" min="0" max="100" step="1" />
              </label>
              <label class="field">
                外壁圈數
                <input v-model.number="settings.walls" type="number" min="1" max="12" step="1" />
              </label>
            </div>
            <label class="check-field">
              <input v-model="settings.autoSupports" type="checkbox" />
              自動產生支撐
            </label>
            <div class="field-pair">
              <button
                type="button"
                :disabled="hasHeightBands || !layout.models.length || layout.preparing"
                @click="stationLayout.command('orientAll')"
              >
                立即自動朝向
              </button>
              <button type="button" :disabled="!layout.models.length || layout.preparing" @click="stationLayout.command('pack')">
                立即自動排版
              </button>
            </div>
            <p class="workbench-note">
              {{
                hasHeightBands
                  ? '已設定高度換色，固定目前模型方向；若再旋轉或縮放，請重新確認換色範圍。'
                  : '按下即調整工作台；自動朝向以最短包圍軸作為高度並重新排版，不保證支撐最少。保留畫面中的方向與位置。'
              }}
            </p>
          </details>
          <label class="field">
            希望完成日期
            <input v-model="settings.dueDate" type="date" />
          </label>
          <label class="check-field">
            <input v-model="settings.rush" type="checkbox" />
            需要急件評估（非交期承諾）
          </label>
          <label class="field">
            製作備註
            <textarea v-model="settings.notes" rows="3" maxlength="4000" placeholder="用途、尺寸公差、配色說明或組裝需求" />
          </label>
          <slicer-settings :settings="settings" advanced-only />
          <p v-if="issues.length && layout.models.length" class="validation-note" role="status">{{ issues[0] }}</p>
          <button class="primary-button" type="button" :disabled="!!issues.length" @click="review">確認設定，帶入會員資料 ↗</button>
        </section>
      </div>
      <section id="quote-review" class="workbench-panel review-panel" tabindex="-1" aria-labelledby="quote-review-title">
        <div class="panel-heading">
          <span>03</span>
          <div>
            <h2 id="quote-review-title">登入與確認製作需求</h2>
            <p>會員資料與模型設定分開保護，不將密碼寫入草稿。</p>
          </div>
        </div>
        <p v-if="!reviewing">完成模型與配色後，按下「確認設定」即可在此登入或註冊。</p>
        <template v-else>
          <p v-if="authNotice" class="validation-note" role="alert">{{ authNotice }}</p>
          <quote-account />
          <div v-if="memberToken" class="cloud-draft-panel">
            <h3>保存到會員工作台</h3>
            <label class="field">
              草稿名稱
              <input v-model="cloudName" maxlength="120" placeholder="例如：專題外殼・第二版" />
            </label>
            <label class="field">
              所屬專案
              <select v-model="cloudProject" aria-label="所屬專案">
                <option value="">未分類</option>
                <option v-for="project in cloudProjects" :key="project.id" :value="project.id">{{ project.name }}</option>
              </select>
            </label>
            <button type="button" :disabled="cloudBusy || !!storageIssues.length" @click="saveCloud(false)">
              {{ cloudBusy ? '保存中…' : submittedCaseId ? '另存新草稿' : '保存雲端草稿' }}
            </button>
            <label class="check-field">
              <input v-model="autosaveEnabled" type="checkbox" :disabled="!cloudId" />
              自動保存後續修改（需先保存一次）
            </label>
            <p v-if="cloudMessage" role="status">{{ cloudMessage }}</p>
            <router-link to="/portal/workspace?section=drafts">查看我的雲端草稿 ↗</router-link>
            <h3>送出製作需求</h3>
            <label class="field">
              交付方式
              <select v-model="deliveryMethod" aria-label="交付方式">
                <option value="pickup">現場取件（地點由專員確認）</option>
                <option value="delivery">配送</option>
              </select>
            </label>
            <label v-if="deliveryMethod === 'delivery'" class="field">
              收件地址
              <select v-model="addressId" aria-label="收件地址">
                <option value="">請選擇地址</option>
                <option v-for="address in addresses" :key="address.id" :value="address.id">
                  {{ address.recipient }}・{{ address.line1 }}
                </option>
              </select>
            </label>
            <router-link v-if="deliveryMethod === 'delivery' && !addresses.length" to="/portal/dashboard?tab=addresses">
              新增收件地址 ↗
            </router-link>
            <label class="check-field">
              <input v-model="checksAccepted" type="checkbox" />
              我已確認材料、尺寸與配色；支撐痕跡、薄壁及強度仍需專員檢查，價格與交期以正式報價為準。
            </label>
            <button
              class="primary-button"
              type="button"
              :disabled="cloudBusy || !!issues.length || !checksAccepted || !!submittedCaseId"
              @click="submitCloud"
            >
              {{ submittedCaseId ? '此草稿已送出' : '送交專員確認報價' }}
            </button>
            <router-link v-if="submittedCaseId" :to="{ path: '/portal/workspace', query: { section: 'case', id: submittedCaseId } }">
              查看已送出的案件 ↗
            </router-link>
          </div>
          <div class="draft-summary">
            <h3>本次設定摘要</h3>
            <p>
              {{ material.label }}・{{ layout.models.length }} 個模型・共 {{ totalQuantity }} 份・{{
                settings.colorMode === 'multi' ? '多色' : '單色'
              }}／{{ visibleSlots.length }} 個色槽
            </p>
            <p>層高 {{ settings.layerHeight }} mm・填充 {{ settings.infill }}%・外壁 {{ settings.walls }} 圈</p>
            <p>
              模型重量、支撐與換料耗材、列印時間、價格：
              <b>待新機型切片</b>
            </p>
            <button type="button" :disabled="!!issues.length" @click="downloadDraft">下載設定草稿（JSON）</button>
            <p class="workbench-note">
              JSON 僅供查看設定，不含模型。需要繼續編輯、還原配色時，請使用上方「下載完整專案 ZIP」。本機會自動保存此頁工作。
            </p>
          </div>
        </template>
        <p v-if="error" class="validation-note" role="alert">{{ error }}</p>
        <p v-if="downloaded" role="status">設定草稿已下載，尚未上傳模型或建立案件。</p>
        <div class="quote-not-ready">
          <div>
            <span>切片結果與價格</span>
            <strong>尚待新機型設定</strong>
            <small>不套用免費列印設定，也不以舊機型價格代算。</small>
          </div>
          <button type="button" disabled>切片並取得報價（尚未開放）</button>
        </div>
      </section>
    </div>
  </public-shell>
</template>

<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { onBeforeRouteLeave } from 'vue-router'
  import { captureWorkspace, localWorkspace, exportWorkspace, importWorkspace, checkpointWorkspace } from '@/utils/workspace-recovery.js'
  import { useStore } from 'vuex'
  import { workspace, uploadWorkspace, modelFile } from '@/api/memberWorkspace'
  import { fetchAddresses } from '@/api/customerPortal'
  import PublicShell from '@/components/public/PublicShell.vue'
  import InstructionArt from '@/components/public/InstructionArt.vue'
  import StationLayout from '@/components/StationLayout.vue'
  import SlicerSettings from '@/components/SlicerSettings.vue'
  import QuoteAccount from '@/components/QuoteAccount.vue'
  import { applyPaintChanges, appendPaintHistory } from '@/utils/surface-paint.mjs'
  import { getService, inquiryNotes } from '@/content/fdmServices.mjs'
  import {
    quoteMaterials,
    quotePalette,
    MAX_COLOR_SLOTS,
    MAX_HEIGHT_BANDS,
    defaultQuoteSettings,
    validateQuoteDraft,
    createQuoteDraft,
    modelAppearance,
  } from '@/utils/quote-workspace.mjs'
  const emit = defineEmits(['assistance'])
  const authNotice = ref('')
  const store = useStore(),
    stationLayout = ref(null)
  const memberToken = computed(() => store.getters['customerAuth/accessToken'])
  const cloudName = ref('我的列印草稿'),
    cloudId = ref(''),
    cloudRevision = ref(0),
    cloudProject = ref(''),
    cloudProjects = ref([]),
    cloudBusy = ref(false),
    cloudMessage = ref(''),
    autosaveEnabled = ref(false),
    submittedCaseId = ref(''),
    addresses = ref([]),
    addressId = ref(''),
    deliveryMethod = ref('pickup'),
    checksAccepted = ref(false)
  let autosaveTimer,
    cloudGeneration = 0,
    restoringCloud = false
  const router = useRouter(),
    route = useRoute(),
    service = computed(() => getService(route.query.service))
  const settings = reactive({
    ...defaultQuoteSettings(),
    notes: inquiryNotes(route.query.service),
    rush: route.query.service === 'rush-print',
  })
  const layout = ref({ files: [], models: [], names: [], placements: [], ready: false })
  const slots = reactive([{ id: 'slot-1', ...quotePalette[0] }]),
    assignments = reactive({})
  // Preserve deleted objects' colors when model undo restores their stable IDs.
  // Bound this separate cache by object count and face count, not just history length.
  const removedAssignments = new Map()
  const reviewing = ref(false),
    error = ref(''),
    downloaded = ref(false)
  const paintTool = ref('orbit'),
    paintSlot = ref('slot-1'),
    paintRadius = ref(5),
    paintHistory = reactive({})
  const paintTools = [
    { id: 'orbit', label: '旋轉檢視' },
    { id: 'brush', label: '筆刷上色' },
    { id: 'fill', label: '相連平面填色' },
    { id: 'erase', label: '橡皮擦' },
  ]
  const painting = computed(() =>
    settings.colorMode === 'multi' ? { tool: paintTool.value, slotId: paintSlot.value, radius: paintRadius.value, slots } : null
  )
  let slotSequence = 1,
    bandSequence = 0,
    downloadUrl = ''
  const material = computed(() => quoteMaterials.find((m) => m.id === settings.material) || quoteMaterials[0])
  const visibleSlots = computed(() => (settings.colorMode === 'single' ? slots.slice(0, 1) : slots))
  const hasHeightBands = computed(() => settings.colorMode === 'multi' && layout.value.models.some((m) => assignments[m.id]?.bands.length))
  const totalQuantity = computed(() => layout.value.models.reduce((sum, m) => sum + (Number(assignments[m.id]?.quantity) || 0), 0))
  const issues = computed(() => validateQuoteDraft(layout.value, settings, slots, assignments))
  const storageIssues = computed(() => validateQuoteDraft(layout.value, settings, slots, assignments, { forStorage: true }))
  const archiveInput = ref(null)
  let recoveryTimer,
    recoveryReady = false,
    recoveryFailed = false
  const snapshot = () =>
    captureWorkspace(layout.value, settings, {
      slots: [...slots],
      assignments: { ...assignments },
      cloudId: cloudId.value,
      cloudRevision: cloudRevision.value,
      cloudName: cloudName.value,
    })
  async function restoreLocal(saved) {
    if (!saved?.models?.length) return
    Object.assign(settings, saved.settings, { autoOrient: false, autoArrange: false })
    if (saved.slots) slots.splice(0, slots.length, ...saved.slots)
    else slots.splice(0, slots.length, { id: 'slot-1', ...quotePalette[0] })
    for (const key of Object.keys(assignments)) delete assignments[key]
    Object.assign(assignments, saved.assignments || {})
    cloudId.value = saved.cloudId || ''
    cloudRevision.value = saved.cloudRevision || 0
    cloudName.value = saved.cloudName || '我的列印草稿'
    slotSequence = Math.max(1, ...slots.map((s) => Number(s.id.replace('slot-', '')) || 0))
    paintSlot.value = slots[0].id
    stationLayout.value.restoreModels(saved.models)
    cloudMessage.value = '已還原模型、擺放與配色，請確認後繼續。'
  }
  async function persistRecovery() {
    clearTimeout(recoveryTimer)
    recoveryTimer = null
    if (!recoveryReady || (layout.value.models.length && !layout.value.sources?.length)) return
    try {
      await localWorkspace('quote:recovery', layout.value.models.length ? snapshot() : null)
      recoveryFailed = false
    } catch {
      recoveryFailed = true
    }
  }
  watch(
    [settings, slots, assignments, layout],
    () => {
      clearTimeout(recoveryTimer)
      if (recoveryReady) {
        checkpointWorkspace('quote:recovery', layout.value.models.length ? snapshot() : null)
        recoveryTimer = setTimeout(persistRecovery, 400)
      }
    },
    { deep: true }
  )
  async function downloadArchive() {
    try {
      const blob = await exportWorkspace({ ...snapshot(), cloudId: '', cloudRevision: 0 })
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
      downloadUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = '3DRFM-完整代印專案.zip'
      a.click()
    } catch (err) {
      error.value = err.message
    }
  }
  async function openArchive(event) {
    try {
      await restoreLocal(await importWorkspace(event.target.files[0]))
      await persistRecovery()
    } catch (err) {
      error.value = err.message
    }
    event.target.value = ''
  }
  async function clearLocal() {
    if (!window.confirm('清除此裝置的模型與設定？雲端草稿與已送出的案件不會刪除。')) return
    await localWorkspace('quote:recovery', null)
    stationLayout.value.restoreModels([])
    cloudId.value = ''
    cloudRevision.value = 0
    submittedCaseId.value = ''
    cloudMessage.value = '本機工作已清除。'
  }
  function beforeUnload(event) {
    if (layout.value.models.length && (recoveryTimer || recoveryFailed)) {
      event.preventDefault()
      event.returnValue = ''
    }
  }
  onBeforeRouteLeave(async () => {
    await persistRecovery()
    return !recoveryFailed || window.confirm('本機保存失敗，離開前請下載完整專案。仍要離開嗎？')
  })
  const appearance = computed(() => modelAppearance(layout.value.models, settings, slots, assignments))
  async function memberResources() {
    if (!memberToken.value) return
    const [result, addressList] = await Promise.all([
      workspace('', 'get', undefined, { skipCustomerAuthRedirect: true }),
      fetchAddresses({ skipCustomerAuthRedirect: true }),
    ])
    cloudProjects.value = result.projects.filter((p) => p.isOwner)
    addresses.value = addressList
    authNotice.value = ''
  }
  watch(
    memberToken,
    () => {
      if (memberToken.value)
        memberResources().catch((err) => {
          if (err.response?.status === 401) {
            store.dispatch('customerAuth/resetAccessToken')
            authNotice.value = '無法確認會員資料，請重新登入；模型與設定仍保留在此頁。'
          } else error.value = err.response?.data?.error || '無法載入會員資料'
        })
    },
    { immediate: true }
  )
  onMounted(async () => {
    window.addEventListener('beforeunload', beforeUnload)
    if (route.query.new === '1') {
      await localWorkspace('quote:recovery', null)
      recoveryReady = true
      await router.replace({ path: route.path, query: { ...route.query, new: undefined } })
      return
    }
    if (!route.query.draft && !route.query.model) {
      try {
        const handoff = route.query.handoff && (await localWorkspace('quote:handoff'))
        await restoreLocal(handoff || (await localWorkspace('quote:recovery')))
        recoveryReady = true
        await persistRecovery()
        if (route.query.handoff && !recoveryFailed) await localWorkspace('quote:handoff', null)
      } catch (err) {
        error.value = err.message
      }
      recoveryReady = true
      return
    }
    try {
      if (!memberToken.value) throw new Error('請先登入會員，再從模型庫或草稿重新開啟工作台。')
      restoringCloud = true
      await memberResources()
      if (route.query.draft) {
        const { draft } = await workspace(`/drafts/${encodeURIComponent(route.query.draft)}`)
        const files = await Promise.all(draft.modelIds.map((id) => modelFile(id, true)))
        Object.assign(settings, draft.manifest.settings)
        settings.autoOrient = false
        settings.autoArrange = false
        slots.splice(0, slots.length, ...draft.manifest.colorSlots)
        slotSequence = Math.max(1, ...slots.map((s) => Number(s.id.replace('slot-', '')) || 0))
        paintSlot.value = slots[0].id
        for (const model of draft.manifest.models)
          assignments[model.id] = {
            quantity: model.quantity,
            slotId: model.baseSlotId,
            bands: model.heightBands.map((b) => ({ ...b, id: ++bandSequence })),
            surfacePaint: Object.fromEntries(model.surfacePaint?.faces || []),
          }
        cloudId.value = draft.id
        cloudRevision.value = draft.revision
        cloudName.value = draft.name
        cloudProject.value = draft.projectId
        submittedCaseId.value = draft.caseId || ''
        stationLayout.value.restoreModels(
          draft.manifest.models.map((m, i) => ({
            id: m.id,
            name: m.name,
            file: new File([files[i]], m.name),
            transform: m.sourceTransform,
            hidden: !!m.hidden,
            position: m.placement,
          }))
        )
        reviewing.value = true
        cloudMessage.value = '雲端草稿已載入，模型處理完成後可繼續編輯。'
      } else {
        const bytes = await modelFile(route.query.model)
        stationLayout.value.selectFiles([new File([bytes], '模型庫模型.stl')])
      }
    } catch (err) {
      error.value = err.response?.data?.error || err.message
    } finally {
      restoringCloud = false
      recoveryReady = true
    }
  })
  watch(
    [settings, slots, assignments, layout, cloudName, cloudProject],
    () => {
      cloudGeneration++
      clearTimeout(autosaveTimer)
      if (autosaveEnabled.value && cloudId.value && !restoringCloud && !submittedCaseId.value && !storageIssues.value.length)
        autosaveTimer = setTimeout(() => saveCloud(true), 2500)
    },
    { deep: true }
  )
  async function saveCloud(automatic = false) {
    if (cloudBusy.value || storageIssues.value.length || !memberToken.value) return null
    cloudBusy.value = true
    const generation = cloudGeneration
    try {
      const manifest = createQuoteDraft(layout.value, settings, slots, assignments, { forStorage: true })
      const update = !!cloudId.value && !submittedCaseId.value
      const result = await uploadWorkspace(
        update ? `/drafts/${cloudId.value}` : '/drafts',
        { name: cloudName.value.trim() || '我的列印草稿', revision: cloudRevision.value, projectId: cloudProject.value, manifest },
        layout.value.files,
        layout.value.sources,
        update ? 'put' : 'post',
        { skipCustomerAuthRedirect: true }
      )
      cloudId.value = result.draft.id
      cloudRevision.value = result.draft.revision
      submittedCaseId.value = result.draft.caseId || ''
      cloudMessage.value = `${automatic ? '已自動保存' : '已保存'}・${new Date().toLocaleTimeString('zh-TW')}・版本 ${cloudRevision.value}`
      if (!cloudProjects.value.length) memberResources().catch(() => {})
      return generation === cloudGeneration ? result.draft : null
    } catch (err) {
      autosaveEnabled.value = false
      if (err.response?.status === 401) await store.dispatch('customerAuth/resetAccessToken')
      error.value = err.response?.data?.error || '草稿保存失敗，請重試'
      return null
    } finally {
      cloudBusy.value = false
      if (autosaveEnabled.value && generation !== cloudGeneration && !storageIssues.value.length) {
        clearTimeout(autosaveTimer)
        autosaveTimer = setTimeout(() => saveCloud(true), 2500)
      }
    }
  }
  async function submitCloud() {
    if (!checksAccepted.value || submittedCaseId.value) return
    const saved = await saveCloud(false)
    if (!saved) return
    cloudBusy.value = true
    try {
      const result = await workspace(`/drafts/${saved.id}/submit`, 'post', {
        checksAccepted: true,
        deliveryMethod: deliveryMethod.value,
        addressId: addressId.value,
      })
      submittedCaseId.value = result.case.id
      autosaveEnabled.value = false
      cloudMessage.value = '需求已送出，專員確認後將提供正式報價。'
    } catch (err) {
      error.value = err.response?.data?.error || '送出失敗，請重試'
    } finally {
      cloudBusy.value = false
    }
  }
  watch(
    () => settings.colorMode,
    (value) => {
      if (value === 'multi' && slots.length < 2) addSlot()
    }
  )
  watch(
    [settings, slots, assignments, layout],
    () => {
      downloaded.value = false
      error.value = ''
    },
    { deep: true }
  )
  function changeLayout(value) {
    for (const model of value.models) {
      if (!assignments[model.id]) {
        assignments[model.id] =
          removedAssignments.get(model.id) ||
          (model.cloneOf && assignments[model.cloneOf]
            ? structuredClone(JSON.parse(JSON.stringify(assignments[model.cloneOf])))
            : { slotId: slots[0].id, quantity: 1, bands: [], surfacePaint: {} })
        removedAssignments.delete(model.id)
      }
      paintHistory[model.id] ||= { undo: [], redo: [] }
    }
    for (const id of Object.keys(assignments))
      if (!value.models.some((m) => m.id === id)) {
        removedAssignments.set(id, assignments[id])
        delete assignments[id]
        delete paintHistory[id]
      }
    while (
      removedAssignments.size > 30 ||
      [...removedAssignments.values()].reduce((n, a) => n + Object.keys(a.surfacePaint).length, 0) > 200000
    )
      removedAssignments.delete(removedAssignments.keys().next().value)
    layout.value = value
  }
  function addSlot() {
    if (slots.length < MAX_COLOR_SLOTS)
      slots.push({ id: `slot-${++slotSequence}`, ...quotePalette[(slotSequence - 1) % quotePalette.length] })
  }
  function chooseColor(slot, color) {
    slot.hex = color.hex
    slot.label = color.label
  }
  function removeSlot(id) {
    if (slots.length <= 2) return
    slots.splice(
      slots.findIndex((s) => s.id === id),
      1
    )
    for (const a of [...Object.values(assignments), ...removedAssignments.values()]) {
      if (a.slotId === id) a.slotId = slots[0].id
      for (const band of a.bands) if (band.slotId === id) band.slotId = slots[0].id
      for (const face of Object.keys(a.surfacePaint)) if (a.surfacePaint[face] === id) a.surfacePaint[face] = slots[0].id
    }
    if (paintSlot.value === id) paintSlot.value = slots[0].id
    // A removed slot cannot be resurrected by undo/redo.
    for (const history of Object.values(paintHistory)) {
      history.undo = []
      history.redo = []
    }
  }
  function paintStroke({ modelId, changes }) {
    if (!assignments[modelId] || !changes.length) return
    assignments[modelId].surfacePaint = applyPaintChanges(assignments[modelId].surfacePaint, changes)
    paintHistory[modelId].undo = appendPaintHistory(paintHistory[modelId].undo, changes)
    paintHistory[modelId].redo = []
  }
  function undoPaint(id) {
    const changes = paintHistory[id]?.undo.pop()
    if (!changes) return
    assignments[id].surfacePaint = applyPaintChanges(assignments[id].surfacePaint, changes, true)
    paintHistory[id].redo.push(changes)
  }
  function redoPaint(id) {
    const changes = paintHistory[id]?.redo.pop()
    if (!changes) return
    assignments[id].surfacePaint = applyPaintChanges(assignments[id].surfacePaint, changes)
    paintHistory[id].undo.push(changes)
  }
  function clearPaint(id) {
    if (!window.confirm('清除此模型的表面上色？基底色與高度換色將保留，清除後也可復原。')) return
    paintStroke({
      modelId: id,
      changes: Object.entries(assignments[id].surfacePaint).map(([face, before]) => ({ face: Number(face), before, after: null })),
    })
  }
  function addBand(model) {
    const bands = assignments[model.id].bands
    if (!model.dimensions || bands.length >= MAX_HEIGHT_BANDS) return
    const from = bands.length ? Math.max(...bands.map((b) => Number(b.to) || 0)) : Math.round((model.dimensions[2] / 2) * 100) / 100
    if (from >= model.dimensions[2]) {
      error.value = '現有區間已達模型頂部，請先調整區間，再新增換色。'
      return
    }
    bands.push({ id: ++bandSequence, from, to: Math.round(model.dimensions[2] * 100) / 100, slotId: slots[1]?.id || slots[0].id })
  }
  async function focusSection(id) {
    await nextTick()
    const element = document.getElementById(id)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'start' })
  }
  async function review() {
    if (storageIssues.value.length) {
      error.value = storageIssues.value[0]
      await focusSection('quote-review')
      return
    }
    reviewing.value = true
    error.value = ''
    await focusSection('quote-review')
  }
  function downloadDraft() {
    try {
      const draft = createQuoteDraft(layout.value, settings, slots, assignments)
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
      downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }))
      const a = document.createElement('a')
      a.href = downloadUrl
      a.download = '3DRFM-列印設定草稿.json'
      a.click()
      downloaded.value = true
    } catch (err) {
      error.value = err.message
    }
  }
  function askSpecialist() {
    if (layout.value.models.length && !window.confirm('轉為專員協助會離開工作台，未下載的模型擺放與配色設定不會保留。確定繼續？')) return
    emit('assistance')
  }
  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', beforeUnload)
    clearTimeout(recoveryTimer)
    persistRecovery()
    clearTimeout(autosaveTimer)
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
  })
</script>

<style scoped>
  .workbench-file-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0 0 24px;
  }
  .workbench-file-actions span {
    font-size: 12px;
    color: var(--rfm-muted);
  }
  .color-illustrated-tip {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
  }
  .color-illustrated-tip .instruction-art {
    --instruction-width: 96px;
    --instruction-height: 76px;
  }
  .color-illustrated-tip p {
    font-size: 11px;
    line-height: 1.8;
    color: var(--rfm-muted);
  }
  .quote-workbench :deep(.public-utility),
  .quote-workbench :deep(.public-footer) {
    display: none;
  }
  .quote-workbench :deep(.public-header) {
    min-height: 66px;
  }
  .quote-workbench .workbench-wrap {
    max-width: none;
    width: 100%;
    padding: 20px;
  }
  .quote-workbench .workbench-intro {
    margin-bottom: 14px;
    align-items: center;
  }
  .quote-workbench .workbench-intro h1 {
    font-size: 25px;
    margin: 5px 0;
  }
  .quote-workbench .workbench-intro p {
    font-size: 11px;
    margin: 4px 0;
  }
  .quote-workbench .backend-notice {
    padding: 12px 16px;
    margin-bottom: 14px;
    font-size: 11px;
  }
  .quote-workbench .backend-notice p {
    font-size: 10px;
    margin: 5px 0;
  }
  .quote-workbench .workbench-steps {
    margin: 12px 0 16px;
  }
  .quote-workbench .workbench-grid {
    grid-template-columns: minmax(0, 1fr) 350px;
    gap: 14px;
  }
  .quote-workbench .model-panel {
    position: sticky;
    top: 80px;
    padding: 0;
    overflow: hidden;
    background: #edf0ee;
  }
  .quote-workbench .model-panel > .panel-heading {
    padding: 14px 18px;
    margin: 0;
    background: var(--rfm-surface);
  }
  .quote-workbench .model-panel > .panel-heading h2 {
    font-size: 13px;
  }
  .quote-workbench .model-panel > .panel-heading p {
    font-size: 10px;
    margin: 0;
  }
  .quote-workbench .model-panel :deep(.slicer-stage) {
    height: calc(100vh - 170px);
    min-height: 660px;
    border-radius: 0;
  }
  .quote-workbench #quote-settings {
    padding: 20px;
  }
  @media (max-width: 1000px) {
    .quote-workbench .workbench-grid {
      grid-template-columns: 1fr;
    }
    .quote-workbench .model-panel {
      position: static;
    }
    .quote-workbench .workbench-wrap {
      padding: 14px;
    }
    .quote-workbench .model-panel :deep(.slicer-stage) {
      height: 660px;
    }
    .quote-workbench .workbench-intro {
      align-items: start;
    }
    .quote-workbench .workbench-intro h1 {
      font-size: 22px;
    }
  }
  .cloud-draft-panel {
    margin: 20px 0;
    padding: 20px;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    background: var(--rfm-subtle);
    display: grid;
    gap: 14px;
  }
  .surface-tools {
    padding: 16px;
    margin: 18px 0 0;
    border: 1px solid var(--rfm-line);
    border-bottom: 0;
    background: var(--rfm-subtle);
    border-radius: 6px 6px 0 0;
  }
  .paint-tool-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .paint-tool-buttons button[aria-pressed='true'] {
    background: var(--rfm-ink);
    color: white;
  }
  .workbench-wrap {
    padding-block: 46px 70px;
  }
  .workbench-intro {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 24px;
    margin-bottom: 30px;
  }
  .workbench-kicker {
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--rfm-muted);
  }
  h1 {
    font-size: clamp(28px, 3.3vw, 44px);
    margin: 14px 0;
    letter-spacing: -1px;
  }
  .workbench-intro p:last-child {
    color: var(--rfm-muted);
    font-size: 14px;
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
  }
  button {
    cursor: pointer;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    background: var(--rfm-surface);
    color: var(--rfm-ink);
    padding: 8px 12px;
    font-size: 12px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .text-button {
    border: 0;
    border-bottom: 1px solid var(--rfm-line);
    padding: 10px 0;
    background: none;
  }
  .backend-notice {
    background: var(--rfm-subtle);
    border-left: 3px solid #a9883e;
    padding: 18px 22px;
    font-size: 13px;
    line-height: 1.8;
  }
  .backend-notice p {
    margin: 6px 0 0;
    color: #65685b;
  }
  .service-note {
    font-size: 13px;
  }
  .workbench-steps {
    display: flex;
    gap: 30px;
    margin: 28px 0;
    font-size: 13px;
  }
  .workbench-steps a,
  .workbench-steps button {
    display: flex;
    gap: 10px;
    align-items: center;
    border: 0;
    background: none;
    padding: 0;
    color: var(--rfm-ink);
    font-size: 13px;
  }
  .workbench-steps span {
    font-size: 10px;
    color: #92825b;
  }
  .workbench-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 24px;
    align-items: start;
  }
  .workbench-panel {
    padding: 26px;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-panel);
    background: var(--rfm-surface);
    min-width: 0;
    scroll-margin-top: 110px;
    overflow-wrap: anywhere;
  }
  .panel-heading {
    display: flex;
    gap: 14px;
    align-items: start;
    margin-bottom: 24px;
  }
  .panel-heading > span {
    font-size: 11px;
    border: 1px solid #d3daca;
    border-radius: 50%;
    padding: 7px 10px;
  }
  .panel-heading h2 {
    font-size: 20px;
    line-height: 1.5;
    margin: 0 0 7px;
  }
  .panel-heading p,
  .workbench-note {
    font-size: 12px;
    line-height: 1.8;
    color: var(--rfm-muted);
    margin: 0;
  }
  .workbench-note {
    margin-block: 14px;
  }
  .field {
    display: grid;
    gap: 7px;
    font-size: 12px;
    margin: 14px 0;
    min-width: 0;
  }
  .field input,
  .field select,
  .field textarea {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    color: var(--rfm-ink);
    background: var(--rfm-surface);
  }
  .field textarea {
    resize: vertical;
  }
  .field-pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .material-note {
    font-size: 12px;
    padding: 10px 12px;
    background: var(--rfm-subtle);
  }
  .color-mode {
    border: 0;
    padding: 0;
    margin: 24px 0;
    display: flex;
    gap: 24px;
    font-size: 13px;
  }
  .color-mode legend {
    margin-bottom: 12px;
    font-weight: 700;
  }
  .color-mode label,
  .check-field {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  input[type='checkbox'],
  input[type='radio'] {
    accent-color: var(--rfm-ink);
  }
  .slots-heading,
  .slot-top,
  .bands-heading,
  .band-bottom {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h3 {
    font-size: 15px;
    margin: 12px 0;
  }
  .color-slot {
    border: 1px solid var(--rfm-line);
    padding: 14px;
    border-radius: var(--rfm-radius-control);
    margin: 12px 0;
  }
  .slot-top {
    font-size: 12px;
  }
  .slot-top span {
    margin-right: auto;
    color: #6c786c;
  }
  .slot-inputs {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .slot-inputs > .field {
    flex: 1;
  }
  .swatch-input input {
    width: 42px;
    height: 40px;
    padding: 3px;
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    cursor: pointer;
  }
  .palette {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .palette button {
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 50%;
  }
  .palette button[aria-pressed='true'] {
    outline: 2px solid var(--rfm-ink);
    outline-offset: 3px;
  }
  .model-assignments {
    margin-top: 26px;
  }
  .assignment-card {
    padding: 16px;
    border: 1px solid var(--rfm-line);
    margin: 12px 0;
    background: var(--rfm-workspace);
    border-radius: var(--rfm-radius-control);
  }
  h4 {
    font-size: 13px;
    margin: 0;
  }
  .bands-heading {
    font-size: 12px;
    margin: 14px 0 8px;
  }
  .height-band {
    padding: 10px;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    margin: 10px 0;
    background: var(--rfm-surface);
  }
  .height-band .field {
    margin-block: 4px;
  }
  .band-bottom {
    margin-top: 8px;
  }
  .band-bottom .field {
    flex: 1;
  }
  .print-settings {
    border-top: 1px solid var(--rfm-line);
    padding-top: 20px;
    margin-top: 20px;
  }
  summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 700;
  }
  .check-field {
    font-size: 12px;
    margin: 14px 0;
  }
  .primary-button {
    display: block;
    width: 100%;
    padding: 14px;
    color: white;
    background: var(--rfm-ink);
    font-size: 13px;
    margin-top: 24px;
  }
  .validation-note {
    padding: 12px;
    background: var(--rfm-danger-bg);
    color: var(--rfm-danger);
    font-size: 12px;
    line-height: 1.8;
  }
  .review-panel {
    margin-top: 24px;
    font-size: 13px;
    line-height: 1.8;
  }
  .draft-summary {
    margin-block: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--rfm-line);
  }
  .quote-not-ready {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    align-items: center;
    border-top: 1px solid var(--rfm-line);
    margin-top: 24px;
    padding-top: 24px;
  }
  .quote-not-ready span,
  .quote-not-ready small {
    display: block;
    color: var(--rfm-muted);
    font-size: 12px;
  }
  .quote-not-ready strong {
    display: block;
    font-size: 24px;
    margin: 8px 0;
    font-weight: 500;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    overflow: hidden;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible,
  a:focus-visible {
    outline: 2px solid #9a762f;
    outline-offset: 3px;
  }
  @media (max-width: 900px) {
    .workbench-grid {
      grid-template-columns: 1fr;
    }
    .workbench-intro {
      align-items: start;
      flex-direction: column;
    }
  }
  @media (max-width: 600px) {
    .workbench-wrap {
      padding-top: 28px;
    }
    .workbench-panel {
      padding: 18px;
    }
    .workbench-steps {
      gap: 15px;
      justify-content: space-between;
    }
    .workbench-steps a,
    .workbench-steps button {
      gap: 5px;
      font-size: 11px;
    }
    .panel-heading h2 {
      font-size: 18px;
    }
    .quote-not-ready {
      align-items: start;
      flex-direction: column;
    }
    .quote-not-ready button {
      width: 100%;
    }
    .field-pair {
      gap: 8px;
    }
  }
</style>
