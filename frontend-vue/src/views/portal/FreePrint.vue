<template>
  <public-shell>
    <main class="station-session studio-wrap">
      <p class="eyebrow">清華大學水木書苑 ／ 3DSTU_PETG</p>
      <h1>一步一步，完成你的免費列印。</h1>
      <p>先完成切片並排隊。輪到你時會寄 Email；列印完成後，也會通知你來清空平台。</p>
      <quote-account v-if="!memberToken" />
      <template v-else>
        <p v-if="error" role="alert" class="station-error">{{ error }}</p>
        <p v-if="notice" role="status">{{ notice }}</p>
        <div class="station-toolbar">
          <router-link to="/free-print/nthu-shuimu/slicer">準備模型與切片 ↗</router-link>
          <button type="button" :disabled="busy" @click="load">更新狀態</button>
        </div>
        <p>{{ state.station?.availability }}</p>
        <p v-if="loading" role="status">正在讀取你的使用時段…</p>
        <article v-for="item in state.reservations" :key="item.id" class="reservation">
          <header>
            <h2>{{ item.statusLabel }}</h2>
            <span>預估 {{ Math.ceil(item.estimatedMinutes) }} 分鐘</span>
          </header>
          <template v-if="item.status === 'queued'">
            <p>你目前是等待中的第 {{ item.position }} 位。請等 Email 或此頁通知，再到場操作。</p>
            <button type="button" :disabled="busy" @click="act(item, 'cancel')">取消這次排隊</button>
          </template>
          <template v-if="item.status === 'notified'">
            <p>現在可以到水木書苑列印。請在 {{ time(item.leaseExpiresAt) }} 前到場報到。</p>
            <p>到場後先找到指定機台，再按下方按鈕。</p>
            <button class="primary" type="button" :disabled="busy" @click="act(item, 'checkin')">我已到場，開始準備</button>
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
                <button type="button" :disabled="busy" @click="act(item, 'home')">機台範圍已淨空，執行歸零</button>
              </li>
              <li>
                <h3>準備耗材</h3>
                <p>使用站點指定的 3DSTU_PETG。若耗材已裝好，可直接完成下方確認。</p>
                <details>
                  <summary>？如何進料與退料？</summary>
                  <p>先預熱，等畫面溫度達到設定後，把耗材放入進料口。每次進料或退料移動 10 mm；若卡料，請請站點人員協助。</p>
                </details>
                <div class="station-controls">
                  <button type="button" :disabled="busy" @click="act(item, 'preheat')">預熱耗材</button>
                  <button type="button" :disabled="busy || !state.telemetry?.extrusionReady" @click="act(item, 'load')">進料 10 mm</button>
                  <button type="button" :disabled="busy || !state.telemetry?.extrusionReady" @click="act(item, 'unload')">
                    退料 10 mm
                  </button>
                  <button type="button" :disabled="busy" @click="act(item, 'cooldown')">停止加熱</button>
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
                  :disabled="busy || !state.telemetry?.homed || !checks.bedClear || !checks.filamentReady || !checks.areaClear"
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
                  :disabled="busy || !state.telemetry?.homed || !state.telemetry?.position"
                  :aria-label="`${axis.toUpperCase()} 軸減少 ${distance} mm`"
                  @click="act(item, 'jog', { axis, distance: -distance })"
                >
                  − {{ distance }} mm
                </button>
                <button
                  type="button"
                  :disabled="busy || !state.telemetry?.homed || !state.telemetry?.position"
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
                :disabled="busy || !abandonClear"
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
              v-if="state.telemetry?.progress !== undefined"
              :value="state.telemetry.progress"
              max="100"
              aria-label="實際列印進度"
            />
            <div class="station-controls">
              <button v-if="item.status === 'printing'" :disabled="busy" @click="act(item, 'pause')">暫停列印</button>
              <button v-if="item.status === 'paused'" :disabled="busy" @click="act(item, 'resume')">繼續列印</button>
              <button v-if="item.status !== 'starting'" :disabled="busy" @click="act(item, 'cancel')">停止這次列印</button>
            </div>
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
              :disabled="busy || !removed"
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
        </article>
        <p v-if="!loading && !state.reservations.length">目前沒有排隊紀錄。請先準備模型，切片完成後按「加入免費列印排隊」。</p>
      </template>
    </main>
  </public-shell>
</template>
<script setup>
  import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
  import { useStore } from 'vuex'
  import PublicShell from '@/components/public/PublicShell.vue'
  import QuoteAccount from '@/components/QuoteAccount.vue'
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
  let timer,
    active = true,
    requestKey = null
  const time = (value) => new Date(value).toLocaleString('zh-TW')
  const mailStatus = (s) =>
    ({ sent: '已寄出', pending: '等待寄送', retry: '稍後重試', sending: '寄送中', failed: '寄送失敗，請查看此頁通知' }[s] || s)
  async function load() {
    clearTimeout(timer)
    if (!memberToken.value || busy.value) return
    loading.value = true
    try {
      const next = await workspace('/free-print/station', 'get', undefined, { skipCustomerAuthRedirect: true })
      if (active) state.value = next
    } catch (e) {
      if (active) error.value = e.response?.data?.error || '無法更新狀態，請稍後重試。'
    } finally {
      loading.value = false
      if (active) timer = setTimeout(load, 5000)
    }
  }
  async function act(item, action, extra = {}) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    notice.value = ''
    const signature = JSON.stringify([item.id, action, extra])
    if (requestKey?.signature !== signature) requestKey = { signature, id: crypto.randomUUID() }
    try {
      state.value = await workspace(
        `/free-print/reservations/${item.id}/action`,
        'post',
        { action, requestId: requestKey.id, ...extra },
        { timeout: 60000, skipCustomerAuthRedirect: true }
      )
      requestKey = null
      notice.value = '操作已送出，請依畫面查看機台。'
      if (['home', 'jog'].includes(action)) {
        checks.bedClear = false
        checks.areaClear = false
      }
      if (['load', 'unload'].includes(action)) checks.filamentReady = false
    } catch (e) {
      error.value = e.response?.data?.error || '操作結果尚未確認，請更新狀態後查看機台。'
    } finally {
      busy.value = false
      clearTimeout(timer)
      timer = setTimeout(load, 1000)
    }
  }
  async function start(item) {
    await act(item, 'checks', { checks: { ...checks } })
    if (!error.value) await act(item, 'start')
  }
  watch(memberToken, load, { immediate: true })
  watch(
    () => state.value.reservations.find((r) => r.canControl)?.id,
    () => {
      Object.assign(checks, { bedClear: false, filamentReady: false, areaClear: false })
      removed.value = false
      abandonClear.value = false
    }
  )
  onBeforeUnmount(() => {
    active = false
    clearTimeout(timer)
  })
</script>
<style scoped>
  .station-session {
    padding-block: 48px;
    max-width: 960px;
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
    .guide-steps {
      padding-left: 20px;
    }
    button {
      max-width: 100%;
    }
  }
</style>
