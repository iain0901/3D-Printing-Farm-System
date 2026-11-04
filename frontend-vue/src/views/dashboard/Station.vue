<template>
  <main class="station-management">
    <h1>免費列印站管理</h1>
    <free-print-station-admin />
  </main>
</template>
<script setup>
  import FreePrintStationAdmin from '@/components/FreePrintStationAdmin.vue'
</script>
<style scoped>
  .station-management {
    padding: 24px;
    color: var(--rfm-ink);
  }
  h1 {
    font-size: 28px;
  }
  @media (max-width: 600px) {
    .station-management {
      padding: 12px;
    }
  }
</style>
