<template>
  <div class="portal-auth-card">
    <h2>重設密碼</h2>
    <template v-if="!token">
      <p class="hint">輸入註冊時使用的 Email，我們會寄送重設連結。</p>
      <el-form label-width="70px" size="small">
        <el-form-item label="Email"><el-input v-model="email" /></el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="requestReset">寄送重設連結</el-button>
      </el-form>
    </template>
    <template v-else>
      <el-form label-width="90px" size="small">
        <el-form-item label="新密碼"><el-input v-model="password" type="password" show-password placeholder="至少 8 碼" /></el-form-item>
        <el-button type="primary" :loading="loading" style="width: 100%" @click="confirmReset">確認重設</el-button>
      </el-form>
    </template>
    <div class="portal-auth-links">
      <router-link to="/portal/login">返回登入</router-link>
    </div>
  </div>
</template>

<script>
  import { requestPasswordReset, confirmPasswordReset } from '@/api/customerAuth'

  export default {
    name: 'PortalReset',
    data() {
      return { email: '', password: '', loading: false, token: this.$route.query.resetToken || '' }
    },
    methods: {
      async requestReset() {
        if (!this.email) {
          this.$baseMessage('請輸入 Email', 'warning')
          return
        }
        this.loading = true
        try {
          await requestPasswordReset(this.email)
          this.$baseMessage('若該 Email 已註冊，重設連結已寄出', 'success')
        } finally {
          this.loading = false
        }
      },
      async confirmReset() {
        if (this.password.length < 8) {
          this.$baseMessage('密碼至少 8 碼', 'warning')
          return
        }
        this.loading = true
        try {
          await confirmPasswordReset({ token: this.token, password: this.password })
          this.$baseMessage('密碼已重設，請重新登入', 'success')
          this.$router.push('/portal/login')
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

  .hint {
    color: $base-color-gray;
    font-size: 13px;
  }

  .portal-auth-links {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    font-size: 13px;
  }
</style>
