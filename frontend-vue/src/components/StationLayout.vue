<template>
  <section class="layout-editor">
    <template v-if="studio">
      <input
        ref="input"
        class="visually-hidden"
        type="file"
        multiple
        accept=".stl"
        aria-label="選擇 STL 模型"
        :disabled="disabled"
        @change="selectFiles($event.target.files)"
      />
      <slicer-stage
        :models="items"
        :selected-ids="selectedIds"
        :disabled="disabled || preparing"
        :appearance="modelAppearance"
        :painting="painting"
        :empty-artwork="emptyArtwork"
        @import="importFiles"
        @select="selectModels"
        @transform="applyTransform"
        @positions="applyPositions"
        @command="command"
        @paint="emit('paint', $event)"
      />
      <p v-if="error" role="alert" class="layout-error">{{ error }}</p>
      <p v-if="preparing" role="status" class="studio-preparing">正在更新模型方向與尺寸…</p>
      <p v-if="warning" role="alert" class="layout-error">{{ warning }}{{ automatic ? ' 切片時將由 Orca 重新排列。' : '' }}</p>
      <slot v-if="current?.file" name="surface-tools" :model="current" />
    </template>
    <template v-else>
      <label class="model-upload" @dragover.prevent @drop.prevent="selectFiles($event.dataTransfer.files)">
        <strong>加入模型，安排你的列印平台</strong>
        <span>最多 5 個 STL・合計 10 MB・尺寸單位 mm</span>
        <span class="upload-link" aria-hidden="true">選擇 STL 檔案 ↗</span>
        <input
          ref="input"
          class="visually-hidden"
          type="file"
          multiple
          accept=".stl"
          aria-label="選擇 STL 模型"
          :disabled="disabled"
          @change="selectFiles($event.target.files)"
        />
      </label>
      <p v-if="error" role="alert" class="layout-error">{{ error }}</p>
      <p v-if="preparing" role="status">正在更新模型方向與尺寸…</p>
      <template v-if="items.length">
        <div class="model-tabs" aria-label="模型清單">
          <button v-for="(item, index) in items" :key="item.id" type="button" :aria-pressed="selected === index" @click="selected = index">
            {{ index + 1 }}・{{ item.name }}
          </button>
        </div>
        <div class="layout-toolbar">
          <button type="button" :disabled="disabled || preparing" @click="pack">自動排版</button>
          <button type="button" :disabled="disabled" @click="center">選取模型置中</button>
          <button type="button" :disabled="disabled" @click="remove">移除選取模型</button>
        </div>
        <svg
          ref="plate"
          class="plate"
          viewBox="-12 -12 284 284"
          role="group"
          aria-label="參考平台俯視圖，可拖曳模型移位"
          @pointermove="move"
          @pointerup="endDrag"
          @pointercancel="endDrag"
          @lostpointercapture="endDrag"
        >
          <rect x="0" y="0" width="260" height="260" fill="#f7f3e9" stroke="#192e53" />
          <path v-for="n in 12" :key="n" :d="`M${n * 20},0V260 M0,${n * 20}H260`" stroke="#192e5315" />
          <rect x="5" y="5" width="250" height="250" fill="none" stroke="#c8491a" stroke-dasharray="2 2" />
          <g
            v-for="(item, index) in items"
            :key="item.id"
            :transform="`translate(${item.position.x},${260 - item.position.y})`"
            role="button"
            tabindex="0"
            :aria-label="`模型 ${index + 1}：${item.name}，方向鍵移動 1 mm`"
            :aria-pressed="selected === index"
            @focus="selected = index"
            @keydown="keyMove($event, index)"
            @pointerdown.prevent="beginDrag($event, index)"
          >
            <rect
              :x="-(item.dimensions?.[0] || 10) / 2"
              :y="-(item.dimensions?.[1] || 10) / 2"
              :width="item.dimensions?.[0] || 10"
              :height="item.dimensions?.[1] || 10"
              :fill="modelAppearance[item.id]?.color || (selected === index ? '#e4663560' : '#192e5320')"
              :stroke="selected === index ? '#c8491a' : '#192e53'"
              stroke-width="1"
            />
            <text text-anchor="middle" dominant-baseline="central" font-size="8" fill="#192e53" pointer-events="none">{{ index + 1 }}</text>
          </g>
          <text x="0" y="271" font-size="7" fill="#192e53">原點（左下）・X →／Y ↑・260 × 260 mm 參考平台</text>
        </svg>
        <p class="hint">拖曳色塊可移位；鍵盤方向鍵每次移動 1 mm，按住 Shift 移動 10 mm。色塊為模型包圍框，不含尚未切片的支撐與底邊。</p>
        <p v-if="warning" role="alert" class="layout-error">{{ warning }}{{ automatic ? ' 切片時將由 Orca 重新排列。' : '' }}</p>
        <fieldset v-if="current" :disabled="disabled" class="layout-controls">
          <legend>模型 {{ selected + 1 }}・方向與位置</legend>
          <label>
            等比例縮放（%）
            <input v-model.number="current.transform.scale" type="number" min="1" max="1000" />
          </label>
          <label v-for="axis in ['x', 'y', 'z']" :key="axis">
            {{ axis.toUpperCase() }} 軸旋轉（°）
            <input v-model.number="current.transform[axis]" type="number" min="-360" max="360" step="1" />
          </label>
          <label>
            中心 X（mm）
            <input v-model.number="current.position.x" type="number" min="0" max="260" step="0.1" />
          </label>
          <label>
            中心 Y（mm）
            <input v-model.number="current.position.y" type="number" min="0" max="260" step="0.1" />
          </label>
          <label class="flat-toggle">
            <input v-model="current.transform.layFlat" type="checkbox" />
            自動平躺（將最短軸轉向高度方向）
          </label>
          <div class="layout-toolbar">
            <button type="button" @click="rotate('x')">X 軸轉 90°</button>
            <button type="button" @click="rotate('y')">Y 軸轉 90°</button>
            <button type="button" @click="rotate('z')">Z 軸轉 90°</button>
            <button type="button" @click="reset">重設方向與尺寸</button>
          </div>
        </fieldset>
        <p v-if="current?.dimensions" class="model-dimensions">
          調整後尺寸
          <strong>{{ current.dimensions.map((v) => v.toFixed(2)).join(' × ') }} mm</strong>
        </p>
        <slot v-if="current?.file" name="surface-tools" :model="current" />
        <model-viewer
          v-if="current?.file"
          :file="current.file"
          :filename="current.name"
          :height="260"
          z-up
          :part-colors="modelAppearance[current.id]?.color ? [modelAppearance[current.id].color] : []"
          :height-colors="modelAppearance[current.id]?.bands || []"
          :paint-enabled="!!painting"
          :paint-tool="disabled ? 'orbit' : painting?.tool || 'orbit'"
          :paint-slot-id="painting?.slotId || ''"
          :brush-radius="painting?.radius || 5"
          :paint-palette="painting?.slots || []"
          :surface-paint="modelAppearance[current.id]?.faces || {}"
          @paint="emit('paint', { modelId: String(current.id), changes: $event })"
        />
        <p class="hint">上方是選取模型的 3D 方向預覽，環視不會改變模型。手動數值旋轉後才套用「自動平躺」；這不是支撐最少的最佳化判斷。</p>
      </template>
      <p v-else class="empty">{{ emptyHint }}</p>
    </template>
  </section>
</template>

<script setup>
  import { computed, markRaw, onBeforeUnmount, reactive, ref, watch } from 'vue'
  import ModelViewer from './ModelViewer.vue'
  import SlicerStage from './SlicerStage.vue'
  import { studioSnapshot, snapshotKey } from '@/utils/slicer-studio.mjs'
  import { arrangeModels, layoutWarning } from '@/utils/station-layout.mjs'
  const props = defineProps({
    disabled: Boolean,
    studio: Boolean,
    emptyArtwork: { type: String, default: '' },
    automatic: Boolean,
    modelAppearance: { type: Object, default: () => ({}) },
    painting: { type: Object, default: null },
    emptyHint: { type: String, default: '先加入模型，再手動擺放或一鍵自動排版。按下「開始切片」才會上傳。' },
  })
  const emit = defineEmits(['change', 'paint'])
  const items = reactive([]),
    selected = ref(0),
    input = ref(null),
    plate = ref(null),
    error = ref(''),
    preparing = ref(false)
  const current = computed(() => items[selected.value])
  const selectedIds = ref([]),
    undoStack = [],
    redoStack = []
  function checkpoint() {
    if (!props.studio) return
    const snapshot = studioSnapshot(items)
    if (undoStack.length && snapshotKey(undoStack.at(-1)) === snapshotKey(snapshot)) return
    undoStack.push(snapshot)
    if (undoStack.length > 30) undoStack.shift()
    redoStack.length = 0
  }
  function restoreSnapshot(snapshot) {
    items.splice(
      0,
      items.length,
      ...snapshot.map((m) => ({
        ...m,
        source: markRaw(m.source),
        transform: { ...m.transform },
        position: { ...m.position },
        file: null,
        dimensions: null,
      }))
    )
    selected.value = items.length ? 0 : -1
    selectedIds.value = items.length ? [String(items[0].id)] : []
    pendingPack = false
    schedule()
  }
  function importFiles(files) {
    if (files) selectFiles(files)
    else input.value?.click()
  }
  function selectModels({ id, additive }) {
    if (additive)
      selectedIds.value = selectedIds.value.includes(id) ? selectedIds.value.filter((i) => i !== id) : [...selectedIds.value, id]
    else selectedIds.value = [id]
    selected.value = items.findIndex((m) => String(m.id) === selectedIds.value.at(-1))
  }
  function applyTransform({ id, patch }) {
    if (props.disabled || preparing.value) return
    const item = items.find((i) => String(i.id) === id)
    if (!item) return
    checkpoint()
    Object.assign(item.transform, patch)
  }
  function applyPositions(changes) {
    if (props.disabled || preparing.value) return
    checkpoint()
    for (const change of changes) {
      const item = items.find((i) => String(i.id) === change.id)
      if (item) item.position = { ...change.position }
    }
  }
  function command(name, id) {
    if (props.disabled || preparing.value) return
    if (name === 'undo' || name === 'redo') {
      const from = name === 'undo' ? undoStack : redoStack,
        to = name === 'undo' ? redoStack : undoStack
      if (!from.length) return
      to.push(studioSnapshot(items))
      restoreSnapshot(from.pop())
      return
    }
    if (name === 'selectAll') {
      selectedIds.value = items.map((i) => String(i.id))
      return
    }
    if (name === 'pack') {
      checkpoint()
      pack()
      return
    }
    const selectedItems = items.filter((m) => selectedIds.value.includes(String(m.id)))
    if (name === 'clone') {
      if (
        items.length + selectedItems.length > 5 ||
        [...items, ...selectedItems].reduce((n, m) => n + m.source.size, 0) > 10 * 1024 * 1024
      ) {
        error.value = '模型與複製件合計最多 5 個、10 MB。'
        return
      }
      checkpoint()
      const added = selectedItems.map((m) => ({
        ...m,
        id: ++sequence,
        cloneOf: String(m.id),
        name: m.name.replace(/\.stl$/i, '') + '-複本.stl',
        transform: { ...m.transform },
        position: { x: m.position.x + 10, y: m.position.y + 10 },
        file: null,
        dimensions: null,
      }))
      items.push(...added)
      selectedIds.value = added.map((m) => String(m.id))
      selected.value = items.length - added.length
      pendingPack = true
      return
    }
    checkpoint()
    if (name === 'toggleHidden') {
      const item = items.find((m) => String(m.id) === id)
      if (item) item.hidden = !item.hidden
      return
    }
    if (name === 'hide') {
      selectedItems.forEach((m) => (m.hidden = !m.hidden))
      return
    }
    if (name === 'remove') {
      for (let i = items.length - 1; i >= 0; i--) if (selectedIds.value.includes(String(items[i].id))) items.splice(i, 1)
      selected.value = items.length ? 0 : -1
      selectedIds.value = items.length ? [String(items[0].id)] : []
      return
    }
    if (name === 'resetAll') {
      items.forEach((m) => {
        m.transform = initialTransform()
        m.hidden = false
      })
      pendingPack = true
      return
    }
    if (name === 'center') {
      selectedItems.forEach((m) => (m.position = { x: 130, y: 130 }))
      return
    }
    if (name === 'flat') {
      selectedItems.forEach((m) => (m.transform.layFlat = true))
      return
    }
    if (name === 'reset') selectedItems.forEach((m) => (m.transform = initialTransform()))
  }
  const warning = computed(() => layoutWarning(items))
  let worker,
    timer,
    active = true,
    pendingPack = false,
    drag = null,
    sequence = 0
  const initialTransform = () => ({ scale: 100, x: 0, y: 0, z: 0, layFlat: false })
  function publish() {
    emit('change', {
      files: items.map((i) => i.file).filter(Boolean),
      sources: items.map((i) => i.source),
      names: items.map((i) => i.name),
      placements: items.map((i) => ({ ...i.position })),
      models: items.map((i) => ({
        id: String(i.id),
        name: i.name,
        dimensions: i.dimensions ? [...i.dimensions] : null,
        transform: { ...i.transform },
        position: { ...i.position },
        triangleCount: i.triangleCount,
        geometryHash: i.geometryHash,
        hidden: !!i.hidden,
        cloneOf: i.cloneOf || null,
      })),
      ready: !!items.length && !preparing.value && items.every((i) => i.file) && (!warning.value || props.automatic),
    })
  }
  watch(() => items.map((i) => ({ ...i.transform })), schedule, { deep: true })
  watch(() => [items.map((i) => ({ ...i.position, hidden: !!i.hidden })), props.automatic], publish, { deep: true })
  function selectFiles(files) {
    if (props.disabled || !files?.length) return
    const added = [...files]
    if (input.value) input.value.value = ''
    if (
      items.length + added.length > 5 ||
      added.some((f) => !/\.stl$/i.test(f.name) || !f.size) ||
      [...items.map((i) => i.source), ...added].reduce((sum, f) => sum + f.size, 0) > 10 * 1024 * 1024
    ) {
      error.value = '請選擇非空白 STL，最多 5 個，合計上限 10 MB。'
      return
    }
    error.value = ''
    checkpoint()
    pendingPack = true
    for (const source of added)
      items.push({
        id: ++sequence,
        source: markRaw(source),
        name: source.name,
        transform: initialTransform(),
        position: { x: 130, y: 130 },
        file: null,
        dimensions: null,
      })
    selected.value = items.length - added.length
    selectedIds.value = [String(items[selected.value].id)]
  }
  function restoreModels(models) {
    if (!Array.isArray(models) || models.length > 5 || models.reduce((n, m) => n + m.file.size, 0) > 10 * 1024 * 1024)
      throw new Error('草稿模型超過工作台容量')
    clearTimeout(timer)
    worker?.terminate()
    worker = null
    pendingPack = false
    items.splice(
      0,
      items.length,
      ...models.map((model) => ({
        id: model.id,
        name: model.name,
        source: markRaw(model.file),
        transform: { ...initialTransform(), ...model.transform },
        position: { ...model.position },
        hidden: !!model.hidden,
        file: null,
        dimensions: null,
      }))
    )
    sequence = Math.max(0, ...models.map((m) => Number(m.id) || 0))
    selected.value = 0
    selectedIds.value = items.length ? [String(items[0].id)] : []
    schedule()
  }
  defineExpose({ restoreModels, selectFiles, command })
  function schedule() {
    clearTimeout(timer)
    worker?.terminate()
    worker = null
    for (const item of items) item.file = null
    preparing.value = !!items.length
    publish()
    if (items.length) timer = setTimeout(prepare, 150)
  }
  async function prepare() {
    const snapshot = [...items]
    const task = new Worker(new URL('../workers/station-layout.worker.js', import.meta.url), { type: 'module' })
    worker = task
    const fail = (message) => {
      if (!active || worker !== task) return
      error.value = message
      preparing.value = false
      task.terminate()
      worker = null
      publish()
    }
    task.onerror = () => fail('模型處理失敗，請檢查檔案後重試。')
    task.onmessage = ({ data }) => {
      if (!active || worker !== task) return
      if (data.error) return fail(data.error)
      data.models.forEach((model, i) => {
        snapshot[i].file = markRaw(new File([model.buffer], snapshot[i].name, { type: 'application/octet-stream' }))
        snapshot[i].dimensions = model.dimensions
        snapshot[i].triangleCount = model.triangleCount
        snapshot[i].geometryHash = model.geometryHash
        snapshot[i].effectiveQuaternion = model.effectiveQuaternion
        snapshot[i].effectiveScale = model.effectiveScale
      })
      error.value = ''
      preparing.value = false
      task.terminate()
      worker = null
      if (pendingPack) {
        pendingPack = false
        pack()
      }
      publish()
    }
    try {
      const data = await Promise.all(snapshot.map(async (i) => ({ buffer: await i.source.arrayBuffer(), transform: { ...i.transform } })))
      if (active && worker === task)
        task.postMessage(
          data,
          data.map((i) => i.buffer)
        )
    } catch {
      fail('無法讀取模型檔案。')
    }
  }
  function pack() {
    if (props.disabled || preparing.value || items.some((i) => !i.dimensions)) return
    try {
      arrangeModels(items.map((i) => i.dimensions)).forEach((p, i) => {
        items[i].position = p
      })
      error.value = ''
    } catch (err) {
      error.value = err.message
    }
    publish()
  }
  function center() {
    if (current.value) current.value.position = { x: 130, y: 130 }
  }
  function remove() {
    items.splice(selected.value, 1)
    selected.value = Math.max(0, selected.value - 1)
    error.value = ''
  }
  function reset() {
    if (current.value) current.value.transform = initialTransform()
  }
  function rotate(axis) {
    current.value.transform.layFlat = false
    current.value.transform[axis] = (Number(current.value.transform[axis]) + 90) % 360
  }
  function point(event) {
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(plate.value.getScreenCTM().inverse())
    return { x: p.x, y: 260 - p.y }
  }
  function beginDrag(event, index) {
    selected.value = index
    if (props.disabled) return
    const p = point(event),
      item = items[index]
    drag = { index, x: item.position.x - p.x, y: item.position.y - p.y }
    plate.value.setPointerCapture(event.pointerId)
  }
  function move(event) {
    if (!drag || props.disabled) return
    const p = point(event)
    items[drag.index].position = {
      x: Math.round(Math.max(0, Math.min(260, p.x + drag.x)) * 10) / 10,
      y: Math.round(Math.max(0, Math.min(260, p.y + drag.y)) * 10) / 10,
    }
  }
  function endDrag() {
    drag = null
  }
  function keyMove(event, index) {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[event.key]
    if (!delta || props.disabled) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1,
      p = items[index].position
    p.x = Math.max(0, Math.min(260, Number(p.x) + delta[0] * step))
    p.y = Math.max(0, Math.min(260, Number(p.y) + delta[1] * step))
  }
  onBeforeUnmount(() => {
    active = false
    clearTimeout(timer)
    worker?.terminate()
  })
</script>

<style scoped>
  .model-upload {
    display: grid;
    gap: 8px;
    border: 1px dashed #192e5370;
    padding: 20px;
    background: #f7f3e9;
    cursor: pointer;
  }
  .model-upload span,
  .hint {
    font-size: 12px;
    line-height: 1.8;
  }
  .upload-link {
    text-decoration: underline;
  }
  .model-tabs,
  .layout-toolbar {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin: 14px 0;
  }
  button {
    padding: 8px 10px;
    background: #fff;
    color: #192e53;
    border: 1px solid #192e5350;
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    overflow-wrap: anywhere;
    max-width: 100%;
  }
  button[aria-pressed='true'] {
    background: #192e53;
    color: white;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .plate {
    width: 100%;
    max-height: 440px;
    touch-action: none;
    display: block;
  }
  .plate g {
    cursor: grab;
  }
  .plate g:focus-visible rect {
    stroke: #203ec3;
    stroke-width: 2;
  }
  .layout-controls {
    border: 0;
    padding: 0;
    margin: 18px 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }
  legend {
    font-weight: 700;
    margin-bottom: 14px;
  }
  label {
    font-size: 13px;
  }
  .layout-controls label {
    display: grid;
    gap: 6px;
  }
  .layout-controls .flat-toggle {
    display: flex;
    grid-column: 1 / -1;
    align-items: start;
  }
  .layout-controls .layout-toolbar {
    grid-column: 1 / -1;
  }
  input[type='number'] {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 10px;
    border: 1px solid #192e5350;
    color: #192e53;
    font: inherit;
  }
  .model-dimensions {
    font-size: 13px;
    line-height: 1.8;
  }
  .layout-error {
    color: #a32e15;
    background: #fff0e9;
    padding: 12px;
    line-height: 1.7;
  }
  .empty {
    padding: 50px 0;
    line-height: 1.8;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    clip-path: inset(50%);
    overflow: hidden;
  }
  button:focus-visible,
  input:focus-visible,
  .model-upload:focus-within {
    outline: 2px solid #203ec3;
    outline-offset: 3px;
  }
</style>
