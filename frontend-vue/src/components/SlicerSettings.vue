<template>
  <section class="slicer-parameters" aria-label="列印製程設定">
    <template v-if="!advancedOnly">
      <div class="parameter-head">
        <h3>製程</h3>
        <span>0.4 mm 噴嘴</span>
      </div>
      <label>
        層高
        <select v-model.number="settings.layerHeight" aria-label="切片層高">
          <option :value="0.12">0.12 mm・細緻</option>
          <option :value="0.16">0.16 mm・平衡</option>
          <option :value="0.2">0.20 mm・標準</option>
          <option :value="0.28">0.28 mm・快速</option>
        </select>
      </label>
      <div class="parameter-pair">
        <label>
          填充密度 %
          <input v-model.number="settings.infill" type="number" min="0" max="100" aria-label="切片填充密度" />
        </label>
        <label>
          外壁圈數
          <input v-model.number="settings.walls" type="number" min="1" max="12" aria-label="切片外壁圈數" />
        </label>
      </div>
      <label class="parameter-check">
        <input v-model="settings.autoSupports" type="checkbox" />
        自動產生支撐
      </label>
      <label class="parameter-check">
        <input v-model="settings.autoOrient" type="checkbox" />
        切片器自動定向
      </label>
      <label class="parameter-check">
        <input v-model="settings.autoArrange" type="checkbox" />
        切片器自動排版
      </label>
      <p>未開啟自動定向與排版時，保留工作台的方向與位置。</p>
    </template>
    <details>
      <summary>
        進階參數
        <span>{{ Object.keys(settings.advanced || {}).length }} 項自訂</span>
      </summary>
      <label class="parameter-search">
        搜尋參數
        <input v-model="search" type="search" placeholder="例如：支撐、速度、回抽" aria-label="搜尋切片參數" />
      </label>
      <p>留白表示使用實際機台設定檔；調整後會交給切片引擎，不僅改變預覽。</p>
      <div class="parameter-tabs" aria-label="參數分類">
        <button
          v-for="group in slicerSettingGroups"
          :key="group"
          type="button"
          :aria-pressed="activeGroup === group"
          @click="chooseGroup(group)"
        >
          {{ group }}
        </button>
      </div>
      <label v-for="field in visibleFields" :key="field.id" class="advanced-field">
        <span>
          {{ field.label }}
          <small>{{ field.unit }}</small>
        </span>
        <select
          v-if="field.choices"
          :value="settings.advanced?.[field.id] === undefined ? '' : String(settings.advanced[field.id])"
          :aria-label="field.label"
          @change="setField(field, $event)"
        >
          <option value="">設定檔預設</option>
          <option v-for="[value, label] in field.choices" :key="String(value)" :value="String(value)">{{ label }}</option>
        </select>
        <input
          v-else
          :value="settings.advanced?.[field.id] ?? ''"
          :aria-label="field.label"
          type="number"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          placeholder="設定檔預設"
          @change="setField(field, $event)"
        />
      </label>
      <p v-if="!visibleFields.length">沒有符合的參數。</p>
      <p v-if="fieldError" role="alert">{{ fieldError }}</p>
      <button type="button" class="reset-parameters" @click="settings.advanced = {}">還原所有進階參數</button>
    </details>
  </section>
</template>
<script setup>
  import { computed, ref } from 'vue'
  import { slicerSettingFields, slicerSettingGroups } from '@/utils/slicer-settings.mjs'
  const props = defineProps({ settings: { type: Object, required: true }, advancedOnly: Boolean })
  const search = ref(''),
    activeGroup = ref('品質'),
    fieldError = ref('')
  const visibleFields = computed(() =>
    slicerSettingFields.filter((f) => (search.value ? f.label.includes(search.value.trim()) : f.group === activeGroup.value))
  )
  function chooseGroup(group) {
    activeGroup.value = group
    search.value = ''
  }
  function setField(field, event) {
    const value = event.target.value
    fieldError.value = ''
    props.settings.advanced ||= {}
    if (value === '') {
      delete props.settings.advanced[field.id]
      return
    }
    const next = field.choices ? field.choices.find(([choice]) => String(choice) === value)?.[0] : Number(value)
    if (
      next === undefined ||
      (typeof next === 'number' &&
        (!Number.isFinite(next) || next < field.min || next > field.max || (field.step === 1 && !Number.isInteger(next))))
    ) {
      event.target.value = props.settings.advanced[field.id] ?? ''
      fieldError.value = `${field.label}請填入 ${field.min}～${field.max}${field.step === 1 ? ' 的整數' : ''}；已還原原設定。`
      return
    }
    props.settings.advanced[field.id] = next
  }
</script>
<style scoped>
  .slicer-parameters {
    font-size: 12px;
    color: #294238;
  }
  .parameter-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .parameter-head h3 {
    font-size: 13px;
  }
  .parameter-head span {
    font-size: 10px;
    color: #8a9b8c;
  }
  .slicer-parameters label {
    display: grid;
    gap: 7px;
    margin: 14px 0;
    font-size: 11px;
  }
  .slicer-parameters input:not([type='checkbox']),
  .slicer-parameters select {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 9px 10px;
    font: inherit;
    border: 1px solid #d4ded6;
    background: #fbfcf9;
    border-radius: 4px;
    color: inherit;
  }
  .slicer-parameters .parameter-check {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .parameter-check input {
    accent-color: #245847;
  }
  .parameter-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .slicer-parameters p {
    font-size: 10px;
    color: #7d8e80;
    line-height: 1.8;
  }
  .slicer-parameters details {
    border-top: 1px solid #dce3dc;
    margin-top: 20px;
    padding-top: 16px;
  }
  .slicer-parameters summary {
    font-size: 12px;
    cursor: pointer;
    font-weight: 600;
  }
  .slicer-parameters summary span {
    font-size: 9px;
    color: #8c9a8d;
    margin-left: 10px;
    font-weight: 400;
  }
  .parameter-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    border-bottom: 1px solid #dce3dc;
    padding-bottom: 10px;
  }
  .slicer-parameters button {
    font: inherit;
    font-size: 10px;
    border: 1px solid #d4ded6;
    background: #fff;
    color: inherit;
    border-radius: 4px;
    padding: 7px 9px;
    cursor: pointer;
  }
  .parameter-tabs button[aria-pressed='true'] {
    background: #245847;
    color: white;
    border-color: #245847;
  }
  .advanced-field > span {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .advanced-field small {
    color: #8a9b8c;
    font-size: 10px;
  }
  .reset-parameters {
    margin: 12px 0;
  }
  .slicer-parameters input:focus-visible,
  .slicer-parameters select:focus-visible,
  .slicer-parameters button:focus-visible {
    outline: 2px solid #a9874d;
    outline-offset: 3px;
  }
</style>
