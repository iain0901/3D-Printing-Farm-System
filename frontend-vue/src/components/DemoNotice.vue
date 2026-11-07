<template>
  <div v-if="active" class="demo-notice" role="status">
    展示環境｜人物與訂單為虛構情境；工時與重量未經實際切片。付款、寄信及實機控制已停用。
  </div>
</template>
<script>
  export default {
    data: () => ({ active: false }),
    async mounted() {
      try {
        const response = await fetch('/api/demo/status')
        if (response.ok) this.active = (await response.json()).active === true
      } catch { /* No banner on an unavailable production API. */ }
    },
  }
</script>
<style scoped>
  .demo-notice { position: fixed; bottom: 0; left: 0; right: 0; z-index: 3000; padding: 6px 16px; background: #fff3cc; color: #553c00; text-align: center; font-size: 12px; pointer-events: none; }
</style>
