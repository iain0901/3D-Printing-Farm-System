<template>
  <auth-shell
    :title="token ? '設定新的密碼。' : '別擔心，找回就好。'"
    :description="token ? '為你的帳號設定至少 8 碼的新密碼。' : '輸入註冊時使用的電子郵件，我們會寄送重設連結。'"
  >
    <el-form v-if="!token" label-position="top" size="large" @submit.prevent="requestReset">
      <el-form-item label="電子郵件">
        <el-input v-model.trim="email" type="email" autocomplete="email" placeholder="請輸入註冊時的電子郵件" />
      </el-form-item>
      <el-button class="auth-submit" type="primary" native-type="submit" :loading="loading">寄送重設連結 ↗</el-button>
    </el-form>
    <el-form v-else label-position="top" size="large" @submit.prevent="confirmReset">
      <el-form-item label="新密碼">
        <el-input v-model="password" type="password" autocomplete="new-password" show-password placeholder="設定至少 8 碼的密碼" />
      </el-form-item>
      <el-button class="auth-submit" type="primary" native-type="submit" :loading="loading">確認重設密碼 ↗</el-button>
    </el-form>
    <div class="auth-links"><router-link to="/portal/login">← 返回會員登入</router-link></div>
    <p class="auth-note">若沒有收到信件，請確認信箱地址，並檢查垃圾郵件匣。</p>
  </auth-shell>
</template>

<script>
  import AuthShell from '@/components/public/AuthShell.vue'
  import { requestPasswordReset, confirmPasswordReset } from '@/api/customerAuth'

  export default {
    components: { AuthShell },
    name: 'PortalReset',
    data() {
      return { email: '', password: '', loading: false }
    },
    computed: {
      token() {
        return this.$route.query.resetToken || ''
      },
    },
    methods: {
      async requestReset() {
        if (this.loading) return
        if (!this.email) {
          this.$baseMessage('請輸入電子郵件', 'warning')
          return
        }
        this.loading = true
        try {
          await requestPasswordReset(this.email)
          this.$baseMessage('若該電子郵件已註冊，重設連結已寄出', 'success')
        } catch {
          // customerRequest 已顯示錯誤訊息，保留輸入內容以便重試。
        } finally {
          this.loading = false
        }
      },
      async confirmReset() {
        if (this.loading) return
        if (this.password.length < 8) {
          this.$baseMessage('密碼至少 8 碼', 'warning')
          return
        }
        this.loading = true
        try {
          await confirmPasswordReset({ token: this.token, password: this.password })
          this.$baseMessage('密碼已重設，請重新登入', 'success')
          this.$router.push('/portal/login')
        } catch {
          // customerRequest 已顯示錯誤訊息，保留輸入內容以便重試。
        } finally {
          this.loading = false
        }
      },
    },
  }
</script>
