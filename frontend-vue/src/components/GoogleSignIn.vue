<template>
  <div v-if="enabled" class="google-sign-in">
    <el-button :loading="busy" :disabled="disabled" size="large" native-type="button" @click="start">
      <svg v-if="!busy" width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.17v5h6.6c3.86-3.55 6.09-8.78 6.09-14.67Z" />
        <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.51-4.95l-6.6-5c-1.83 1.23-4.17 1.96-6.91 1.96-5.33 0-9.84-3.6-11.45-8.44h-6.8v5.15A20.4 20.4 0 0 0 24 44Z" />
        <path fill="#FBBC05" d="M12.55 27.57a12.2 12.2 0 0 1 0-7.14v-5.15h-6.8a20.4 20.4 0 0 0 0 17.44l6.8-5.15Z" />
        <path fill="#EA4335" d="M24 12c3 0 5.7 1.03 7.82 3.04l5.86-5.86C34.13 5.87 29.51 4 24 4A20.4 20.4 0 0 0 5.75 15.28l6.8 5.15C14.16 15.6 18.67 12 24 12Z" />
      </svg>
      {{ mode === 'link' ? '連結 Google 帳戶' : '使用 Google 帳戶登入' }}
    </el-button>
    <p v-if="preservePage">將另開視窗登入，模型與設定會保留在此頁。</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<script setup>
  import { onMounted, onBeforeUnmount, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { useStore } from 'vuex'
  import { fetchCustomerMe } from '@/api/customerAuth'
  import customerRequest from '@/utils/customerRequest'
  const props = defineProps({ mode: { type: String, default: 'login' }, returnTo: { type: String, default: '' }, disabled: Boolean, preservePage: Boolean })
  const route = useRoute()
  const store = useStore()
  const enabled = ref(false), busy = ref(false), error = ref(''), notice = ref('')
  let awaitingSignIn = false
  async function receiveSession(event) {
    if (!awaitingSignIn || event.storageArea !== window.localStorage || event.key !== 'layerpilot-customer-token' || !event.newValue) return
    awaitingSignIn = false
    await store.dispatch('customerAuth/setSession', { token: event.newValue, customer: null })
    try {
      const result = await fetchCustomerMe({ skipCustomerAuthRedirect: true })
      await store.dispatch('customerAuth/setSession', { token: event.newValue, customer: result.customer })
      notice.value = '已登入，會員資料已帶入。'
    } catch {
      if (store.getters['customerAuth/accessToken'] === event.newValue) await store.dispatch('customerAuth/resetAccessToken')
      error.value = '無法確認登入結果，請重新登入。'
    }
  }
  onMounted(async () => {
    if (props.preservePage) window.addEventListener('storage', receiveSession)
    try { enabled.value = (await customerRequest.get('/api/customer-auth/google/config')).enabled } catch { /* Email login remains available. */ }
  })
  onBeforeUnmount(() => window.removeEventListener('storage', receiveSession))
  async function start() {
    if (busy.value || props.disabled) return
    busy.value = true
    error.value = ''
    let popup
    try {
      if (props.preservePage) {
        popup = window.open('about:blank', '_blank')
        if (!popup) throw new Error('Popup blocked')
        popup.opener = null
      }
      const result = await customerRequest.post('/api/customer-auth/google/start', {
        mode: props.mode, returnTo: props.returnTo || route.query.redirect || route.fullPath,
      }, { skipCustomerAuthRedirect: true })
      const target = new URL(result.url)
      if (target.origin !== 'https://accounts.google.com' || target.pathname !== '/o/oauth2/v2/auth') throw new Error('Invalid provider URL')
      if (popup) {
        awaitingSignIn = true
        popup.location.replace(target.href)
        notice.value = '請在新視窗完成登入，再回到此頁繼續。'
        busy.value = false
      } else window.location.assign(target.href)
    } catch {
      popup?.close()
      error.value = '暫時無法開始 Google 登入，請允許開啟視窗、稍後重試或使用 Email 登入。'
      busy.value = false
    }
  }
</script>

<style scoped>
  .google-sign-in { margin: 16px 0; }
  .google-sign-in .el-button { width: 100%; white-space: normal; min-height: 44px; height: auto; padding: 12px; }
  svg { flex-shrink: 0; margin-right: 10px; }
</style>
