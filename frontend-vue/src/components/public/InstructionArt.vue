<template>
  <img
    v-if="art"
    class="instruction-art"
    :data-instruction-art="kind"
    :src="`/images/instructions/${kind}.webp`"
    :alt="decorative ? '' : art.alt"
    :width="file?.width || 1536"
    :height="file?.height || 1024"
    loading="lazy"
    decoding="async"
  />
</template>
<script setup>
  import { computed } from 'vue'
  import { instructionArtwork } from '@/content/instructionArtwork.mjs'
  import generatedAssets from '@/content/instructionArtworkAssets.json'
  const props = defineProps({ kind: { type: String, required: true }, decorative: { type: Boolean, default: true } })
  const art = computed(() => instructionArtwork[props.kind])
  const file = computed(() => generatedAssets.assets[props.kind])
</script>
<style scoped>
  .instruction-art {
    display: block;
    width: var(--instruction-width, 144px);
    max-width: 100%;
    height: var(--instruction-height, 108px);
    object-fit: contain;
    flex-shrink: 0;
    pointer-events: none;
    user-select: none;
  }
</style>
