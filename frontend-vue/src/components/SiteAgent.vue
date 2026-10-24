<template>
  <aside v-if="!route.path.startsWith('/login')" data-site-agent class="site-agent">
    <div v-if="nudge && !opened" class="agent-nudge" role="status">
      <p>這次模型要用來做什麼？我可以依用途幫你看設定。</p>
      <button @click="openPurpose">告訴助理用途</button>
      <button @click="nudge = false">先自己操作</button>
    </div>
    <button v-if="!opened" class="agent-launch" :disabled="busy" @click="openPurpose">{{ busy ? '正在處理…' : '詢問列印助理' }}</button>
    <section v-else class="agent-window" aria-label="AI 列印助理">
      <header>
        <strong>3DRFM 列印助理</strong>
        <button @click="closeAssistant" aria-label="關閉列印助理">×</button>
      </header>
      <p v-if="!token">請先登入會員使用 AI 助理。</p>
      <template v-else>
        <button @click="connectionsOpen = !connectionsOpen">MCP 與 skills</button>
        <agent-connections v-if="connectionsOpen" :staff="staffMode" />
        <div v-if="review" class="agent-proposal">
          <p>{{ review.message }}</p>
          <button v-if="review.suggestedInfill !== null" @click="finishReview(false, review.suggestedInfill)">套用建議後返回檢查</button>
          <button @click="finishReview(true)">依目前設定繼續切片</button>
          <button @click="finishReview(false)">返回修改</button>
        </div>
        <p v-if="error" role="alert">{{ error }}</p>
        <div class="agent-messages" aria-live="polite">
          <p v-for="(item, i) in messages" :key="i">
            <b>{{ item.role }}：</b>
            {{ item.text }}
          </p>
        </div>
        <div v-for="(action, index) in actions" :key="index" class="agent-proposal">
          <p>{{ action.operation === 'fill' ? '修改' : '點選' }}：{{ labels[action.target] || action.target }} {{ action.value }}</p>
          <button :disabled="busy" @click="apply(action, index)">確認操作</button>
          <button :disabled="busy" @click="rejectAction(action, index)">略過</button>
        </div>
        <img v-if="image" :src="image" alt="提供給助理的參考圖片" class="agent-image" />
        <button v-if="image" @click="image = ''">移除圖片</button>
        <form @submit.prevent="send">
          <textarea v-model="text" required maxlength="4000" aria-label="給助理的訊息" placeholder="例如：幫我把填充改成 20%" />
          <div class="agent-tools">
            <label>
              選擇圖片
              <input type="file" accept="image/png,image/jpeg,image/webp" @change="attach" />
            </label>
            <button :disabled="busy || !text.trim()">{{ busy ? '處理中…' : '傳送' }}</button>
            <button type="button" :disabled="busy" @click="calling ? hangup() : call()">{{ calling ? '掛斷' : '語音通話' }}</button>
          </div>
        </form>
        <div v-if="calling">
          <p role="status">語音通話中 · {{ micMuted ? '麥克風已靜音' : '麥克風開啟' }}</p>
          <button type="button" :aria-pressed="micMuted" @click="toggleMicrophone">{{ micMuted ? '開啟麥克風' : '麥克風靜音' }}</button>
          <button v-if="audioBlocked" type="button" @click="resumeAudio">恢復語音播放</button>
        </div>
        <p class="agent-note">操作會在畫面標示並執行。文字與語音提出的修改都會先顯示確認卡。</p>
      </template>
    </section>
  </aside>
</template>
<script setup>
  import { ref, computed, watch, onBeforeUnmount } from 'vue'
  import { useStore } from 'vuex'
  import { useRoute } from 'vue-router'
  import customerRequest from '@/utils/customerRequest'
  import staffRequest from '@/utils/request'
  import AgentConnections from './AgentConnections.vue'
  import { siteContext, performSiteAction } from '@/utils/siteAgent'
  const route = useRoute(),
    store = useStore()
  const staffMode = computed(() => !(route.meta.publicService || route.path === '/' || /^\/(portal|customer|quote)(\/|$)/.test(route.path)))
  const token = computed(() => store.getters[staffMode.value ? 'user/accessToken' : 'customerAuth/accessToken'])
  const connectionsOpen = ref(false)
  function workspace(path, method = 'get', data, options = {}) {
    return (staffMode.value ? staffRequest : customerRequest)({
      url: (staffMode.value ? '/api/staff-agent' : '/api/customer/agent') + path.replace('/../agent', ''),
      method,
      data,
      ...options,
    })
  }
  const opened = ref(false),
    nudge = ref(false),
    busy = ref(false),
    error = ref(''),
    text = ref(''),
    image = ref(''),
    actions = ref([]),
    labels = ref({}),
    messages = ref([]),
    calling = ref(false)
  let timer,
    pc,
    stream,
    audio,
    callTimer,
    generation = 0
  const review = ref(null)
  const micMuted = ref(false),
    audioBlocked = ref(false)
  function toggleMicrophone() {
    micMuted.value = !micMuted.value
    stream?.getTracks().forEach((t) => {
      t.enabled = !micMuted.value
    })
  }
  async function resumeAudio() {
    try {
      await audio?.play()
      audioBlocked.value = false
    } catch {
      audioBlocked.value = true
    }
  }
  const reviewCache = new Map()
  function closeAssistant() {
    generation++
    opened.value = false
    hangup()
    finishReview(false)
  }
  let reviewResolve
  function finishReview(proceed, infill) {
    const pending = !!reviewResolve
    reviewResolve?.({ proceed, infill })
    reviewResolve = null
    review.value = null
    if (pending) opened.value = false
  }
  function entered() {
    if (sessionStorage.getItem('3drfm-purpose-asked')) return
    nudge.value = true
    messages.value.push({ role: '助理', text: '這次模型要用來做什麼？你可以告訴我用途，或直接繼續操作。' })
    sessionStorage.setItem('3drfm-purpose-asked', '1')
  }
  function openPurpose() {
    nudge.value = false
    opened.value = true
  }
  async function beforeSlice(event) {
    if (!token.value || !event.detail.purpose) {
      event.detail.resolve({ proceed: true })
      return
    }
    opened.value = true
    busy.value = true
    error.value = ''
    finishReview(false)
    reviewResolve = event.detail.resolve
    const key = generation,
      page = location.hash
    try {
      const payload = { purpose: event.detail.purpose, settings: event.detail.settings, models: event.detail.models || [] }
      const cacheKey = JSON.stringify(payload)
      const value = reviewCache.get(cacheKey) || (await workspace('/../agent/review', 'post', payload, { timeout: 65000 }))
      if (key !== generation || page !== location.hash || !reviewResolve) {
        event.detail.resolve({ proceed: false })
        return
      }
      if (reviewCache.size >= 20) reviewCache.delete(reviewCache.keys().next().value)
      reviewCache.set(cacheKey, value)
      review.value = value
    } catch {
      error.value = 'AI 建議暫時無法取得，你仍可依自己的設定切片。'
      if (key === generation && page === location.hash && reviewResolve) finishReview(true)
    } finally {
      busy.value = false
    }
  }
  window.addEventListener('3drfm:slicer-enter', entered)
  window.addEventListener('3drfm:before-slice', beforeSlice)
  function context() {
    const c = siteContext()
    labels.value = Object.fromEntries(c.controls.map((x) => [x.id, x.label]))
    return c
  }
  async function send() {
    if (busy.value) return
    const key = generation,
      message = text.value
    busy.value = true
    error.value = ''
    messages.value.push({ role: '你', text: message })
    text.value = ''
    try {
      const value = await workspace(
        '/../agent/chat',
        'post',
        {
          message,
          history: messages.value
            .slice(0, -1)
            .filter((m) => ['你', '助理'].includes(m.role))
            .slice(-10)
            .map((m) => ({ role: m.role === '你' ? 'user' : 'assistant', text: m.text.slice(0, 1500) })),
          ...(image.value ? { image: image.value } : {}),
          context: context(),
        },
        { timeout: 70000 }
      )
      if (key !== generation) return
      messages.value.push({ role: '助理', text: value.message })
      actions.value = value.actions
      image.value = ''
    } catch (e) {
      error.value = e.response?.data?.error || '助理暫時無法回應，請稍後重試。'
    } finally {
      busy.value = false
    }
  }
  async function apply(action, index) {
    busy.value = true
    error.value = ''
    const key = generation
    opened.value = false
    try {
      if (action.page && action.page !== location.hash) throw new Error('操作所屬頁面已變更')
      if (action.commandId) await workspace(`/../agent/commands/${action.commandId}/claim`, 'post', {})
      await performSiteAction(action, () => key === generation)
      if (action.commandId)
        await workspace(`/../agent/commands/${action.commandId}/result`, 'post', { state: 'completed', message: '前端已執行' })
      actions.value.splice(index, 1)
      messages.value.push({ role: '操作', text: '已在目前畫面執行，請確認結果。' })
    } catch (e) {
      error.value = e.message
    } finally {
      busy.value = false
      if (key === generation && token.value) opened.value = true
    }
  }
  async function rejectAction(action, index) {
    try {
      if (action.commandId)
        await workspace(`/../agent/commands/${action.commandId}/result`, 'post', { state: 'rejected', message: '會員略過操作' })
      actions.value.splice(index, 1)
    } catch {
      error.value = '無法更新操作狀態，請稍後重試。'
    }
  }
  async function attach(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      error.value = '請選擇 2 MB 以內的 PNG、JPEG 或 WebP 圖片。'
      return
    }
    image.value = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(file)
    })
  }
  function hangup() {
    clearTimeout(callTimer)
    pc?.close()
    stream?.getTracks().forEach((t) => t.stop())
    if (audio) {
      audio.pause()
      audio.srcObject = null
    }
    pc = null
    stream = null
    calling.value = false
    micMuted.value = false
    audioBlocked.value = false
  }
  async function call() {
    busy.value = true
    error.value = ''
    const key = generation
    try {
      const secret = await workspace('/../agent/realtime-session', 'post', {})
      if (key !== generation) return
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (key !== generation) {
        microphone.getTracks().forEach((t) => t.stop())
        return
      }
      stream = microphone
      pc = new RTCPeerConnection()
      audio = new Audio()
      audio.autoplay = true
      pc.ontrack = (e) => {
        audio.srcObject = e.streams[0]
        resumeAudio()
      }
      pc.onconnectionstatechange = () => {
        if (pc && ['failed', 'closed', 'disconnected'].includes(pc.connectionState)) hangup()
      }
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      const channel = pc.createDataChannel('oai-events')
      channel.onopen = () =>
        channel.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'realtime',
              tools: [
                {
                  type: 'function',
                  name: 'get_page_context',
                  description: '讀取目前網站可操作欄位。操作前先讀取。',
                  parameters: { type: 'object', properties: {}, additionalProperties: false },
                },
                {
                  type: 'function',
                  name: 'propose_ui_action',
                  description: '向會員提出一項網站操作，等待畫面確認，不代表已完成。',
                  parameters: {
                    type: 'object',
                    properties: {
                      target: { type: 'string' },
                      operation: { type: 'string', enum: ['fill', 'click'] },
                      value: { type: 'string' },
                    },
                    required: ['target', 'operation', 'value'],
                    additionalProperties: false,
                  },
                },
              ],
              tool_choice: 'auto',
            },
          })
        )
      channel.onmessage = (event) => {
        if (key !== generation || !pc) return
        try {
          const item = JSON.parse(event.data)
          if (item.type !== 'response.function_call_arguments.done') return
          let output
          if (item.name === 'get_page_context') output = context()
          else if (item.name === 'propose_ui_action') {
            const proposal = JSON.parse(item.arguments)
            if (!['fill', 'click'].includes(proposal.operation) || typeof proposal.value !== 'string' || !labels.value[proposal.target])
              throw new Error('操作目標無效')
            actions.value.push(proposal)
            output = { state: 'pending', message: '已顯示確認卡，等待會員確認。尚未執行。' }
          } else throw new Error('不支援的工具')
          channel.send(
            JSON.stringify({
              type: 'conversation.item.create',
              item: { type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(output) },
            })
          )
          channel.send(JSON.stringify({ type: 'response.create' }))
        } catch {
          error.value = '語音操作無法確認，請改用文字或手動操作。'
        }
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const response = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: { authorization: `Bearer ${secret.value}`, 'content-type': 'application/sdp' },
        body: offer.sdp,
        signal: AbortSignal.timeout(20000),
      })
      if (!response.ok) throw new Error('無法建立通話')
      await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() })
      calling.value = true
      callTimer = setTimeout(hangup, 10 * 60 * 1000)
    } catch {
      hangup()
      error.value = '通話未建立，請確認麥克風權限與服務設定。'
    } finally {
      busy.value = false
    }
  }
  async function poll() {
    clearTimeout(timer)
    if (!opened.value || !token.value || document.hidden) {
      timer = setTimeout(poll, 5000)
      return
    }
    const access = token.value
    try {
      await workspace('/../agent/context', 'put', context(), { skipCustomerAuthRedirect: true })
      const result = await workspace('/../agent/commands', 'get', undefined, { skipCustomerAuthRedirect: true })
      if (access === token.value)
        for (const command of result.commands)
          if (!actions.value.some((a) => a.commandId === command.id))
            actions.value.push({ ...command.action, commandId: command.id, page: command.page })
    } catch {
      /* Explicit chat shows service failures; polling never spends AI tokens. */
    }
    timer = setTimeout(poll, 10000)
  }
  watch([opened, token], (value, previous) => {
    if (value[1] !== previous?.[1]) {
      generation++
      hangup()
      finishReview(false)
      messages.value = []
      actions.value = []
      image.value = ''
      connectionsOpen.value = false
      reviewCache.clear()
      error.value = ''
    }
    poll()
  })
  watch(
    () => route.fullPath,
    () => {
      generation++
      finishReview(false)
      actions.value = []
      hangup()
    }
  )
  onBeforeUnmount(() => {
    generation++
    clearTimeout(timer)
    hangup()
    finishReview(false)
    window.removeEventListener('3drfm:slicer-enter', entered)
    window.removeEventListener('3drfm:before-slice', beforeSlice)
  })
</script>
<style scoped>
  .site-agent,
  .site-agent :deep(*) {
    /* The legacy global transition: all must not animate fixed-panel geometry. */
    transition: none;
  }
  .site-agent {
    position: fixed;
    right: 20px;
    bottom: 76px;
    z-index: 2100;
    color: var(--rfm-ink, #1b3151);
  }
  .agent-launch {
    background: #1b3151;
    color: white;
    border-radius: 30px;
    padding: 14px 20px;
  }
  .agent-nudge {
    position: fixed;
    left: 20px;
    bottom: 20px;
    width: min(290px, calc(100vw - 40px));
    padding: 14px;
    box-sizing: border-box;
    border: 1px solid var(--rfm-line, #ccd3d2);
    border-radius: 12px;
    background: var(--rfm-surface, white);
    box-shadow: 0 4px 20px #132a3522;
    font-size: 13px;
  }
  .agent-window {
    box-sizing: border-box;
    width: min(390px, calc(100vw - 24px));
    max-height: 80dvh;
    overflow: auto;
    background: var(--rfm-surface, white);
    border: 1px solid #d9dcd6;
    border-radius: 16px;
    padding: 16px;
    box-shadow: 0 8px 40px #132a3533;
  }
  header,
  .agent-tools {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  button {
    font: inherit;
    cursor: pointer;
    min-height: 44px;
    padding: 8px 12px;
    border: 1px solid #ccd3d2;
    border-radius: 8px;
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    min-height: 80px;
    font: inherit;
    padding: 10px;
    margin: 12px 0;
  }
  .agent-messages {
    max-height: 260px;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
  .agent-proposal {
    background: #f5f2ea;
    padding: 12px;
    margin: 10px 0;
    border-radius: 8px;
  }
  .agent-image {
    max-width: 120px;
    max-height: 100px;
  }
  input[type='file'] {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .agent-tools label {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    cursor: pointer;
    padding: 0 12px;
    border: 1px solid #ccd3d2;
    border-radius: 8px;
  }
  .agent-note {
    font-size: 12px;
    line-height: 1.7;
    color: #627078;
  }
  @media (max-width: 600px) {
    .site-agent {
      right: 12px;
      bottom: 76px;
    }
  }
</style>
