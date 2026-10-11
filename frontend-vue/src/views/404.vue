<template>
  <auth-shell
    title="這一頁，還沒成型。"
    eyebrow="404・找不到頁面"
    description="網址可能已變更，或這個頁面已不在這裡。請回到 3DRFM 官網，查看服務或開始估價。"
  >
    <router-link to="/" class="studio-button">
      返回首頁
      <span aria-hidden="true">↗</span>
    </router-link>
    <div class="auth-links"><router-link to="/quote">或是，直接開始製作 →</router-link></div>
  </auth-shell>
</template>
<script>
  import AuthShell from '@/components/public/AuthShell.vue'
  export default { name: 'Page404', components: { AuthShell } }
</script>
