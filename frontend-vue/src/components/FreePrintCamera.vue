<template>
  <section class="printer-camera" aria-label="列印機即時影像">
    <header>
      <div>
        <p class="camera-eyebrow">你的使用時段限定</p>
        <h3>即時影像</h3>
      </div>
      <span class="camera-badge" :class="{ live: status === 'live' }" role="status">{{ labels[status] }}</span>
    </header>
    <div ref="screen" class="camera-screen" :class="{ contain }" :aria-busy="status === 'loading'">
      <img v-if="source && session?.kind !== 'video'" :key="source" :src="source" alt="站點列印機即時畫面" @load="onImage" @error="fail" />
      <video
        v-if="source && session?.kind === 'video'"
        ref="video"
        :key="source"
        :src="source"
        muted
        autoplay
        playsinline
        @playing="onLive"
        @waiting="onWaiting"
        @stalled="fail"
        @error="fail"
        @ended="fail"
      />
      <div v-if="status !== 'live'" class="camera-placeholder" role="status">
        <span class="camera-symbol" aria-hidden="true">◉</span>
        <strong>{{ titles[status] }}</strong>
        <p>{{ message || descriptions[status] }}</p>
      </div>
    </div>
    <div class="camera-tools">
      <button v-if="allowed" type="button" :disabled="status === 'loading'" @click="connect">
        {{ source ? '重新連線' : '連接即時影像' }}
      </button>
      <button v-if="source" type="button" @click="pause">暫停觀看</button>
      <button v-if="source" type="button" :aria-pressed="contain" @click="contain = !contain">
        {{ contain ? '填滿畫面' : '完整畫面' }}
      </button>
      <button v-if="source && fullscreenSupported" type="button" @click="fullscreen">全螢幕</button>
    </div>
    <p class="camera-caption">
      {{
        lastFrame ? `${session?.kind === 'snapshot' ? '最近收到影像' : '本次開始接收'}：${lastFrame}` : '影像尚未連接'
      }}。影像可能延遲，操作前仍須在現場確認。
    </p>
    <details>
      <summary>？誰可以觀看？會儲存錄影嗎？</summary>
      <p>
        只有目前使用時段的會員可以申請影像連線。時段結束、登出或離開此頁，介面會停止觀看。這裡是即時影像，不代表已錄影或儲存；請勿以影像取代現場安全確認。
      </p>
    </details>
  </section>
</template>
<script setup>
  import { ref, watch, onBeforeUnmount } from 'vue'
  import { workspace } from '@/api/memberWorkspace'
  import { cameraSession } from '@/api/freePrintCamera'
  const props = defineProps({
    reservationId: { type: String, required: true },
    allowed: Boolean,
    accessToken: { type: String, default: '' },
  })
  const status = ref('locked'),
    message = ref(''),
    source = ref(''),
    session = ref(null),
    lastFrame = ref(''),
    contain = ref(true),
    screen = ref(null),
    video = ref(null)
  const fullscreenSupported = !!document.fullscreenEnabled
  const labels = {
    locked: '時段未開放',
    loading: '連線中',
    live: '正在接收影像',
    unconfigured: '尚未連接',
    error: '連線中斷',
    paused: '已暫停觀看',
    unsupported: '瀏覽器不支援',
  }
  const titles = {
    locked: '輪到你時才能觀看',
    loading: '正在連接站點攝影機',
    unconfigured: '攝影機尚未連接',
    error: '目前無法取得影像',
    paused: '影像已暫停',
    unsupported: '無法播放此影像格式',
  }
  const descriptions = {
    locked: '排隊期間不會顯示其他使用者的畫面。',
    loading: '請稍候，正在確認觀看權限並等待影像。',
    unconfigured: '站點尚未提供影像來源。接上攝影機後，就能在你的時段查看。',
    error: '請確認網路後重新連線。攝影機中斷不代表列印已停止。',
    paused: '按「連接即時影像」繼續觀看。暫停觀看不會暫停列印。',
    unsupported: '請使用支援此格式的瀏覽器，或請站點調整影像格式。',
  }
  let generation = 0,
    controller,
    renewal,
    watchdog,
    frameTimer,
    blobUrl,
    disposed = false
  function stop() {
    generation++
    controller?.abort()
    clearTimeout(renewal)
    clearTimeout(watchdog)
    clearTimeout(frameTimer)
    video.value?.pause()
    source.value = ''
    session.value = null
    lastFrame.value = ''
    if (blobUrl) URL.revokeObjectURL(blobUrl)
    blobUrl = null
  }
  function pause() {
    stop()
    status.value = 'paused'
    message.value = ''
  }
  function fail() {
    stop()
    status.value = 'error'
    message.value = ''
  }
  function onLive() {
    if (!source.value) return
    clearTimeout(watchdog)
    status.value = 'live'
    lastFrame.value = new Date().toLocaleTimeString('zh-TW')
  }
  function onWaiting() {
    if (source.value) {
      status.value = 'loading'
      clearTimeout(watchdog)
      watchdog = setTimeout(fail, 15000)
    }
  }
  function onImage() {
    onLive()
    if (session.value?.kind === 'snapshot') frameTimer = setTimeout(fetchFrame, 1000)
  }
  async function fetchFrame() {
    const key = generation
    try {
      const path = session.value.mediaUrl.replace('/api/customer/workspace', '')
      const frame = await workspace(path, 'get', undefined, {
        signal: controller.signal,
        responseType: 'blob',
        timeout: 10000,
        skipCustomerAuthRedirect: true,
      })
      if (key !== generation || disposed) return
      if (!frame.type.startsWith('image/')) throw new Error('影像格式無效')
      const previous = blobUrl
      blobUrl = URL.createObjectURL(frame)
      source.value = blobUrl
      if (previous) URL.revokeObjectURL(previous)
      watchdog = setTimeout(fail, 15000)
    } catch {
      if (key === generation && !disposed) fail()
    }
  }
  async function connect() {
    stop()
    message.value = ''
    if (!props.allowed || !props.accessToken) {
      status.value = 'locked'
      return
    }
    if (document.hidden) {
      status.value = 'paused'
      return
    }
    const key = generation
    controller = new AbortController()
    status.value = 'loading'
    try {
      const value = await workspace(
        `/free-print/reservations/${encodeURIComponent(props.reservationId)}/camera-session`,
        'post',
        {},
        { signal: controller.signal, timeout: 15000, skipCustomerAuthRedirect: true }
      )
      if (key !== generation || disposed) return
      session.value = cameraSession(value, props.reservationId)
      if (!session.value) {
        status.value = 'unconfigured'
        return
      }
      if (session.value.kind === 'video' && !document.createElement('video').canPlayType(session.value.mimeType || 'video/mp4')) {
        stop()
        status.value = 'unsupported'
        return
      }
      renewal = setTimeout(connect, Math.max(1000, session.value.expires - Date.now() - 3000))
      if (session.value.kind === 'snapshot') await fetchFrame()
      else {
        source.value = session.value.mediaUrl
        watchdog = setTimeout(fail, 15000)
      }
    } catch (e) {
      if (key !== generation || disposed) return
      stop()
      status.value = e.response?.status === 403 || e.response?.status === 404 ? 'locked' : 'error'
      message.value = e.response?.data?.error || '無法建立影像連線，請確認網路後重新連線。'
    }
  }
  async function fullscreen() {
    try {
      await screen.value?.requestFullscreen()
    } catch {
      message.value = '此瀏覽器無法開啟全螢幕，請使用完整畫面觀看。'
    }
  }
  function visibility() {
    if (document.hidden && props.allowed) pause()
  }
  document.addEventListener('visibilitychange', visibility)
  watch(() => [props.reservationId, props.allowed, props.accessToken], connect, { immediate: true })
  onBeforeUnmount(() => {
    disposed = true
    stop()
    document.removeEventListener('visibilitychange', visibility)
  })
</script>
<style scoped>
  .printer-camera {
    border: 1px solid var(--rfm-line);
    border-radius: 16px;
    padding: 20px;
    margin: 24px 0;
    min-width: 0;
    background: var(--rfm-paper);
  }
  header,
  .camera-tools {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
  }
  h3 {
    margin: 4px 0 16px;
    font-size: 21px;
  }
  .camera-eyebrow,
  .camera-caption {
    margin: 0;
    color: var(--rfm-muted);
    font-size: 12px;
    line-height: 1.8;
  }
  .camera-badge {
    border-radius: 30px;
    padding: 6px 12px;
    font-size: 12px;
    background: var(--rfm-surface);
  }
  .camera-badge.live {
    color: #205943;
    background: #e0eee5;
  }
  .camera-screen {
    aspect-ratio: 16 / 9;
    position: relative;
    overflow: hidden;
    border-radius: 10px;
    background: #17272a;
    color: #f2f5f3;
  }
  .camera-screen img,
  .camera-screen video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .camera-screen.contain img,
  .camera-screen.contain video {
    object-fit: contain;
  }
  .camera-placeholder {
    position: absolute;
    inset: 0;
    background: #17272a;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    text-align: center;
    padding: 16px;
    gap: 8px;
  }
  .camera-placeholder p {
    max-width: 360px;
    font-size: 13px;
    line-height: 1.7;
    margin: 0;
    color: #b7c7c5;
  }
  .camera-symbol {
    font-size: 30px;
    line-height: 1;
    color: #86a6a0;
  }
  .camera-tools {
    justify-content: flex-start;
    margin: 12px 0;
  }
  button {
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    color: var(--rfm-ink);
    border-radius: 8px;
    min-height: 44px;
    padding: 8px 12px;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  details {
    font-size: 13px;
    line-height: 1.8;
    margin-top: 12px;
  }
  summary {
    cursor: pointer;
  }
  @media (max-width: 600px) {
    .printer-camera {
      padding: 12px;
    }
    .camera-screen {
      aspect-ratio: 4 / 3;
    }
    .camera-placeholder {
      padding: 10px;
      gap: 4px;
    }
    .camera-symbol {
      font-size: 24px;
    }
  }
</style>
