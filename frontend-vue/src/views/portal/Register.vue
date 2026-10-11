<template>
  <auth-shell title="給好點子，一個家。" description="建立帳號，讓你的製作需求與案件有跡可循。">
    <el-form label-position="top" size="large" @submit.prevent="submit">
      <el-form-item label="姓名"><el-input v-model="form.name" autocomplete="name" placeholder="我們該怎麼稱呼你？" /></el-form-item>
      <el-form-item label="電子郵件">
        <el-input v-model.trim="form.email" type="email" autocomplete="email" placeholder="請輸入電子郵件" />
      </el-form-item>
      <el-form-item label="電話（選填）">
        <el-input v-model="form.phone" type="tel" autocomplete="tel" placeholder="方便聯繫的電話" />
      </el-form-item>
      <el-form-item label="密碼">
        <el-input v-model="form.password" type="password" autocomplete="new-password" show-password placeholder="設定至少 8 碼的密碼" />
      </el-form-item>
      <el-button class="auth-submit" type="primary" native-type="submit" :loading="loading">建立我的帳號 ↗</el-button>
    </el-form>
    <div class="auth-links">
      <span>已經有帳號了？</span>
      <router-link to="/portal/login">直接登入 →</router-link>
    </div>
  </auth-shell>
</template>

<script>
  import AuthShell from '@/components/public/AuthShell.vue'
  import { registerCustomer } from '@/api/customerAuth'

  export default {
    components: { AuthShell },
    name: 'PortalRegister',
    data() {
      return { form: { name: '', email: '', phone: '', password: '' }, loading: false }
    },
    methods: {
      async submit() {
        if (this.loading) return
        if (!this.form.name || !this.form.email || this.form.password.length < 8) {
          this.$baseMessage('請填寫姓名、電子郵件，密碼至少 8 碼', 'warning')
          return
        }
        this.loading = true
        try {
          const result = await registerCustomer(this.form)
          this.$store.dispatch('customerAuth/setSession', result)
          this.$router.push('/portal/dashboard')
        } catch {
          // customerRequest 已顯示錯誤訊息，保留輸入內容以便重試。
        } finally {
          this.loading = false
        }
      },
    },
  }
</script>
