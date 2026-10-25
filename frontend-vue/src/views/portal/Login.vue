<template>
  <auth-shell title="歡迎回來。" description="登入會員中心，接著完成你的下一件作品。">
    <el-form label-position="top" size="large" @submit.prevent="submit">
      <el-form-item label="電子郵件">
        <el-input v-model.trim="form.email" type="email" autocomplete="email" placeholder="請輸入電子郵件" />
      </el-form-item>
      <el-form-item label="密碼">
        <el-input v-model="form.password" type="password" autocomplete="current-password" show-password placeholder="請輸入密碼" />
      </el-form-item>
      <el-button class="auth-submit" type="primary" native-type="submit" :loading="loading">登入會員中心</el-button>
    </el-form>
    <div class="auth-links">
      <router-link :to="{ path: '/portal/register', query: { redirect: $route.query.redirect } }">第一次來？建立帳號</router-link>
      <router-link to="/portal/reset">忘記密碼？</router-link>
    </div>
    <p class="auth-note">
      只是想先了解價格？
      <router-link to="/quote" class="guest-estimate">不用登入，先試試估價 →</router-link>
    </p>
  </auth-shell>
</template>

<script>
  import AuthShell from '@/components/public/AuthShell.vue'
  import { loginCustomer } from '@/api/customerAuth'
  import { memberReturnPath } from '@/utils/member-return.mjs'

  export default {
    components: { AuthShell },
    name: 'PortalLogin',
    data() {
      return { form: { email: '', password: '' }, loading: false }
    },
    methods: {
      async submit() {
        if (this.loading) return
        if (!this.form.email || !this.form.password) {
          this.$baseMessage('請輸入電子郵件與密碼', 'warning')
          return
        }
        this.loading = true
        try {
          const result = await loginCustomer(this.form)
          this.$store.dispatch('customerAuth/setSession', result)
          this.$router.push(memberReturnPath(this.$route.query.redirect))
        } catch {
          // customerRequest 已顯示錯誤訊息，保留輸入內容以便重試。
        } finally {
          this.loading = false
        }
      },
    },
  }
</script>
<style scoped>
  .guest-estimate {
    display: flex;
    justify-content: center;
    margin-top: 12px;
    padding: 12px 18px;
    border: 1px solid var(--rfm-ink);
    border-radius: var(--rfm-radius-control);
    color: var(--rfm-ink);
    font-size: 16px;
    font-weight: 700;
  }
</style>
