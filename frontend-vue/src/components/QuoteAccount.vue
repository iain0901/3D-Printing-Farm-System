<template>
  <section class="quote-account" aria-label="會員登入與資料">
    <p v-if="checking" role="status">正在確認會員資料…</p>
    <template v-else-if="customer">
      <div class="account-card">
        <div>
          <span>已登入會員</span>
          <h3>{{ customer.name }}</h3>
          <p>
            {{ customer.email }}
            <template v-if="customer.phone">・{{ customer.phone }}</template>
          </p>
        </div>
        <button type="button" @click="switchAccount">切換帳號</button>
      </div>
      <p>案件名稱將由系統依「日期＋使用者＋模型序號」產生。現在尚未送出案件，不預先占用序號。</p>
    </template>
    <template v-else>
      <div class="auth-choice" aria-label="帳號操作">
        <button type="button" :aria-pressed="mode === 'login'" @click="mode = 'login'">登入會員</button>
        <button type="button" :aria-pressed="mode === 'register'" @click="mode = 'register'">建立帳號</button>
      </div>
      <form @submit.prevent="authenticate">
        <label v-if="mode === 'register'">
          姓名
          <input v-model.trim="form.name" autocomplete="name" maxlength="100" required />
        </label>
        <label>
          電子郵件
          <input v-model.trim="form.email" type="email" autocomplete="email" required />
        </label>
        <label>
          密碼
          <input
            v-model="form.password"
            type="password"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            :minlength="mode === 'register' ? 8 : undefined"
            required
          />
        </label>
        <p v-if="mode === 'register'">密碼至少 8 碼。此步驟會建立正式會員帳號，但不會送出列印訂單。</p>
        <button type="submit" :disabled="busy">{{ busy ? '處理中…' : mode === 'login' ? '登入並帶入資料' : '註冊並帶入資料' }}</button>
      </form>
      <router-link to="/portal/reset" target="_blank" rel="noopener">忘記密碼？另開視窗重設 ↗</router-link>
    </template>
    <p v-if="error" class="auth-error" role="alert">{{ error }}</p>
  </section>
</template>

<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import { useStore } from 'vuex'
  import { fetchCustomerMe, loginCustomer, registerCustomer, logoutCustomer } from '@/api/customerAuth'
  const store = useStore(),
    customer = computed(() => store.getters['customerAuth/customer'])
  const mode = ref('login'),
    busy = ref(false),
    checking = ref(false),
    error = ref('')
  const form = reactive({ name: '', email: '', password: '' })
  onMounted(async () => {
    if (!store.getters['customerAuth/accessToken'] || customer.value) return
    checking.value = true
    try {
      const result = await fetchCustomerMe({ skipCustomerAuthRedirect: true })
      store.commit('customerAuth/setCustomer', result.customer)
    } catch (err) {
      if (err.response?.status === 401) await store.dispatch('customerAuth/resetAccessToken')
      error.value = '無法確認會員資料，請重新登入；模型與設定仍保留在此頁。'
    } finally {
      checking.value = false
    }
  })
  async function authenticate() {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      const result =
        mode.value === 'login'
          ? await loginCustomer({ email: form.email, password: form.password }, { skipCustomerAuthRedirect: true })
          : await registerCustomer({ ...form }, { skipCustomerAuthRedirect: true })
      await store.dispatch('customerAuth/setSession', result)
      form.password = ''
    } catch {
      error.value = '無法完成登入或註冊，請檢查資料後再試。'
    } finally {
      busy.value = false
    }
  }
  async function switchAccount() {
    try {
      await logoutCustomer()
    } catch {
      /* Clear the local session even if offline. */
    }
    await store.dispatch('customerAuth/resetAccessToken')
    form.password = ''
  }
</script>

<style scoped>
  .quote-account {
    font-size: 13px;
    line-height: 1.8;
  }
  .account-card {
    display: flex;
    justify-content: space-between;
    align-items: start;
    gap: 20px;
    background: var(--rfm-subtle);
    padding: 20px;
  }
  h3 {
    margin: 4px 0;
    font-size: 22px;
  }
  form {
    max-width: 460px;
  }
  label {
    display: grid;
    gap: 6px;
    margin: 14px 0;
  }
  input {
    width: 100%;
    box-sizing: border-box;
    font: inherit;
    padding: 10px;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
  }
  button {
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    color: var(--rfm-ink);
    border-radius: var(--rfm-radius-control);
    padding: 10px 16px;
    font: inherit;
    cursor: pointer;
  }
  button[type='submit'],
  button[aria-pressed='true'] {
    background: var(--rfm-ink);
    color: var(--rfm-surface);
  }
  button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .auth-choice {
    display: flex;
    gap: 8px;
  }
  .auth-error {
    color: var(--rfm-danger);
  }
  a {
    display: inline-block;
    margin-top: 16px;
  }
  input:focus-visible,
  button:focus-visible {
    outline: 2px solid #9a762f;
    outline-offset: 3px;
  }
</style>
