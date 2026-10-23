<template>
  <public-shell>
    <main class="station-session studio-wrap">
      <p class="eyebrow">清華大學水木書苑 ／ 3DSTU_PETG</p>
      <h1>一步一步，完成你的免費列印。</h1>
      <p>先完成切片並排隊。輪到你時會寄 Email；列印完成後，也會通知你來清空平台。</p>
      <ol class="session-journey" aria-label="自助列印流程">
        <li
          v-for="(step, index) in journey"
          :key="step"
          :class="{ current: journeyIndex === index, done: journeyIndex > index }"
          :aria-current="journeyIndex === index ? 'step' : undefined"
        >
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          {{ step }}
        </li>
      </ol>
      <quote-account v-if="!memberToken" />
      <template v-else>
        <p v-if="error" role="alert" class="station-error">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <div class="station-toolbar">
          <router-link to="/free-print/nthu-shuimu/slicer">準備模型與切片 ↗</router-link>
          <button type="button" :disabled="busy" @click="load">更新狀態</button>
          <router-link to="/portal/workspace">會員工作台 ↗</router-link>
          <button type="button" :disabled="busy" @click="store.dispatch('customerAuth/resetAccessToken')">登出會員</button>
        </div>
        <div class="station-overview">
          <div>
            <span class="eyebrow">站點狀態</span>
            <h2>{{ state.station?.name || '清華大學水木書苑' }}</h2>
            <p>{{ state.station?.availability || '等待讀取站點狀態' }}</p>
          </div>
          <div>
            <span class="eyebrow">等待人數</span>
            <strong>{{ state.station?.queueLength ?? '—' }}</strong>
            <p>依排隊順序通知，不插隊</p>
          </div>
        </div>
        <p v-if="busy" role="status" class="command-pending">{{ actionLabel }}正在處理，請勿重複操作…</p>
        <p v-if="currentReservation && !controlReady" class="connection-warning" role="status">
          {{
            leaseExpired
              ? '報到或準備期限已到，正在等候站點確認時段。'
              : '尚未取得可用的機台連線。操作暫時停用，接上後端並回報狀態後即可使用。'
          }}
        </p>
        <p v-if="loading" role="status">正在讀取你的使用時段…</p>
        <article
          v-for="item in sortedReservations"
          :key="item.id"
          class="reservation"
          :class="{ 'past-reservation': !item.canControl && item.status !== 'queued' }"
        >
          <header>
            <h2>{{ item.statusLabel }}</h2>
            <span>第 {{ item.sequence || '—' }} 號 · 預估 {{ Math.ceil(item.estimatedMinutes || 0) }} 分鐘</span>
          </header>
          <p v-if="item.canControl && ['notified', 'preparing'].includes(item.status)" class="lease-time">
            {{ item.status === 'notified' ? '到場報到' : '完成準備' }}期限：{{ time(item.leaseExpiresAt) }}。{{
              leaseExpired ? '期限已到，請等候狀態更新。' : '完成列印後，取件交棒才會結束使用。'
            }}
          </p>
          <div v-if="item.canControl || item.status === 'queued'" class="reservation-console">
            <div v-if="item.canControl" class="telemetry-grid" aria-label="機台即時狀態">
              <div>
                <span>機台連線</span>
                <strong>{{ controlReady ? '已連接' : '未連接／等待確認' }}</strong>
              </div>
              <div>
                <span>噴嘴溫度</span>
                <strong>
                  {{ state.telemetry?.nozzle ?? '—' }}
                  <small>°C</small>
                </strong>
              </div>
              <div>
                <span>平台溫度</span>
                <strong>
                  {{ state.telemetry?.bed ?? '—' }}
                  <small>°C</small>
                </strong>
              </div>
            </div>
            <free-print-camera
              :reservation-id="item.id"
              :allowed="item.canControl && !leaseExpired && !stale"
              :access-token="memberToken"
            />
          </div>
          <template v-if="item.status === 'queued'">
            <p>你目前是等待中的第 {{ item.position }} 位。請等 Email 或此頁通知，再到場操作。</p>
            <button type="button" :disabled="busy" @click="act(item, 'cancel')">取消這次排隊</button>
          </template>
          <template v-if="item.status === 'notified'">
            <p>現在可以到水木書苑列印。請在 {{ time(item.leaseExpiresAt) }} 前到場報到。</p>
            <p>到場後先找到指定機台，再按下方按鈕。</p>
            <button class="primary" type="button" :disabled="busy || !controlReady" @click="act(item, 'checkin')">
              我已到場，開始準備
            </button>
            <button type="button" :disabled="busy" @click="act(item, 'cancel')">這次無法到場，取消時段</button>
          </template>
          <template v-if="item.status === 'preparing'">
            <ol class="guide-steps">
              <li>
                <h3>確認機台與平台</h3>
                <p>先查看機台，確認沒有其他人的列印件，手與工具已離開移動範圍。</p>
                <details>
                  <summary>？什麼是歸零？</summary>
                  <p>讓印表機尋找各軸的基準位置。按下後機台會移動，請保持移動範圍淨空。</p>
                </details>
                <button type="button" :disabled="busy || !controlReady" @click="act(item, 'home')">機台範圍已淨空，執行歸零</button>
                <p v-if="state.telemetry?.homed" class="step-complete">已收到歸零操作回應。請再查看現場機台是否已停止移動。</p>
              </li>
              <li>
                <h3>準備耗材</h3>
                <p>使用站點指定的 3DSTU_PETG。若耗材已裝好，可直接完成下方確認。</p>
                <details>
                  <summary>？如何進料與退料？</summary>
                  <p>先預熱，等畫面溫度達到設定後，把耗材放入進料口。每次進料或退料移動 10 mm；若卡料，請請站點人員協助。</p>
                </details>
                <div class="station-controls">
                  <button type="button" :disabled="busy || !controlReady" @click="act(item, 'preheat')">預熱耗材</button>
                  <button type="button" :disabled="busy || !controlReady || !state.telemetry?.extrusionReady" @click="act(item, 'load')">
                    進料 10 mm
                  </button>
                  <button type="button" :disabled="busy || !controlReady || !state.telemetry?.extrusionReady" @click="act(item, 'unload')">
                    退料 10 mm
                  </button>
                  <button type="button" :disabled="busy || !controlReady" @click="act(item, 'cooldown')">停止加熱</button>
                </div>
                <p v-if="!state.telemetry?.extrusionReady">
                  進退料前請預熱，等待噴嘴達到 {{ state.telemetry?.minimumExtrudeTemperature || '指定' }} °C。
                </p>
              </li>
              <li>
                <h3>確認後開始列印</h3>
                <label>
                  <input v-model="checks.bedClear" type="checkbox" />
                  平台上的列印件已移除，平台已清空。
                </label>
                <label>
                  <input v-model="checks.filamentReady" type="checkbox" />
                  指定耗材已就位，進料正常。
                </label>
                <label>
                  <input v-model="checks.areaClear" type="checkbox" />
                  手、工具與雜物已離開機台移動範圍。
                </label>
                <p>按下後會把這次已切好的檔案送到機台，開始真正列印。</p>
                <button
                  class="primary"
                  type="button"
                  :disabled="
                    busy || !controlReady || !state.telemetry?.homed || !checks.bedClear || !checks.filamentReady || !checks.areaClear
                  "
                  @click="start(item)"
                >
                  確認完成，開始列印
                </button>
              </li>
            </ol>
            <details class="axis-panel">
              <summary>需要調整位置？展開各軸微調</summary>
              <p>先歸零，再選擇小距離移動。機台未回報位置時無法微調，請站點人員協助。</p>
              <label>
                移動距離
                <select v-model.number="distance">
                  <option :value="1">1 mm</option>
                  <option :value="10">10 mm</option>
                </select>
              </label>
              <div v-for="axis in ['x', 'y', 'z']" :key="axis" class="station-controls">
                <b>{{ axis.toUpperCase() }} 軸</b>
                <button
                  type="button"
                  :disabled="busy || !controlReady || !state.telemetry?.homed || !state.telemetry?.position"
                  :aria-label="`${axis.toUpperCase()} 軸減少 ${distance} mm`"
                  @click="act(item, 'jog', { axis, distance: -distance })"
                >
                  − {{ distance }} mm
                </button>
                <button
                  type="button"
                  :disabled="busy || !controlReady || !state.telemetry?.homed || !state.telemetry?.position"
                  :aria-label="`${axis.toUpperCase()} 軸增加 ${distance} mm`"
                  @click="act(item, 'jog', { axis, distance })"
                >
                  ＋ {{ distance }} mm
                </button>
              </div>
            </details>
            <details>
              <summary>這次不列印？結束使用時段</summary>
              <p>先停止加熱並等待冷卻，清空平台後再交給下一位。</p>
              <label>
                <input v-model="abandonClear" type="checkbox" />
                我已清空平台，這次不開始列印。
              </label>
              <button
                type="button"
                :disabled="busy || !controlReady || !abandonClear"
                @click="act(item, 'release', { checks: { bedClear: true, filamentReady: false, areaClear: true } })"
              >
                結束這次時段
              </button>
            </details>
          </template>
          <template v-if="['starting', 'printing', 'paused'].includes(item.status)">
            <p>
              {{
                item.status === 'starting'
                  ? '檔案已送交機台，正在確認啟動狀態。請勿重複按開始。'
                  : '列印期間可以在這裡查看狀態。完成後將寄 Email，請儘快到場取件。'
              }}
            </p>
            <progress
              v-if="item.canControl && state.telemetry?.progress !== undefined"
              :value="state.telemetry.progress"
              max="100"
              aria-label="實際列印進度"
            />
            <div class="station-controls">
              <button v-if="item.status === 'printing'" :disabled="busy || !controlReady" @click="act(item, 'pause')">暫停列印</button>
              <button v-if="item.status === 'paused'" :disabled="busy || !controlReady" @click="act(item, 'resume')">繼續列印</button>
              <button v-if="item.status !== 'starting'" :disabled="busy || !controlReady" @click="confirmStop = item">停止這次列印</button>
            </div>
            <details>
              <summary>？暫停、停止與緊急狀況有什麼不同？</summary>
              <p>
                暫停後可嘗試繼續；停止會取消這次列印，不能從原處接續。遠端操作不是緊急斷電鈕。若發生冒煙、異味或碰撞，請立即通知現場人員依機台指示處理，不要只等待網頁回應。
              </p>
            </details>
          </template>
          <template v-if="item.status === 'awaiting_removal'">
            <h3>最後一步：取件並清空平台</h3>
            <p>等待平台冷卻後，移除列印件、支撐及殘料。確認完成後，系統才會通知下一位。</p>
            <label>
              <input v-model="removed" type="checkbox" />
              我已取走列印件，並清空平台。
            </label>
            <button
              class="primary"
              type="button"
              :disabled="busy || !controlReady || !removed"
              @click="act(item, 'release', { checks: { bedClear: true, filamentReady: false, areaClear: true } })"
            >
              確認取件，交給下一位
            </button>
          </template>
          <p v-if="item.status === 'attention'" role="alert">
            {{ item.lastError || '機台狀態需要站點人員確認，請先停止操作並聯絡水木書苑。' }}
          </p>
          <p v-if="item.canControl && state.telemetry">
            噴嘴 {{ state.telemetry.nozzle ?? '—' }} °C ／平台 {{ state.telemetry.bed ?? '—' }} °C ·
            {{ state.telemetry.status === 'offline' ? '連線中斷，操作暫停' : '機台狀態已更新' }}
          </p>
          <details v-if="item.email?.length">
            <summary>通知寄送狀態</summary>
            <p v-for="mail in item.email" :key="mail.subject">{{ mail.subject }}：{{ mailStatus(mail.status) }}</p>
          </details>
          <details v-if="item.history?.length">
            <summary>使用紀錄</summary>
            <p v-for="(event, index) in item.history" :key="index">{{ time(event.at) }} · {{ statusText(event.status) }}</p>
          </details>
        </article>
        <p v-if="!loading && !state.reservations.length">目前沒有排隊紀錄。請先準備模型，切片完成後按「加入免費列印排隊」。</p>
      </template>
      <dialog ref="stopDialog" class="stop-dialog" @cancel="confirmStop = null">
        <h2>確定停止這次列印？</h2>
        <p>停止後無法接續這次列印。請等機台停止並冷卻，再取件清空平台，交給下一位。</p>
        <div class="station-controls">
          <button type="button" @click="confirmStop = null">保留列印</button>
          <button class="primary" type="button" @click="stopPrint">確認停止列印</button>
        </div>
      </dialog>
    </main>
  </public-shell>
</template>
<script setup>
  import { ref, reactive, computed, watch, onBeforeUnmount, nextTick } from 'vue'
  import { useStore } from 'vuex'
  import PublicShell from '@/components/public/PublicShell.vue'
  import QuoteAccount from '@/components/QuoteAccount.vue'
  import FreePrintCamera from '@/components/FreePrintCamera.vue'
  import { workspace } from '@/api/memberWorkspace'
  const store = useStore(),
    memberToken = computed(() => store.getters['customerAuth/accessToken'])
  const state = ref({ station: null, reservations: [] }),
    busy = ref(false),
    loading = ref(false),
    error = ref(''),
    notice = ref(''),
    distance = ref(1),
    removed = ref(false),
    abandonClear = ref(false)
  const checks = reactive({ bedClear: false, filamentReady: false, areaClear: false })
  const confirmStop = ref(null),
    stopDialog = ref(null),
    actionLabel = ref(''),
    lastUpdated = ref(0),
    currentTime = ref(Date.now())
  const tickTimer = setInterval(() => {
    currentTime.value = Date.now()
  }, 1000)
  const currentReservation = computed(() => state.value.reservations.find((r) => r.canControl))
  const stale = computed(() => currentTime.value - lastUpdated.value > 15000)
  const leaseExpired = computed(
    () =>
      ['notified', 'preparing'].includes(currentReservation.value?.status) &&
      Date.parse(currentReservation.value.leaseExpiresAt) <= currentTime.value
  )
  const controlReady = computed(
    () =>
      !!currentReservation.value &&
      !!state.value.telemetry &&
      !['offline', 'unknown'].includes(state.value.telemetry.status) &&
      !!state.value.telemetry.status &&
      !stale.value &&
      !leaseExpired.value
  )
  const sortedReservations = computed(() =>
    [...state.value.reservations].sort(
      (a, b) =>
        Number(!!b.canControl) - Number(!!a.canControl) ||
        Number(b.status === 'queued') - Number(a.status === 'queued') ||
        (b.sequence || 0) - (a.sequence || 0)
    )
  )
  const journey = ['加入排隊', '到場報到', '準備機台', '開始列印', '取件交棒']
  const journeyIndex = computed(
    () => ({ notified: 1, preparing: 2, starting: 3, printing: 3, paused: 3, awaiting_removal: 4 }[currentReservation.value?.status] ?? 0)
  )
  const statusText = (s) =>
    ({
      queued: '加入排隊',
      notified: '通知到場',
      preparing: '準備列印',
      starting: '送交機台',
      printing: '列印中',
      paused: '暫停',
      awaiting_removal: '等待取件',
      completed: '完成交棒',
      cancelled: '取消',
      expired: '已逾時',
      attention: '需要現場協助',
    }[s] || '狀態更新')
  let timer,
    active = true,
    requestKey = null,
    stateRevision = 0
  const time = (value) => new Date(value).toLocaleString('zh-TW')
  const mailStatus = (s) =>
    ({ sent: '已寄出', pending: '等待寄送', retry: '稍後重試', sending: '寄送中', failed: '寄送失敗，請查看此頁通知' }[s] || s)
  async function load() {
    clearTimeout(timer)
    if (!active || !memberToken.value || busy.value) return
    loading.value = true
    const token = memberToken.value
    const revision = ++stateRevision
    try {
      const next = await workspace('/free-print/station', 'get', undefined, { skipCustomerAuthRedirect: true })
      if (active && token === memberToken.value && revision === stateRevision) {
        state.value = next
        lastUpdated.value = Date.now()
      }
    } catch (e) {
      if (active && token === memberToken.value) error.value = e.response?.data?.error || '無法更新狀態，請稍後重試。'
    } finally {
      loading.value = false
      if (active) timer = setTimeout(load, 5000)
    }
  }
  async function act(item, action, extra = {}) {
    if (busy.value) return
    stateRevision++
    busy.value = true
    const token = memberToken.value
    actionLabel.value =
      {
        home: '歸零',
        jog: '各軸移動',
        preheat: '預熱',
        cooldown: '停止加熱',
        load: '進料',
        unload: '退料',
        start: '開始列印',
        pause: '暫停列印',
        resume: '繼續列印',
        cancel: '停止／取消',
        release: '結束時段',
        checkin: '到場報到',
        checks: '安全確認',
      }[action] || '操作'
    error.value = ''
    notice.value = ''
    const signature = JSON.stringify([item.id, action, extra])
    if (requestKey?.signature !== signature) requestKey = { signature, id: crypto.randomUUID() }
    try {
      const next = await workspace(
        `/free-print/reservations/${item.id}/action`,
        'post',
        { action, requestId: requestKey.id, ...extra },
        { timeout: 60000, skipCustomerAuthRedirect: true }
      )
      if (!active || token !== memberToken.value) return
      state.value = next
      lastUpdated.value = Date.now()
      requestKey = null
      notice.value = '操作已送出，請依畫面查看機台。'
      if (['home', 'jog'].includes(action)) {
        checks.bedClear = false
        checks.areaClear = false
      }
      if (['load', 'unload'].includes(action)) checks.filamentReady = false
    } catch (e) {
      if (active && token === memberToken.value) error.value = e.response?.data?.error || '操作結果尚未確認，請更新狀態後查看機台。'
    } finally {
      busy.value = false
      clearTimeout(timer)
      if (active) timer = setTimeout(load, 1000)
    }
  }
  async function start(item) {
    if (busy.value || !controlReady.value) return
    const token = memberToken.value
    await act(item, 'checks', { checks: { ...checks } })
    if (!error.value && token === memberToken.value && active) await act(item, 'start')
  }
  watch(
    memberToken,
    () => {
      state.value = { station: null, reservations: [] }
      lastUpdated.value = 0
      error.value = ''
      notice.value = ''
      confirmStop.value = null
      requestKey = null
      stateRevision++
      load()
    },
    { immediate: true }
  )
  watch(confirmStop, async (item) => {
    await nextTick()
    if (item) stopDialog.value?.showModal()
    else stopDialog.value?.close()
  })
  async function stopPrint() {
    const item = confirmStop.value
    confirmStop.value = null
    if (item && controlReady.value) await act(item, 'cancel')
  }
  watch(
    () => state.value.reservations.find((r) => r.canControl)?.id,
    () => {
      Object.assign(checks, { bedClear: false, filamentReady: false, areaClear: false })
      removed.value = false
      abandonClear.value = false
      confirmStop.value = null
    }
  )
  onBeforeUnmount(() => {
    active = false
    clearTimeout(timer)
    clearInterval(tickTimer)
  })
</script>
<style scoped>
  .station-session {
    padding-block: 48px;
    max-width: 1100px;
    color: var(--rfm-ink);
  }
  h1 {
    font-size: clamp(26px, 4vw, 40px);
    line-height: 1.35;
  }
  .eyebrow {
    color: var(--rfm-muted);
    font-size: 13px;
  }
  .session-journey {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    list-style: none;
    padding: 0;
    margin: 32px 0;
    border-block: 1px solid var(--rfm-line);
  }
  .session-journey li {
    padding: 18px 8px;
    color: var(--rfm-muted);
    font-size: 13px;
  }
  .session-journey span {
    display: block;
    font-size: 12px;
    margin-bottom: 8px;
  }
  .session-journey .current {
    color: var(--rfm-ink);
    box-shadow: inset 0 -3px var(--rfm-ink);
    font-weight: 700;
  }
  .session-journey .done {
    color: #386b55;
  }
  .station-overview {
    display: flex;
    gap: 24px;
    justify-content: space-between;
    flex-wrap: wrap;
    padding: 24px;
    border-radius: 14px;
    background: var(--rfm-paper);
    margin-top: 24px;
  }
  .station-overview h2 {
    font-size: 22px;
    margin: 8px 0;
  }
  .station-overview strong {
    display: block;
    font-size: 28px;
    margin: 8px 0;
  }
  .station-overview p {
    margin: 4px 0;
    font-size: 13px;
  }
  .telemetry-grid {
    display: grid;
    gap: 12px;
    align-content: start;
    margin-top: 24px;
  }
  .reservation-console {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(0, 3fr);
    gap: 20px;
  }
  .reservation-console > :only-child {
    grid-column: 1 / -1;
  }
  .telemetry-grid > div {
    padding: 16px;
    border: 1px solid var(--rfm-line);
    border-radius: 10px;
  }
  .telemetry-grid span {
    display: block;
    color: var(--rfm-muted);
    font-size: 12px;
    margin-bottom: 8px;
  }
  .telemetry-grid strong {
    font-size: 19px;
    overflow-wrap: anywhere;
  }
  .telemetry-grid small {
    font-weight: 400;
    font-size: 12px;
  }
  .connection-warning,
  .command-pending {
    padding: 12px 16px;
    border: 1px solid #d8bd87;
    background: #fff8e9;
    border-radius: 10px;
  }
  .lease-time {
    font-size: 13px;
    color: var(--rfm-muted);
  }
  .step-complete {
    color: #386b55;
  }
  .past-reservation {
    background: var(--rfm-paper);
  }
  .stop-dialog {
    max-width: min(480px, calc(100vw - 32px));
    padding: 24px;
    border: 1px solid var(--rfm-line);
    border-radius: 14px;
    background: var(--rfm-surface);
    color: var(--rfm-ink);
  }
  .stop-dialog::backdrop {
    background: #142c3066;
  }
  .reservation {
    margin: 24px 0;
    padding: 24px;
    border: 1px solid var(--rfm-line);
    border-radius: 12px;
    background: var(--rfm-surface);
  }
  .reservation header,
  .station-toolbar,
  .station-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .reservation header {
    justify-content: space-between;
  }
  button,
  select {
    font: inherit;
    min-height: 44px;
    padding: 10px 16px;
    border: 1px solid var(--rfm-line);
    border-radius: 7px;
    background: var(--rfm-surface);
    color: inherit;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .primary {
    background: var(--rfm-ink);
    color: var(--rfm-surface);
  }
  .guide-steps {
    padding-left: 24px;
  }
  .guide-steps li {
    padding: 12px 0 24px;
    border-bottom: 1px solid var(--rfm-line);
  }
  p {
    line-height: 1.8;
  }
  label {
    display: block;
    margin: 14px 0;
    line-height: 1.7;
  }
  input[type='checkbox'] {
    margin-right: 8px;
  }
  details {
    margin: 14px 0;
    line-height: 1.8;
  }
  summary {
    cursor: pointer;
  }
  .station-error {
    color: #a33126;
  }
  progress {
    width: 100%;
    height: 18px;
  }
  .axis-panel {
    padding: 14px;
    background: var(--rfm-paper);
  }
  @media (max-width: 600px) {
    .station-session {
      padding: 24px 16px;
    }
    .reservation {
      padding: 16px;
    }
    .telemetry-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 6px;
    }
    .reservation-console {
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
    }
    .telemetry-grid > div {
      padding: 10px;
    }
    .telemetry-grid strong {
      font-size: 15px;
    }
    .session-journey li {
      padding: 14px 3px;
      font-size: 11px;
    }
    .guide-steps {
      padding-left: 20px;
    }
    button {
      max-width: 100%;
    }
  }
</style>
