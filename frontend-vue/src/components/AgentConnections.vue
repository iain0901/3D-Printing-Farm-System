<template>
  <section class="hub-panel">
    <h2>MCP 與模型 skills</h2>
    <p>外部 Agent 可讀取你目前開啟的畫面，提出操作，並由你在網站確認。連線憑證僅顯示一次，30 天到期，可隨時撤銷。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <label>
      連線名稱
      <input v-model="name" maxlength="80" />
    </label>
    <button :disabled="busy || !name.trim()" @click="create">建立 MCP 連線</button>
    <template v-if="secret">
      <p>請保存連線設定，勿傳送給其他人：</p>
      <textarea readonly :value="config" aria-label="MCP 連線設定" />
      <button @click="copy">複製設定</button>
      <button @click="secret = ''">隱藏憑證</button>
    </template>
    <p v-if="notice" role="status">{{ notice }}</p>
    <article v-for="item in tokens" :key="item.id">
      <p>{{ item.name }} · {{ item.revokedAt ? '已撤銷' : `到期 ${new Date(item.expiresAt).toLocaleString('zh-TW')}` }}</p>
      <button v-if="!item.revokedAt" :disabled="busy" @click="revoke(item.id)">撤銷連線</button>
    </article>
    <h3>模型生成 skill</h3>
    <p>下載給你的 Agent 使用。說明包含尺寸確認、參數化建模、FDM 檢查與網站操作交接。</p>
    <button @click="downloadSkill">下載 SKILL.md</button>
    <h3>建立姓名牌模型</h3>
    <label>
      姓名牌文字
      <input v-model="badgeName" maxlength="24" />
    </label>
    <button :disabled="busy || !badgeName.trim()" @click="badge">下載可編輯姓名牌模型</button>
    <p>下載 OpenSCAD 原始檔，請確認字型及文字範圍後匯出 STL，再匯入線上切片。預設 80 × 28 mm，含吊孔與凸字。</p>
  </section>
</template>
<script setup>
  import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
  import customerRequest from '@/utils/customerRequest'
  import staffRequest from '@/utils/request'
  const props = defineProps({ staff: Boolean })
  function request(options) {
    return (props.staff ? staffRequest : customerRequest)({
      ...options,
      url: props.staff ? options.url.replace('/api/customer/agent', '/api/staff-agent') : options.url,
    })
  }
  const name = ref('我的 Agent'),
    secret = ref(''),
    tokens = ref([]),
    busy = ref(false),
    error = ref(''),
    notice = ref('')
  const config = computed(() =>
    JSON.stringify(
      {
        mcpServers: { '3drfm': { url: `${location.origin}/api/customer/agent/mcp`, headers: { Authorization: `Bearer ${secret.value}` } } },
      },
      null,
      2
    )
  )
  const badgeName = ref('')
  function badge() {
    return run(async () => {
      const source = await request({
        url: '/api/customer/agent/badge',
        method: 'post',
        data: { name: badgeName.value },
        responseType: 'text',
      })
      const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'name-badge.scad'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  async function load() {
    tokens.value = (await request({ url: '/api/customer/agent/status' })).tokens
  }
  async function run(fn) {
    busy.value = true
    error.value = ''
    try {
      await fn()
      await load()
    } catch (e) {
      error.value = e.response?.data?.error || '無法完成連線設定'
    } finally {
      busy.value = false
    }
  }
  const create = () =>
    run(async () => {
      secret.value = (await request({ url: '/api/customer/agent/tokens', method: 'post', data: { name: name.value } })).token
    })
  const revoke = (id) => run(() => request({ url: `/api/customer/agent/tokens/${id}`, method: 'delete' }))
  async function copy() {
    try {
      await navigator.clipboard.writeText(config.value)
      notice.value = '已複製 MCP 設定'
    } catch {
      error.value = '無法複製，請手動選取設定文字。'
    }
  }
  async function downloadSkill() {
    await run(async () => {
      const content = await request({ url: '/api/customer/agent/skills/model', responseType: 'text' })
      const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'SKILL.md'
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  onMounted(() => run(async () => {}))
  onBeforeUnmount(() => {
    secret.value = ''
  })
</script>
<style scoped>
  textarea {
    width: 100%;
    min-height: 200px;
    box-sizing: border-box;
  }
  button {
    min-height: 44px;
    padding: 8px 12px;
    margin: 6px;
  }
  article {
    border-bottom: 1px solid var(--rfm-line);
    padding: 8px 0;
  }
  input {
    min-height: 40px;
    margin: 8px;
  }
</style>
