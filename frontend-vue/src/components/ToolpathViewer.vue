<template>
  <section class="toolpath-viewer" aria-label="三維切片路徑預覽">
    <div ref="host" class="toolpath-canvas" />
    <div class="path-heading">
      <b>實際切片路徑</b>
      <span v-if="preview.layers.length">第 {{ top + 1 }}／{{ preview.layers.length }} 層 · Z {{ preview.layers[top]?.z }} mm</span>
      <button type="button" @click="fit">適合視窗</button>
    </div>
    <p v-if="preview.warning" class="path-warning" role="note">{{ preview.warning }}</p>
    <p v-if="error" class="path-warning" role="alert">{{ error }}</p>
    <p v-if="!preview.layers.length" class="path-empty">沒有可顯示的單盤擠出路徑。</p>
    <aside class="path-legend">
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
    </aside>
    <div v-if="preview.layers.length" class="layer-interval">
      <label>
        起始層 {{ bottom + 1 }}
        <input v-model.number="bottom" type="range" min="0" :max="preview.layers.length - 1" aria-label="路徑起始層" />
      </label>
      <label>
        結束層 {{ top + 1 }}
        <input v-model.number="top" type="range" min="0" :max="preview.layers.length - 1" aria-label="路徑結束層" />
      </label>
    </div>
    <div v-if="preview.layers.length" class="path-playback">
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
  const props = defineProps({ preview: { type: Object, required: true } })
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
    const bounds = props.preview.bounds
    const center = bounds
      ? new THREE.Vector3(...bounds.min).add(new THREE.Vector3(...bounds.max)).multiplyScalar(0.5)
      : new THREE.Vector3(130, 130, 20)
    const size = bounds ? new THREE.Vector3(...bounds.max).sub(new THREE.Vector3(...bounds.min)).length() : 260
    controls.target.copy(center)
    camera.position.copy(center).add(new THREE.Vector3(1, -1, 0.85).normalize().multiplyScalar(Math.max(100, size * 1.6)))
    camera.lookAt(center)
    controls.update()
    render()
  }
  function draw() {
    if (!scene) return
    segments = []
    for (let i = single.value ? top.value : bottom.value; i <= top.value; i++)
      for (const segment of props.preview.layers[i]?.segments || []) if (enabled[segment.role]) segments.push(segment)
    const positions = new Float32Array(segments.length * 6),
      colors = new Float32Array(positions.length)
    segments.forEach((segment, i) => {
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
    visibleCount.value = segments.length
    segmentRevision.value++
    updateProgress()
  }
  function updateProgress() {
    if (!lines) return
    lines.geometry.setDrawRange(0, Math.floor((segments.length * progress.value) / 100) * 2)
    const segment = headSegment.value
    if (segment) {
      head.position.fromArray(segment.to)
      head.visible = true
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
  onMounted(() => {
    try {
      scene = new THREE.Scene()
      scene.background = new THREE.Color('#edf0ee')
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
</script>
<style scoped>
  .toolpath-viewer {
    position: relative;
    height: 100%;
    min-height: 620px;
    border-radius: 8px;
    overflow: hidden;
    background: #edf0ee;
    color: #233d35;
    font-size: 11px;
  }
  .toolpath-canvas {
    position: absolute;
    inset: 0;
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
  .toolpath-viewer button,
  .toolpath-viewer select {
    background: #ffffffed;
    color: inherit;
    border: 1px solid #d4ded6;
    border-radius: 5px;
    padding: 8px 12px;
    font: inherit;
    cursor: pointer;
  }
  .path-heading span {
    color: #6c8172;
  }
  .path-legend {
    position: absolute;
    left: 16px;
    top: 65px;
    background: #ffffffed;
    padding: 14px;
    border: 1px solid #d4ded6;
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
    accent-color: #245847;
  }
  .single-layer {
    border-top: 1px solid #d4ded6;
    padding-top: 10px;
  }
  .path-legend p {
    font-size: 9px;
    color: #819287;
    margin: 0;
  }
  .layer-interval {
    position: absolute;
    right: 15px;
    top: 100px;
    bottom: 130px;
    display: flex;
    gap: 15px;
    padding: 14px;
    background: #ffffffde;
    border-radius: 6px;
    border: 1px solid #d4ded6;
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
    accent-color: #245847;
  }
  .path-playback {
    position: absolute;
    bottom: 47px;
    left: 16px;
    right: 16px;
    display: flex;
    gap: 12px;
    align-items: center;
    background: #fffffff0;
    border: 1px solid #d4ded6;
    border-radius: 6px;
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
    accent-color: #245847;
  }
  .path-playback > span {
    font-size: 9px;
    max-width: 160px;
    color: #68816e;
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
    color: #7a8e80;
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
    border-radius: 5px;
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
      min-height: 600px;
    }
    .path-heading {
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
      top: 82px;
      left: 10px;
      padding: 10px;
      gap: 8px;
    }
    .layer-interval {
      right: 10px;
      top: 180px;
      bottom: 170px;
      padding: 8px;
      gap: 6px;
    }
    .layer-interval label {
      font-size: 9px;
    }
    .path-playback {
      left: 10px;
      right: 10px;
      gap: 6px;
      flex-wrap: wrap;
      padding: 8px;
    }
    .path-playback > span {
      width: 100%;
      max-width: none;
    }
    .path-warning {
      left: 160px;
      right: 10px;
      top: 82px;
      font-size: 9px;
    }
    .path-footer {
      font-size: 8px;
      right: 12px;
    }
  }
</style>
