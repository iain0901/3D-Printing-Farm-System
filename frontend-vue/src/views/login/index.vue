<template>
  <auth-shell title="歡迎回來。" eyebrow="3DRFM・工作人員專區" description="登入管理系統，接續今天的製作進度。">
    <el-form ref="form" label-position="top" :model="form" :rules="rules" size="large" @submit.prevent="handleLogin">
      <el-form-item label="電子郵件" prop="email">
        <el-input v-model.trim="form.email" type="email" autocomplete="username" placeholder="請輸入電子郵件" />
      </el-form-item>
      <el-form-item label="密碼" prop="password">
        <el-input v-model="form.password" type="password" autocomplete="current-password" show-password placeholder="請輸入密碼" />
      </el-form-item>
      <el-form-item v-if="requiresTwoFactor" label="兩步驗證碼或復原碼" prop="twoFactorCode">
        <el-input v-model.trim="form.twoFactorCode" autocomplete="one-time-code" placeholder="請輸入兩步驗證碼或復原碼" />
      </el-form-item>
      <el-button class="auth-submit" :loading="loading" native-type="submit" type="primary">
        {{ requiresTwoFactor ? '驗證並登入' : '登入管理系統' }}
      </el-button>
    </el-form>
    <p class="auth-note">
      這裡是工作人員的入口。
      <br />
      委託製作的朋友，請前往
      <router-link to="/portal/login">會員中心 →</router-link>
    </p>
  </auth-shell>
</template>

<script>
  import AuthShell from '@/components/public/AuthShell.vue'
  export default {
    components: { AuthShell },
    name: 'Login',
    data() {
      const validateEmail = (rule, value, callback) => {
        if (!value) {
          callback(new Error('電子郵件不可為空'))
        } else {
          callback()
        }
      }
      const validatePassword = (rule, value, callback) => {
        if (!value) {
          callback(new Error('密碼不可為空'))
        } else {
          callback()
        }
      }
      return {
        form: {
          email: '',
          password: '',
          twoFactorCode: '',
        },
        rules: {
          email: [{ required: true, trigger: 'blur', validator: validateEmail }],
          password: [{ required: true, trigger: 'blur', validator: validatePassword }],
        },
        loading: false,
        redirect: undefined,
        // 后端登录接口在需要两步验证时返回 409 { requiresTwoFactor: true }，此时展示验证码输入框重新提交
        requiresTwoFactor: false,
      }
    },
    watch: {
      $route: {
        handler(route) {
          this.redirect = (route.query && route.query.redirect) || '/dashboard'
        },
        immediate: true,
      },
    },
    methods: {
      handleLogin() {
        if (this.loading) return
        this.$refs.form.validate((valid) => {
          if (!valid) return
          this.loading = true
          const payload = { email: this.form.email, password: this.form.password }
          if (this.requiresTwoFactor && this.form.twoFactorCode) payload.twoFactorCode = this.form.twoFactorCode
          this.$store
            .dispatch('user/login', payload)
            .then(() => {
              const routerPath = this.redirect === '/404' || this.redirect === '/401' ? '/dashboard' : this.redirect
              this.$router.push(routerPath).catch(() => {})
              this.loading = false
            })
            .catch((error) => {
              this.loading = false
              // 具体错误提示已由 utils/request.js 的响应拦截器统一 toast，这里只处理 2FA 状态切换
              if (error?.response?.data?.requiresTwoFactor) {
                this.requiresTwoFactor = true
              }
            })
        })
      },
    },
  }
</script>
