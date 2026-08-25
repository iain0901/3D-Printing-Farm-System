<template>
  <div class="portal-auth-card">
    <h2>建立客戶帳號</h2>
    <el-form label-width="70px" size="small">
      <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
      <el-form-item label="Email"><el-input v-model="form.email" /></el-form-item>
      <el-form-item label="電話"><el-input v-model="form.phone" /></el-form-item>
      <el-form-item label="密碼"><el-input v-model="form.password" type="password" show-password placeholder="至少 8 碼" /></el-form-item>
      <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">註冊</el-button>
    </el-form>

    <div class="social-divider"><span>或使用快速註冊</span></div>
    <div class="social-row">
      <button class="social-btn google" @click="socialLogin('google')">
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
        Google 註冊
      </button>
      <button class="social-btn line" @click="socialLogin('line')">
        <span class="line-word">LINE</span>
        註冊
      </button>
    </div>

    <div class="portal-auth-links">
      <router-link to="/portal/login">已經有帳號？登入</router-link>
    </div>
  </div>
</template>

<script>
  import { registerCustomer } from '@/api/customerAuth'
  import { baseURL } from '@/config'

  export default {
    name: 'PortalRegister',
    data() {
      return { form: { name: '', email: '', phone: '', password: '' }, loading: false }
    },
    methods: {
      socialLogin(provider) {
        window.location.href = `${baseURL}/api/customer-auth/oauth/${provider}/start`
      },
      async submit() {
        if (!this.form.name || !this.form.email || this.form.password.length < 8) {
          this.$baseMessage('請填寫姓名、Email，密碼至少 8 碼', 'warning')
          return
        }
        this.loading = true
        try {
          const result = await registerCustomer(this.form)
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
    &:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(12, 18, 34, 0.08);
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
  .portal-auth-links {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    font-size: 13px;
  }
</style>
