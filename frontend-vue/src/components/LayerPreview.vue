<template>
  <section class="layer-preview" aria-label="實際切片逐層預覽">
    <div class="layer-heading">
      <h3>逐層路徑</h3>
      <span v-if="layer">第 {{ index + 1 }}／{{ preview.layers.length }} 層・高度 {{ layer.z }} mm</span>
    </div>
    <p v-if="preview.warning" role="note">{{ preview.warning }}</p>
    <template v-if="layer">
      <svg :viewBox="bounds" role="img" :aria-label="`第 ${index + 1} 層擠出路徑俯視圖`">
        <path :d="path" fill="none" stroke="#c8491a" stroke-width="1.5" vector-effect="non-scaling-stroke" />
      </svg>
      <label>
        選擇層數
        <input v-model.number="index" type="range" min="0" :max="preview.layers.length - 1" step="1" aria-label="選擇層數" />
      </label>
      <p>俯視圖・依目前層的路徑範圍自動縮放，橘線為實際擠出路徑。首層可能包含較長的擠料線。僅供檢視，不會啟動印表機。</p>
    </template>
    <p v-else>沒有可顯示的單盤擠出路徑，請調整模型後重新切片。</p>
  </section>
</template>
<script setup>
  import { computed, ref, watch } from 'vue'
  const props = defineProps({ preview: { type: Object, required: true } })
  const index = ref(0)
  watch(
    () => props.preview,
    () => {
      index.value = 0
    }
  )
  const layer = computed(() => props.preview.layers[index.value])
  const bounds = computed(() => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const [x1, y1, x2, y2] of layer.value?.segments || []) {
      minX = Math.min(minX, x1, x2)
      maxX = Math.max(maxX, x1, x2)
      minY = Math.min(minY, -y1, -y2)
      maxY = Math.max(maxY, -y1, -y2)
    }
    if (!Number.isFinite(minX)) return '0 0 100 100'
    const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 1
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`
  })
  const path = computed(() => (layer.value?.segments || []).map(([x1, y1, x2, y2]) => `M${x1},${-y1}L${x2},${-y2}`).join(' '))
</script>
<style scoped>
  .layer-preview {
    border-top: 1px solid #192e5330;
    margin-top: 24px;
    padding-top: 16px;
  }
  .layer-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  svg {
    width: 100%;
    height: 320px;
    background: #f7f3e9;
    border: 1px solid #192e5320;
    margin: 12px 0;
  }
  label {
    display: grid;
    gap: 8px;
  }
  input {
    width: 100%;
    accent-color: #c8491a;
  }
  p {
    font-size: 14px;
    line-height: 1.7;
  }
</style>
