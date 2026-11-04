<template>
  <main class="staff-agent-tools">
    <h1>MCP 與建模 Skill</h1>
    <p>連接外部 AI 工具，或下載列印規範套件。操作權限沿用目前員工帳號。</p>
    <agent-connections :staff="true" />
    <p>需要對話操作？使用右下角「詢問列印助理」，支援文字、圖片與語音；變更須確認後才會執行。</p>
  </main>
</template>
<script setup>
  import AgentConnections from '@/components/AgentConnections.vue'
</script>
<style scoped>
  .staff-agent-tools {
    padding: 24px;
    max-width: 1000px;
    color: var(--rfm-ink);
  }
  p {
    line-height: 1.8;
  }
  h1 {
    font-size: 28px;
  }
</style>
