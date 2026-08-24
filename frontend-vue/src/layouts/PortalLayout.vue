<template>
  <div class="portal-layout">
    <header class="portal-header">
      <span class="portal-brand">3DRFM 三點成型 · 客戶入口</span>
      <el-button v-if="customer" type="text" @click="logout">登出（{{ customer.name }}）</el-button>
    </header>
    <main class="portal-main">
      <router-view />
    </main>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { logoutCustomer } from '@/api/customerAuth'

  export default {
    name: 'PortalLayout',
    computed: {
      ...mapGetters({ customer: 'customerAuth/customer' }),
    },
    methods: {
      async logout() {
        try {
          await logoutCustomer()
        } catch {
          // 網路異常也要清空本地登入態
        }
        this.$store.dispatch('customerAuth/resetAccessToken')
        this.$router.push('/portal/login')
      },
    },
  }
</script>

<style lang="scss" scoped>
  .portal-layout {
    min-height: 100vh;
    background: #f6f8f9;
  }

  .portal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 24px;
    background: #fff;
    border-bottom: 1px solid $base-border-color;

    .portal-brand {
      font-weight: 600;
    }
  }

  .portal-main {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px;
  }
</style>
