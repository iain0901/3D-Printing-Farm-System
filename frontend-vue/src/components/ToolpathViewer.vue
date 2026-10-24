<template>
  <section class="toolpath-viewer" :class="{ 'paths-active': view === 'paths' }" aria-label="三維切片路徑預覽">
    <div ref="host" class="toolpath-canvas" />
    <div class="path-heading">
      <b>切片完成</b>
      <div class="preview-modes" role="group" aria-label="切片檢視方式">
        <button type="button" :disabled="!modelReady" :aria-pressed="view === 'model'" @click="view = 'model'">模型外觀</button>
        <button type="button" :aria-pressed="view === 'paths'" @click="view = 'paths'">列印路徑</button>
      </div>
      <button type="button" @click="fit">適合視窗</button>
    </div>
    <p v-if="preview.warning" class="path-warning" role="note">{{ preview.warning }}</p>
    <p v-if="error" class="path-warning" role="alert">{{ error }}</p>
    <p v-if="!preview.layers.length" class="path-empty">沒有可顯示的單盤擠出路徑。</p>
    <p v-if="view === 'model'" class="model-note">保留模型原貌與孔洞。支撐、填充及逐層結果請切換「列印路徑」。</p>
    <p v-else-if="!modelReady" class="model-note">目前顯示實際列印路徑；重新整理後未保留原始模型。</p>
    <aside v-show="view === 'paths'" class="path-legend">
      <b>路徑類型</b>
      <label v-for="(label, key) in preview.roles" :key="key">
        <input v-model="enabled[key]" type="checkbox" :aria-label="`顯示${label}路徑`" />
        <span :style="{ background: palette[key] }" />
        {{ label }}
      </label>
      <label class="single-layer">
        <input v-model="single" type="checkbox" />
        只顯示目前層
      </label>
      <p>{{ visibleCount.toLocaleString() }} 條顯示線段</p>
      <small v-if="approximateWidth">未提供線寬／層高的線段以示意厚度呈現。</small>
    </aside>
    <div v-if="preview.layers.length && view === 'paths'" class="layer-interval">
      <span class="layer-status">
        {{ single ? `第 ${top + 1} 層` : `${bottom + 1}–${top + 1} 層` }}／{{ preview.layers.length }}
        <br />
        Z {{ preview.layers[top]?.z }} mm
      </span>
      <button type="button" @click="resetLayers">顯示全部圖層</button>
      <label>
        起始層 {{ bottom + 1 }}
        <input v-model.number="bottom" type="range" min="0" :max="preview.layers.length - 1" aria-label="路徑起始層" />
      </label>
      <label>
        結束層 {{ top + 1 }}
        <input v-model.number="top" type="range" min="0" :max="preview.layers.length - 1" aria-label="路徑結束層" />
      </label>
    </div>
    <div v-if="preview.layers.length && view === 'paths'" class="path-playback">
      <button type="button" :aria-label="playing ? '暫停路徑播放' : '播放路徑'" @click="togglePlay">{{ playing ? '暫停' : '播放' }}</button>
      <label class="path-progress">
        線段進度 {{ Math.floor(progress) }}%
        <input v-model.number="progress" type="range" min="0" max="100" step=".1" aria-label="路徑線段進度" />
      </label>
      <label>
        速度
        <select v-model.number="playSpeed" aria-label="路徑播放速度">
          <option :value="1">1×</option>
          <option :value="5">5×</option>
          <option :value="20">20×</option>
        </select>
      </label>
      <span v-if="headSegment">{{ preview.roles[headSegment.role] }} · {{ headSegment.speed }} mm/s · 色槽 {{ headSegment.tool + 1 }}</span>
    </div>
    <p class="path-footer">拖曳環視 · 滾輪縮放 · 中鍵平移。播放僅供檢視，不會控制印表機。</p>
  </section>
</template>
<script setup>
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
  import { extrusionGeometry, fitPreviewCamera, previewBounds } from '@/utils/toolpath-geometry.js'
  const props = defineProps({
    preview: { type: Object, required: true },
    files: { type: Array, default: () => [] },
    placements: { type: Array, default: () => [] },
  })
  const view = ref(props.files.length ? 'model' : 'paths'),
    modelReady = ref(false)
  const approximateWidth = computed(() =>
    props.preview.layers.some((l) => l.segments.some((s) => s.role !== 'travel' && (!s.width || !s.height)))
  )
  const host = ref(null),
    top = ref(Math.max(0, props.preview.layers.length - 1)),
    bottom = ref(0),
    single = ref(false),
    progress = ref(100),
    playing = ref(false),
    playSpeed = ref(5),
    visibleCount = ref(0),
    error = ref('')
  const palette = {
    outer: '#d19b46',
    inner: '#438e72',
    infill: '#657eb0',
    solid: '#a2a35b',
    support: '#a16fc1',
    adhesion: '#ac7959',
    travel: '#8fb9c3',
    other: '#7e8d87',
  }
  const enabled = reactive(Object.fromEntries(Object.keys(palette).map((k) => [k, k !== 'travel'])))
  let scene,
    camera,
    renderer,
    controls,
    observer,
    lines,
    extrusions,
    modelGroup,
    head,
    segments = [],
    frame = 0,
    playFrame = 0,
    lastTime = 0,
    disposed = false
  const segmentRevision = ref(0)
  const headSegment = computed(() => {
    segmentRevision.value
    return segments[Math.max(0, Math.min(segments.length - 1, Math.floor((segments.length * progress.value) / 100) - 1))]
  })
  function render() {
    if (frame || disposed) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (renderer) {
        renderer.render(scene, camera)
        renderer.domElement.dataset.renderedLines = String(renderer.info.render.lines)
        renderer.domElement.dataset.visibleSegments = String(Math.floor((segments.length * progress.value) / 100))
        renderer.domElement.dataset.renderedTriangles = String(renderer.info.render.triangles)
        renderer.domElement.dataset.view = view.value
        renderer.domElement.dataset.camera = JSON.stringify([...camera.position.toArray(), ...controls.target.toArray()])
      }
    })
  }
  function resize() {
    if (!renderer) return
    const { width, height } = host.value.getBoundingClientRect()
    if (width < 1 || height < 1) return
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    render()
  }
  function fit() {
    if (!camera) return
    const bounds = modelReady.value ? new THREE.Box3().setFromObject(modelGroup) : previewBounds(props.preview)
    fitPreviewCamera(camera, controls, bounds)
    render()
  }
  function resetLayers() {
    playing.value = false
    cancelAnimationFrame(playFrame)
    single.value = false
    bottom.value = 0
    top.value = Math.max(0, props.preview.layers.length - 1)
    progress.value = 100
  }
  function draw() {
    if (!scene) return
    segments = []
    for (let i = single.value ? top.value : bottom.value; i <= top.value; i++)
      for (const segment of props.preview.layers[i]?.segments || []) if (enabled[segment.role]) segments.push(segment)
    const travel = segments.filter((s) => s.role === 'travel')
    const positions = new Float32Array(travel.length * 6),
      colors = new Float32Array(positions.length)
    travel.forEach((segment, i) => {
      positions.set(segment.from, i * 6)
      positions.set(segment.to, i * 6 + 3)
      const color = new THREE.Color(palette[segment.role] || palette.other)
      colors.set([color.r, color.g, color.b, color.r, color.g, color.b], i * 6)
    })
    if (lines) {
      scene.remove(lines)
      lines.geometry.dispose()
      lines.material.dispose()
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true }))
    scene.add(lines)
    if (extrusions) {
      scene.remove(extrusions)
      extrusions.geometry.dispose()
      extrusions.material.dispose()
    }
    extrusions = new THREE.Mesh(
      extrusionGeometry(
        segments.filter((s) => s.role !== 'travel'),
        palette
      ),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
    )
    scene.add(extrusions)
    visibleCount.value = segments.length
    segmentRevision.value++
    updateProgress()
  }
  function updateProgress() {
    if (!lines) return
    const count = Math.floor((segments.length * progress.value) / 100)
    let travels = 0
    for (let i = 0; i < count; i++) if (segments[i].role === 'travel') travels++
    lines.geometry.setDrawRange(0, travels * 2)
    extrusions.geometry.setDrawRange(0, (count - travels) * 36)
    lines.visible = extrusions.visible = view.value === 'paths'
    modelGroup.visible = view.value === 'model'
    const segment = headSegment.value
    if (segment) {
      head.position.fromArray(segment.to)
      head.visible = view.value === 'paths' && progress.value < 100
    } else head.visible = false
    render()
  }
  function step(time) {
    if (!playing.value || disposed) return
    if (!lastTime) lastTime = time
    const elapsed = Math.min(100, time - lastTime)
    lastTime = time
    progress.value = Math.min(100, progress.value + (elapsed / 1000) * playSpeed.value * 2)
    if (progress.value >= 100) {
      playing.value = false
      lastTime = 0
      return
    }
    playFrame = requestAnimationFrame(step)
  }
  function togglePlay() {
    playing.value = !playing.value
    cancelAnimationFrame(playFrame)
    if (playing.value) {
      if (progress.value >= 100) progress.value = 0
      lastTime = 0
      playFrame = requestAnimationFrame(step)
    }
  }
  watch(top, () => {
    if (bottom.value > top.value) bottom.value = top.value
    draw()
  })
  watch(bottom, () => {
    if (top.value < bottom.value) top.value = bottom.value
    draw()
  })
  watch([enabled, single], draw, { deep: true })
  watch(progress, updateProgress)
  watch(view, () => {
    playing.value = false
    cancelAnimationFrame(playFrame)
    updateProgress()
  })
  watch(
    () => props.preview,
    () => {
      playing.value = false
      cancelAnimationFrame(playFrame)
      top.value = Math.max(0, props.preview.layers.length - 1)
      bottom.value = 0
      progress.value = 100
      draw()
      fit()
    }
  )
  onMounted(async () => {
    try {
      scene = new THREE.Scene()
      scene.background = new THREE.Color(getComputedStyle(host.value).getPropertyValue('--rfm-canvas').trim() || '#eef0f3')
      modelGroup = new THREE.Group()
      scene.add(modelGroup)
      scene.add(new THREE.HemisphereLight(0xffffff, 0x697783, 2.2))
      const light = new THREE.DirectionalLight(0xffffff, 2.4)
      light.position.set(-100, -200, 400)
      scene.add(light)
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
      camera.up.set(0, 0, 1)
      renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.domElement.setAttribute('aria-label', '實際 G-code 三維逐層路徑')
      host.value.append(renderer.domElement)
      const grid = new THREE.GridHelper(260, 26, 0xa8b9af, 0xd8e0d9)
      grid.rotation.x = Math.PI / 2
      grid.position.set(130, 130, -0.3)
      scene.add(grid)
      head = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshBasicMaterial({ color: '#b54830' }))
      scene.add(head)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = false
      controls.addEventListener('change', render)
      observer = new ResizeObserver(resize)
      observer.observe(host.value)
      resize()
      draw()
      fit()
      if (props.files.length) {
        try {
          const buffers = await Promise.all(props.files.map((file) => file.arrayBuffer()))
          if (disposed) return
          buffers.forEach((buffer, index) => {
            const mesh = new THREE.Mesh(new STLLoader().parse(buffer), new THREE.MeshStandardMaterial({ color: '#8ba6a0', roughness: 0.8 }))
            const placement = props.placements[index] || { x: 130, y: 130 }
            mesh.position.set(placement.x, placement.y, 0)
            modelGroup.add(mesh)
          })
          modelReady.value = true
          updateProgress()
          fit()
        } catch {
          view.value = 'paths'
          error.value = '模型外觀讀取失敗，已改為顯示實際列印路徑。'
        }
      }
    } catch {
      error.value = '瀏覽器無法啟動三維路徑預覽，請確認 WebGL 支援。'
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    cancelAnimationFrame(frame)
    cancelAnimationFrame(playFrame)
    observer?.disconnect()
    controls?.dispose()
    scene?.traverse((o) => {
      o.geometry?.dispose()
      o.material?.dispose()
    })
    renderer?.dispose()
    renderer?.forceContextLoss()
    renderer?.domElement.remove()
  })
  defineExpose({
    capture: async () => {
      for (let attempt = 0; attempt < 100 && !disposed && !modelReady.value; attempt++)
        await new Promise((resolve) => setTimeout(resolve, 50))
      if (!renderer || !modelReady.value) throw new Error('模型尚未準備完成，請稍後重試。')
      renderer.render(scene, camera)
      const source = renderer.domElement
      const canvas = document.createElement('canvas')
      canvas.width = 512
      canvas.height = Math.max(1, Math.round((source.height / source.width) * 512))
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    },
  })
</script>
<style scoped>
  .toolpath-viewer {
    position: relative;
    height: 100%;
    min-height: 620px;
    border-radius: var(--rfm-radius-panel);
    overflow: hidden;
    background: var(--rfm-canvas);
    color: var(--rfm-ink);
    font-size: 11px;
  }
  .toolpath-canvas {
    position: absolute;
    inset: 100px 120px 155px 170px;
  }
  .toolpath-canvas :deep(canvas) {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
  }
  .path-heading {
    position: absolute;
    top: 16px;
    left: 18px;
    right: 18px;
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .path-heading button {
    margin-left: auto;
  }
  .preview-modes {
    display: flex;
    gap: 4px;
  }
  .preview-modes button[aria-pressed='true'] {
    background: var(--rfm-ink);
    color: var(--rfm-surface);
  }
  .model-note {
    position: absolute;
    top: 62px;
    left: 18px;
    right: 18px;
    margin: 0;
    color: var(--rfm-muted);
    line-height: 1.7;
  }
  .path-legend small {
    max-width: 130px;
    font-size: 10px;
    line-height: 1.6;
    color: var(--rfm-muted);
  }
  .toolpath-viewer button,
  .toolpath-viewer select {
    background: var(--rfm-surface);
    color: inherit;
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    padding: 8px 12px;
    font: inherit;
    cursor: pointer;
  }
  .path-heading span {
    color: var(--rfm-muted);
  }
  .path-legend {
    position: absolute;
    left: 16px;
    top: 110px;
    background: var(--rfm-surface);
    padding: 14px;
    border: 1px solid var(--rfm-line);
    border-radius: 7px;
    display: grid;
    gap: 10px;
  }
  .path-legend label {
    display: flex;
    gap: 8px;
    align-items: center;
    font-size: 10px;
  }
  .path-legend label span {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }
  .path-legend input {
    accent-color: var(--rfm-ink);
  }
  .single-layer {
    border-top: 1px solid var(--rfm-line);
    padding-top: 10px;
  }
  .path-legend p {
    font-size: 9px;
    color: var(--rfm-muted);
    margin: 0;
  }
  .layer-interval {
    position: absolute;
    right: 15px;
    top: 110px;
    bottom: 130px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto 1fr;
    gap: 15px;
    padding: 14px;
    background: var(--rfm-surface);
    border-radius: var(--rfm-radius-control);
    border: 1px solid var(--rfm-line);
  }
  .layer-status,
  .layer-interval button {
    grid-column: 1 / -1;
    line-height: 1.6;
  }
  .layer-interval button {
    padding: 5px;
    font-size: 10px;
  }
  .layer-interval label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    font-size: 10px;
  }
  .layer-interval input {
    writing-mode: vertical-lr;
    direction: rtl;
    flex: 1;
    min-height: 100px;
    accent-color: var(--rfm-ink);
  }
  .path-playback {
    position: absolute;
    bottom: 47px;
    left: 16px;
    right: 16px;
    display: flex;
    gap: 12px;
    align-items: center;
    background: var(--rfm-surface);
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-control);
    padding: 12px;
  }
  .path-progress {
    display: grid;
    gap: 6px;
    flex: 1;
    min-width: 60px;
  }
  .path-progress input {
    width: 100%;
    accent-color: var(--rfm-ink);
  }
  .path-playback > span {
    font-size: 9px;
    max-width: 160px;
    color: var(--rfm-muted);
  }
  .path-playback > label:not(.path-progress) {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .path-footer {
    position: absolute;
    bottom: 12px;
    left: 18px;
    color: var(--rfm-muted);
    font-size: 9px;
  }
  .path-warning {
    position: absolute;
    top: 57px;
    left: 205px;
    right: 90px;
    padding: 10px;
    background: #fff8e8;
    border: 1px solid #e5d4b0;
    border-radius: var(--rfm-radius-control);
    font-size: 10px;
    line-height: 1.7;
  }
  .path-empty {
    position: absolute;
    top: 45%;
    left: 30%;
  }
  @media (max-width: 760px) {
    .toolpath-viewer {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px;
    }
    .toolpath-canvas {
      position: relative;
      inset: auto;
      order: 2;
      height: 300px;
      flex-shrink: 0;
    }
    .path-heading {
      position: static;
      order: 0;
      gap: 8px;
      flex-wrap: wrap;
    }
    .path-heading b {
      font-size: 12px;
    }
    .path-heading span {
      font-size: 9px;
    }
    .path-legend {
      position: static;
      order: 3;
      padding: 10px;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
      right: 10px;
    }
    .path-legend > b,
    .path-legend > p,
    .path-legend > small {
      grid-column: 1 / -1;
      max-width: none;
    }
    .path-legend .single-layer {
      grid-column: 1 / -1;
    }
    .model-note {
      position: static;
      order: 1;
      font-size: 10px;
    }
    .layer-interval {
      position: static;
      order: 4;
      padding: 8px;
      gap: 6px;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
    }
    .layer-status,
    .layer-interval button {
      grid-column: auto;
    }
    .layer-interval label {
      gap: 4px;
      align-items: stretch;
    }
    .layer-interval input {
      writing-mode: horizontal-tb;
      direction: ltr;
      min-height: 0;
      width: 100%;
    }
    .layer-interval label {
      font-size: 9px;
    }
    .path-playback {
      position: static;
      order: 5;
      gap: 6px;
      flex-wrap: wrap;
      padding: 8px;
    }
    .path-playback > span {
      display: none;
    }
    .path-warning {
      position: static;
      order: 1;
      font-size: 9px;
    }
    .path-footer {
      position: static;
      order: 6;
      font-size: 8px;
    }
  }
</style>
