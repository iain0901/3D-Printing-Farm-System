<template>
  <main class="oauth-callback">
    <div class="card">
      <template v-if="error">
        <h2>登入失敗</h2>
        <p>{{ errorText }}</p>
        <router-link to="/portal/login" class="back">返回登入</router-link>
      </template>
      <template v-else>
        <span class="spinner" />
        <h2>登入中…</h2>
        <p>正在為你開啟客戶入口</p>
      </template>
    </div>
  </main>
</template>

<script>
  import customerRequest from '@/utils/customerRequest'

  const ERROR_TEXT = {
    not_configured: '此登入方式尚未設定，請先使用 Email 登入或聯繫我們。',
    state_invalid: '登入連結已過期或無效，請重新嘗試。',
    profile_incomplete: '無法取得你的帳戶資訊，請改用 Email 登入。',
    email_conflict: '此 Email 已被其他帳號使用，請改用 Email 登入。',
    provider_error: '第三方登入發生錯誤，請稍後再試。',
  }

  export default {
    name: 'PortalOauthCallback',
    data() {
      return { error: '' }
    },
    computed: {
      errorText() {
        return ERROR_TEXT[this.error] || '發生未知錯誤，請重新登入。'
      },
    },
    async mounted() {
      // token 放在 hash（#token=...），不會送到 server log
      const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''))
      const token = hash.get('token')
      if (!token) {
        this.error = 'missing_token'
        return
      }
      try {
        const me = await customerRequest({
          url: '/api/customer-auth/me',
          method: 'get',
          headers: { Authorization: `Bearer ${token}` },
        })
        this.$store.commit('customerAuth/setSession', { token, customer: me.customer || me })
        this.$router.replace('/portal/dashboard')
      } catch {
        this.error = 'provider_error'
      }
    },
  }
</script>

<style lang="scss" scoped>
  .oauth-callback {
    min-height: 100vh;
    display: grid;
    place-items: center;
    background: #f5f7fb;
  }
  .card {
    background: #fff;
    border: 1px solid #e3e9f4;
    border-radius: 14px;
    padding: 40px 48px;
    text-align: center;
    h2 {
      margin: 14px 0 6px;
    }
    p {
      color: #667085;
    }
  }
  .spinner {
    display: inline-block;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    border: 3px solid #e3e9f4;
    border-top-color: #3563e9;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .back {
    color: #3563e9;
    font-weight: 700;
    text-decoration: none;
  }
</style>
