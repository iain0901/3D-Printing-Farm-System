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
    <div class="portal-auth-links">
      <router-link to="/portal/login">已經有帳號？登入</router-link>
    </div>
  </div>
</template>

<script>
  import { registerCustomer } from '@/api/customerAuth'

  export default {
    name: 'PortalRegister',
    data() {
      return { form: { name: '', email: '', phone: '', password: '' }, loading: false }
    },
    methods: {
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

  .portal-auth-links {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    font-size: 13px;
  }
</style>
