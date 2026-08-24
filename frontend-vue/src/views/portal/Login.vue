<template>
  <div class="portal-auth-card">
    <h2>客戶登入</h2>
    <el-form label-width="70px" size="small">
      <el-form-item label="Email"><el-input v-model="form.email" /></el-form-item>
      <el-form-item label="密碼"><el-input v-model="form.password" type="password" show-password @keyup.enter="submit" /></el-form-item>
      <el-button type="primary" :loading="loading" style="width: 100%" @click="submit">登入</el-button>
    </el-form>
    <div class="portal-auth-links">
      <router-link to="/portal/register">還沒有帳號？註冊</router-link>
      <router-link to="/portal/reset">忘記密碼？</router-link>
    </div>
  </div>
</template>

<script>
  import { loginCustomer } from '@/api/customerAuth'

  export default {
    name: 'PortalLogin',
    data() {
      return { form: { email: '', password: '' }, loading: false }
    },
    methods: {
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

  .portal-auth-links {
    display: flex;
    justify-content: space-between;
    margin-top: 16px;
    font-size: 13px;
  }
</style>
