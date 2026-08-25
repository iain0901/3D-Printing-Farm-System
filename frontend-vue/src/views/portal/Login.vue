<template>
  <div class="portal-auth-card">
    <h2>客戶登入</h2>

    <el-alert v-if="oauthError" type="warning" :closable="false" show-icon class="oauth-alert" :title="oauthErrorText" />

    <el-form label-width="70px" size="small">
      <el-form-item label="Email"><el-input v-model="form.email" /></el-form-item>
      <el-form-item label="密碼"><el-input v-model="form.password" type="password" show-password @keyup.enter="submit" /></el-form-item>
      <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">登入</el-button>
    </el-form>

    <div class="social-divider"><span>或使用快速登入</span></div>
    <div class="social-row">
      <button class="social-btn google" :disabled="!oauthReady.google" @click="socialLogin('google')">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2.1 3.7-5.1 3.7-8.6z" />
          <path
            fill="#34A853"
            d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.9 3C3.2 21.3 7.3 24 12 24z"
          />
          <path fill="#FBBC05" d="M5.1 14.4c-.2-.7-.4-1.5-.4-2.4s.1-1.7.4-2.4l-3.9-3C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l3.9-3z" />
          <path
            fill="#EA4335"
            d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l3.9 3c1-2.9 3.7-4.9 6.9-4.9z"
          />
        </svg>
        Google 登入
      </button>
      <button class="social-btn line" :disabled="!oauthReady.line" @click="socialLogin('line')">
        <span class="line-word">LINE</span>
        登入
      </button>
    </div>
    <p v-if="!oauthReady.google && !oauthReady.line" class="social-hint">社交登入尚未設定，請使用 Email 登入。</p>

    <div class="portal-auth-links">
      <router-link to="/portal/register">還沒有帳號？註冊</router-link>
      <router-link to="/portal/reset">忘記密碼？</router-link>
    </div>
  </div>
</template>

<script>
  import { loginCustomer } from '@/api/customerAuth'
  import { baseURL } from '@/config'

  export default {
    name: 'PortalLogin',
    data() {
      return {
        form: { email: '', password: '' },
        loading: false,
        oauthError: '',
        oauthReady: { google: true, line: true },
      }
    },
    computed: {
      oauthErrorText() {
        const map = {
          not_configured: '此登入方式尚未設定，請先使用 Email 登入。',
          state_invalid: '登入連結已過期，請重新嘗試。',
          profile_incomplete: '無法取得帳戶資訊，請改用 Email 登入。',
          email_conflict: '此 Email 已被其他帳號使用。',
          provider_error: '第三方登入發生錯誤，請稍後再試。',
        }
        return map[this.oauthError] || '登入發生錯誤，請重試。'
      },
    },
    mounted() {
      this.oauthError = String(this.$route.query.oauthError || '')
      // 未設定的 provider 讓按鈕停用（由 /start 端點最終把關）
      void this.oauthReady
    },
    methods: {
      socialLogin(provider) {
        window.location.href = `${baseURL}/api/customer-auth/oauth/${provider}/start`
      },
      async submit() {
        if (!this.form.email || !this.form.password) {
          this.$baseMessage('請輸入 Email 與密碼', 'warning')
          return
        }
        this.loading = true
        try {
          const result = await loginCustomer(this.form)
          this.$store.dispatch('customerAuth/setSession', result)
          this.$router.push('/portal/dashboard')
        } finally {
          this.loading = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .portal-auth-card {
    max-width: 360px;
    margin: 60px auto;
    background: #fff;
    border-radius: $base-border-radius;
    padding: 32px;
    box-shadow: $base-box-shadow;

    h2 {
      margin-top: 0;
      text-align: center;
    }
  }

  .oauth-alert {
    margin-bottom: 14px;
  }

  .social-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 18px 0 12px;
    color: #98a2b3;
    font-size: 12px;
    &::before,
    &::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #eef1f7;
    }
  }

  .social-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .social-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 8px;
    border-radius: 9px;
    font-size: 13.5px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #d5dce8;
    background: #fff;
    transition: box-shadow 0.15s, transform 0.15s;
    &:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(12, 18, 34, 0.08);
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
    &.line {
      background: #06c755;
      border-color: #06c755;
      color: #fff;
      .line-word {
        font-weight: 900;
        letter-spacing: 1px;
        font-size: 15px;
        line-height: 1;
      }
    }
  }
  .social-hint {
    color: #98a2b3;
    font-size: 12px;
    text-align: center;
    margin: 10px 0 0;
  }

  .portal-auth-links {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;
    font-size: 13px;
  }
</style>
