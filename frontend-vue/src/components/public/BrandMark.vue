<template>
  <span class="rfm-brand-mark" :class="{ 'is-compact': compact }">
    <strong>
      3DRFM
      <span aria-hidden="true">●</span>
    </strong>
    <small v-if="subtitle">{{ subtitle }}</small>
  </span>
</template>
<script setup>
  defineProps({ subtitle: { type: String, default: '' }, compact: Boolean })
</script>
<style scoped>
  .rfm-brand-mark {
    display: inline-grid;
    gap: 4px;
    color: inherit;
    vertical-align: middle;
  }
  .rfm-brand-mark strong {
    font: 900 34px/1.1 Arial, sans-serif;
    letter-spacing: -1.8px;
    white-space: nowrap;
  }
  .rfm-brand-mark strong span {
    color: var(--rfm-accent);
    font-size: 10px;
    letter-spacing: 0;
    vertical-align: top;
    margin-left: 5px;
  }
  .rfm-brand-mark small {
    font: 500 10px/1.5 var(--rfm-font);
    letter-spacing: 0.18em;
  }
  .rfm-brand-mark.is-compact strong {
    font-size: 25px;
    letter-spacing: -1.3px;
  }
  @media (max-width: 600px) {
    .rfm-brand-mark:not(.is-compact) strong {
      font-size: 28px;
    }
  }
</style>
