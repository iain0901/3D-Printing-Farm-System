<template>
  <auth-shell title="這裡需要通行證。" eyebrow="401・沒有存取權限" description="目前帳號沒有操作權限。請確認登入身分，或聯絡管理員協助。">
    <router-link to="/" class="studio-button">
      返回首頁
      <span aria-hidden="true">→</span>
    </router-link>
    <div class="auth-links"><router-link to="/portal/login">前往會員登入 →</router-link></div>
  </auth-shell>
</template>
<script>
  import AuthShell from '@/components/public/AuthShell.vue'
  export default { name: 'Page401', components: { AuthShell } }
</script>
