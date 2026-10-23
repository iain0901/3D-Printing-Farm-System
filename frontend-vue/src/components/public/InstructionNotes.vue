<template>
  <aside v-if="items.length" class="instruction-notes" :class="{ 'is-single': items.length === 1 }" aria-label="製作前的小提醒">
    <figure v-for="item in items" :key="item.id" class="instruction-note">
      <instruction-art :kind="item.id" />
      <figcaption>
        <h3>{{ item.title }}</h3>
        <p>{{ item.note }}</p>
      </figcaption>
    </figure>
  </aside>
</template>
<script setup>
  import { computed } from 'vue'
  import InstructionArt from './InstructionArt.vue'
  import { instructionItems } from '@/content/instructionArtwork.mjs'
  const props = defineProps({ placement: { type: String, required: true } })
  const items = computed(() => instructionItems(props.placement))
</script>
<style scoped>
  .instruction-notes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 20px 28px;
    padding-block: 28px;
    border-bottom: 1px solid var(--rfm-line);
  }
  .instruction-note {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
    margin: 0;
  }
  .instruction-note .instruction-art {
    --instruction-width: 116px;
    --instruction-height: 102px;
  }
  .instruction-note figcaption {
    min-width: 0;
  }
  .instruction-note h3 {
    font-size: 14px;
    line-height: 1.6;
    margin: 0 0 5px;
    color: var(--rfm-ink);
  }
  .instruction-note p {
    font-size: 12px;
    line-height: 1.85;
    color: var(--rfm-muted);
    margin: 0;
  }
  .is-single .instruction-note {
    max-width: 760px;
  }
  .is-single .instruction-art {
    --instruction-width: 154px;
    --instruction-height: 120px;
  }
  @media (max-width: 600px) {
    .instruction-notes {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      padding-block: 22px;
    }
    .instruction-note .instruction-art {
      --instruction-width: 104px;
      --instruction-height: 88px;
    }
  }
</style>
