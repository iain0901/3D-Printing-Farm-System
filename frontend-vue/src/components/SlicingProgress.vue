<template>
  <section class="slicing-progress" :data-phase="state.phase" aria-label="切片工作進度">
    <div class="progress-heading" role="status" aria-live="polite">
      <b>{{ state.title }}</b>
      <span v-if="state.percent !== null">{{ state.percent }}%</span>
    </div>
    <div
      class="progress-track"
      :class="{ running: running && state.percent === null }"
      role="progressbar"
      :aria-label="state.title"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="state.percent ?? undefined"
      :aria-valuetext="state.percent === null ? state.title + '（未提供百分比）' : state.title + ' ' + state.percent + '%'"
    >
      <span :style="{ width: state.percent === null ? '0%' : state.percent + '%' }" />
    </div>
    <ol>
      <li
        v-for="(label, i) in steps"
        :key="label"
        :class="{ done: i < state.step, current: i === state.step }"
        :aria-current="i === state.step ? 'step' : undefined"
      >
        {{ label }}
      </li>
    </ol>
    <p>{{ state.detail }}</p>
  </section>
</template>
<script setup>
  import { computed } from 'vue'
  const props = defineProps({ state: { type: Object, required: true } })
  const steps = ['上傳', '排隊', '切片', '路徑']
  const running = computed(() => !['failed', 'cancelled', 'paused', 'completed'].includes(props.state.phase))
</script>
<style scoped>
  .slicing-progress {
    padding: 16px;
    border: 1px solid var(--rfm-line);
    background: var(--rfm-paper);
    border-radius: 8px;
    margin: 16px 0;
    font-size: 12px;
  }
  .progress-heading {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    color: var(--rfm-ink);
  }
  .progress-heading span {
    font-variant-numeric: tabular-nums;
  }
  .progress-track {
    height: 6px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--rfm-line);
    margin: 14px 0;
    position: relative;
  }
  .progress-track > span {
    display: block;
    background: var(--rfm-interactive, #173cc5);
    height: 100%;
    transition: width 0.2s ease;
  }
  .progress-track.running::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 35%;
    background: #173cc5;
    animation: working 1.5s ease-in-out infinite alternate;
  }
  ol {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    list-style: none;
    padding: 0;
    margin: 0;
    color: var(--rfm-muted);
  }
  li.current {
    color: #173cc5;
    font-weight: 700;
  }
  li.done {
    color: var(--rfm-ink);
  }
  p {
    color: var(--rfm-muted);
    line-height: 1.8;
    margin: 10px 0 0;
    overflow-wrap: anywhere;
  }
  [data-phase='failed'] {
    border-color: var(--rfm-accent);
  }
  @keyframes working {
    to {
      transform: translateX(185%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .progress-track.running::after {
      animation: none;
      width: 100%;
      background: repeating-linear-gradient(100deg, #173cc5 0 8px, #8d9bd4 8px 16px);
    }
    .progress-track > span {
      transition: none;
    }
  }
</style>
