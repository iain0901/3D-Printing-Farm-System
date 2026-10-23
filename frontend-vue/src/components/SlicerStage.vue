<template>
  <section
    class="slicer-stage"
    @keydown="shortcut"
    tabindex="0"
    aria-label="3D 切片工作區"
    @dragover.prevent
    @drop.prevent="emit('import', $event.dataTransfer.files)"
  >
    <div ref="host" class="stage-canvas" />
    <div class="stage-top">
      <span class="stage-label">
        3DRFM
        <b>模型準備</b>
      </span>
      <div class="stage-actions">
        <button type="button" :disabled="disabled" @click="emit('command', 'undo')" aria-label="復原模型操作">↶</button>
        <button type="button" :disabled="disabled" @click="emit('command', 'redo')" aria-label="重做模型操作">↷</button>
        <button type="button" :disabled="disabled" @click="emit('import')">＋ 匯入模型</button>
      </div>
    </div>
    <div class="stage-tools" role="toolbar" aria-label="模型操作工具">
      <button
        v-for="item in studioTools"
        :key="item.id"
        type="button"
        :title="`${item.label}（${item.key}）`"
        :aria-label="item.label"
        :aria-pressed="tool === item.id"
        :disabled="
          disabled || (!models.length && item.id !== 'select') || (['rotate', 'scale', 'lay'].includes(item.id) && selectedIds.length !== 1)
        "
        @click="tool = item.id"
      >
        <span aria-hidden="true">{{ item.glyph }}</span>
        <small>{{ item.label }}</small>
      </button>
      <hr />
      <button type="button" :disabled="disabled || !selectedIds.length" @click="emit('command', 'clone')" aria-label="複製選取模型">
        <span aria-hidden="true">▣</span>
        <small>複製</small>
      </button>
      <button type="button" :disabled="disabled || !selectedIds.length" @click="emit('command', 'hide')" aria-label="切換選取模型可見性">
        <span aria-hidden="true">◉</span>
        <small>隱藏</small>
      </button>
      <button type="button" :disabled="disabled || !selectedIds.length" @click="emit('command', 'remove')" aria-label="刪除選取模型">
        <span aria-hidden="true">×</span>
        <small>刪除</small>
      </button>
      <button type="button" :disabled="disabled || !models.length" @click="emit('command', 'pack')">
        <span aria-hidden="true">▦</span>
        <small>自動排版</small>
      </button>
      <button type="button" :disabled="disabled || !models.length" @click="emit('command', 'resetAll')">
        <span aria-hidden="true">⟲</span>
        <small>全部重設</small>
      </button>
    </div>
    <div v-if="!models.length" class="stage-empty">
      <span class="empty-coordinate" aria-hidden="true">
        X ─── Y
        <br />
        │
        <br />
        Z
      </span>
      <h3>把模型放上平台。</h3>
      <p>拖入 STL，或從模型庫帶入你的作品。</p>
      <button type="button" :disabled="disabled" @click="emit('import')">匯入 STL 模型</button>
    </div>
    <p v-if="loading" class="stage-message" role="status">正在準備 3D 模型…</p>
    <p v-if="error" class="stage-message error" role="alert">{{ error }}</p>
    <p v-if="tool === 'lay'" class="stage-message" role="status">點選模型上要貼合平台的表面。</p>
    <aside v-if="models.length" class="stage-inspector" aria-label="物件與變換">
      <div class="inspector-title">
        <b>
          物件清單
          <span>{{ models.length }}</span>
        </b>
        <button type="button" @click="inspectorOpen = !inspectorOpen" :aria-expanded="inspectorOpen">
          {{ inspectorOpen ? '收合' : '展開' }}
        </button>
      </div>
      <template v-if="inspectorOpen">
        <div class="object-list">
          <div
            v-for="(model, index) in models"
            :key="model.id"
            class="object-row"
            :class="{ selected: selectedIds.includes(String(model.id)), outside: !modelFits(model) }"
          >
            <button
              type="button"
              :aria-label="`選取 ${model.name}`"
              :aria-pressed="selectedIds.includes(String(model.id))"
              @click="select(model.id, $event.ctrlKey || $event.metaKey || $event.shiftKey)"
            >
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
              {{ model.name }}
            </button>
            <button
              type="button"
              :disabled="disabled"
              :aria-label="`${model.hidden ? '顯示' : '隱藏'} ${model.name}`"
              @click="emit('command', 'toggleHidden', String(model.id))"
            >
              {{ model.hidden ? '○' : '●' }}
            </button>
          </div>
        </div>
        <p class="inspector-note">Ctrl／⌘ 點選可多選。隱藏只影響檢視，仍參與切片。</p>
        <template v-if="current && selectedIds.length === 1">
          <div class="transform-heading">
            <b>{{ tool === 'scale' ? '尺寸與縮放' : tool === 'rotate' ? '方向與旋轉' : '位置與方向' }}</b>
            <span>{{ current.dimensions?.map((v) => v.toFixed(1)).join(' × ') }} mm</span>
          </div>
          <div v-if="tool === 'translate' || tool === 'select'" class="axis-fields">
            <label v-for="axis in ['x', 'y']" :key="axis">
              {{ axis.toUpperCase() }} mm
              <input
                :value="current.position[axis]"
                :aria-label="`模型位置 ${axis.toUpperCase()}`"
                type="number"
                step="0.1"
                :disabled="disabled"
                @change="
                  emit('positions', [{ id: String(current.id), position: { ...current.position, [axis]: Number($event.target.value) } }])
                "
              />
            </label>
            <label>
              Z mm
              <input value="0" disabled aria-label="模型貼齊平台 Z" />
            </label>
          </div>
          <div v-if="tool === 'rotate'" class="axis-fields">
            <label v-for="axis in ['x', 'y', 'z']" :key="axis">
              {{ axis.toUpperCase() }} °
              <input
                :value="Number(current.transform[axis]).toFixed(1)"
                :aria-label="`模型旋轉 ${axis.toUpperCase()}`"
                type="number"
                min="-360"
                max="360"
                step="1"
                :disabled="disabled"
                @change="transform({ [axis]: Number($event.target.value), layFlat: false })"
              />
            </label>
          </div>
          <template v-if="tool === 'scale'">
            <label class="scale-lock">
              <input v-model="uniform" type="checkbox" />
              等比例縮放
            </label>
            <div v-if="uniform" class="axis-fields">
              <label>
                整體 %
                <input
                  :value="current.transform.scale"
                  aria-label="模型等比縮放"
                  type="number"
                  min="1"
                  max="1000"
                  :disabled="disabled"
                  @change="transform({ scale: Number($event.target.value) })"
                />
              </label>
            </div>
            <div v-else class="axis-fields">
              <label v-for="axis in ['X', 'Y', 'Z']" :key="axis">
                {{ axis }} %
                <input
                  :value="current.transform['scale' + axis] ?? 100"
                  :aria-label="`模型非等比縮放 ${axis}`"
                  type="number"
                  min="1"
                  max="1000"
                  :disabled="disabled"
                  @change="transform({ ['scale' + axis]: Number($event.target.value) })"
                />
              </label>
            </div>
            <div class="mirror-buttons">
              <button
                v-for="axis in ['X', 'Y', 'Z']"
                :key="axis"
                type="button"
                :disabled="disabled"
                :aria-pressed="!!current.transform['mirror' + axis]"
                @click="transform({ ['mirror' + axis]: !current.transform['mirror' + axis] })"
              >
                鏡像 {{ axis }}
              </button>
            </div>
          </template>
          <div class="inspector-buttons">
            <button type="button" :disabled="disabled" @click="emit('command', 'center')">置中</button>
            <button type="button" :disabled="disabled" @click="emit('command', 'flat')">自動平躺</button>
            <button type="button" :disabled="disabled" @click="emit('command', 'reset')">重設選取</button>
          </div>
        </template>
        <p v-else-if="selectedIds.length > 1" class="inspector-note">已選 {{ selectedIds.length }} 個模型，可一起移動、複製或刪除。</p>
      </template>
    </aside>
    <div class="stage-views" aria-label="相機視角">
      <button v-for="view in views" :key="view.id" type="button" :aria-label="`${view.label}視圖`" @click="cameraView(view.id)">
        {{ view.label }}
      </button>
      <button type="button" @click="fitCamera">適合視窗</button>
      <button type="button" :disabled="!selectedIds.length" @click="fitCamera(true)">聚焦選取</button>
      <button type="button" :aria-pressed="showVolume" @click="toggleVolume">建構體積</button>
    </div>
    <div class="stage-foot">
      <span>260 × 260 × 260 mm · 參考平台</span>
      <span>
        {{
          tool === 'select' && painting && painting.tool !== 'orbit' ? '上色：拖曳塗色；切換旋轉以環視。' : '拖曳環視 · 滾輪縮放 · 中鍵平移'
        }}
      </span>
    </div>
  </section>
</template>

<script setup>
  import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
  import { selectPaintFaces } from '@/utils/surface-paint.mjs'
  import { studioTools, modelFits, quaternionTransform, alignFaceTransform } from '@/utils/slicer-studio.mjs'
  const props = defineProps({
    models: { type: Array, default: () => [] },
    selectedIds: { type: Array, default: () => [] },
    disabled: Boolean,
    appearance: { type: Object, default: () => ({}) },
    painting: { type: Object, default: null },
  })
  const emit = defineEmits(['import', 'select', 'command', 'transform', 'positions', 'paint'])
  const host = ref(null),
    tool = ref('select'),
    loading = ref(false),
    error = ref(''),
    uniform = ref(true),
    inspectorOpen = ref(true),
    showVolume = ref(true)
  const current = computed(() => props.models.find((m) => String(m.id) === props.selectedIds.at(-1)))
  const views = [
    { id: 'iso', label: '等角' },
    { id: 'top', label: '上' },
    { id: 'front', label: '前' },
    { id: 'back', label: '後' },
    { id: 'left', label: '左' },
    { id: 'right', label: '右' },
    { id: 'bottom', label: '下' },
  ]
  let scene,
    camera,
    renderer,
    controls,
    gizmo,
    volume,
    observer,
    frame = 0,
    disposed = false,
    loadVersion = 0,
    didFit = false,
    dragState = null,
    down = null,
    stroke = null
  const groups = new Map(),
    workers = new Set(),
    raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2(),
    proxy = new THREE.Object3D()
  function scheduleRender() {
    if (disposed || frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      if (!renderer) return
      renderer.render(scene, camera)
      renderer.domElement.dataset.renderedTriangles = String([...groups.values()].reduce((n, g) => n + g.userData.triangles, 0))
      renderer.domElement.dataset.renderCount = String(Number(renderer.domElement.dataset.renderCount || 0) + 1)
    })
  }
  function select(id, additive = false) {
    emit('select', { id: String(id), additive })
  }
  function toggleVolume() {
    showVolume.value = !showVolume.value
    if (volume) volume.visible = showVolume.value
    scheduleRender()
  }
  function transform(patch) {
    if (current.value && !props.disabled) emit('transform', { id: String(current.value.id), patch })
  }
  function cameraView(id) {
    if (!camera) return
    const direction = {
      iso: [1, -1, 0.85],
      top: [0, 0, 1],
      bottom: [0, 0, -1],
      front: [0, -1, 0],
      back: [0, 1, 0],
      left: [-1, 0, 0],
      right: [1, 0, 0],
    }[id] || [1, -1, 0.85]
    camera.up.set(...(['top', 'bottom'].includes(id) ? [0, 1, 0] : [0, 0, 1]))
    camera.position.copy(controls.target).add(new THREE.Vector3(...direction).normalize().multiplyScalar(490))
    camera.lookAt(controls.target)
    controls.update()
    scheduleRender()
  }
  function fitCamera(selectionOnly = false) {
    if (!camera) return
    const box = new THREE.Box3()
    for (const [id, g] of groups) if (g.visible && (selectionOnly !== true || props.selectedIds.includes(id))) box.expandByObject(g)
    const center = box.isEmpty() ? new THREE.Vector3(130, 130, 30) : box.getCenter(new THREE.Vector3())
    const size = box.isEmpty() ? new THREE.Vector3(260, 260, 100) : box.getSize(new THREE.Vector3())
    const distance = Math.max(100, size.length() * 1.55)
    const dir = camera.position.clone().sub(controls.target).normalize()
    controls.target.copy(center)
    camera.position.copy(center).addScaledVector(dir, distance)
    camera.lookAt(center)
    controls.update()
    scheduleRender()
  }
  function resize() {
    if (!renderer || !host.value) return
    const { width, height } = host.value.getBoundingClientRect()
    if (!width || !height) return
    renderer.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    scheduleRender()
  }
  function disposeGroup(group) {
    scene.remove(group)
    group.traverse((o) => {
      o.geometry?.dispose()
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
    })
  }
  function parseModel(model, version) {
    return new Promise((resolve, reject) => {
      const worker = markRaw(new Worker(new URL('../workers/model-preview.worker.js', import.meta.url), { type: 'module' }))
      workers.add(worker)
      worker.onmessage = ({ data }) => {
        worker.terminate()
        workers.delete(worker)
        data.error ? reject(new Error(data.error)) : resolve(data)
      }
      worker.onerror = () => {
        worker.terminate()
        workers.delete(worker)
        reject(new Error('無法解析模型'))
      }
      model.file
        .arrayBuffer()
        .then((buffer) => {
          if (disposed || version !== loadVersion) {
            worker.terminate()
            workers.delete(worker)
            resolve(null)
            return
          }
          worker.postMessage({ id: String(model.id), buffer, painting: !!props.painting }, [buffer])
        })
        .catch(reject)
    })
  }
  async function syncModels() {
    if (!scene) return
    const version = ++loadVersion
    loading.value = true
    error.value = ''
    try {
      const existing = new Set(props.models.map((m) => String(m.id)))
      for (const [id, g] of groups)
        if (!existing.has(id)) {
          disposeGroup(g)
          groups.delete(id)
        }
      for (const model of props.models) {
        if (!model.file) continue
        const id = String(model.id),
          old = groups.get(id)
        if (old?.userData.file === model.file && old.userData.hasTopology === !!props.painting) continue
        const data = await parseModel(model, version)
        if (!data || disposed || version !== loadVersion) return
        if (old) disposeGroup(old)
        const root = new THREE.Group(),
          content = new THREE.Group()
        root.add(content)
        root.userData = { id, file: model.file, triangles: 0, topology: data.topology, hasTopology: !!props.painting, content }
        for (const part of data.parts) {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
          geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(part.positions.length), 3))
          const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02 }))
          mesh.userData = { id, faceIds: part.faceIds }
          content.add(mesh)
          root.userData.triangles += part.positions.length / 9
        }
        groups.set(id, root)
        scene.add(root)
      }
      syncPositions()
      applyColors()
      updateGizmo()
      if (props.models.some((m) => m.file) && !didFit) {
        didFit = true
        fitCamera()
      }
    } catch (err) {
      if (version === loadVersion) error.value = err.message
    } finally {
      if (version === loadVersion) loading.value = false
      scheduleRender()
    }
  }
  function syncPositions() {
    if (dragState) return
    for (const model of props.models) {
      const group = groups.get(String(model.id))
      if (!group) continue
      group.visible = !model.hidden
      group.position.set(model.position.x, model.position.y, (model.dimensions?.[2] || 0) / 2)
      group.quaternion.identity()
      group.scale.set(1, 1, 1)
      group.userData.content.position.set(0, 0, -(model.dimensions?.[2] || 0) / 2)
    }
    updateGizmo()
    scheduleRender()
  }
  function applyColors() {
    for (const model of props.models) {
      const root = groups.get(String(model.id))
      if (!root) continue
      const style = props.appearance[model.id] || {},
        base = new THREE.Color(style.color || '#b6c2c0')
      for (const mesh of root.userData.content.children) {
        const pos = mesh.geometry.getAttribute('position'),
          colors = mesh.geometry.getAttribute('color')
        for (let face = 0; face < pos.count / 3; face++) {
          const global = mesh.userData.faceIds?.[face] ?? face
          const z = (pos.getZ(face * 3) + pos.getZ(face * 3 + 1) + pos.getZ(face * 3 + 2)) / 3
          let hex = (style.bands || []).find((b) => z >= b.from && z < b.to)?.color
          const slot = style.faces?.[global]
          if (slot) hex = props.painting?.slots.find((s) => s.id === slot)?.hex || hex
          const color = hex ? new THREE.Color(hex) : base
          for (let i = 0; i < 3; i++) colors.setXYZ(face * 3 + i, color.r, color.g, color.b)
        }
        colors.needsUpdate = true
        mesh.material.emissive.set(!modelFits(model) ? '#9b271a' : props.selectedIds.includes(String(model.id)) ? '#0d2725' : '#000000')
      }
    }
    scheduleRender()
  }
  function hits(event) {
    const box = renderer.domElement.getBoundingClientRect()
    pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const meshes = [...groups.values()].filter((g) => g.visible).flatMap((g) => g.userData.content.children)
    return raycaster.intersectObjects(meshes, false)
  }
  function updateGizmo() {
    if (!gizmo || dragState) return
    gizmo.detach()
    if (props.disabled || !['translate', 'rotate', 'scale'].includes(tool.value) || !props.selectedIds.length) return
    if (tool.value !== 'translate' && props.selectedIds.length !== 1) return
    const selected = props.models.filter((m) => props.selectedIds.includes(String(m.id)) && !m.hidden && m.file)
    if (!selected.length) return
    const pivot = new THREE.Vector3()
    selected.forEach((m) => pivot.add(new THREE.Vector3(m.position.x, m.position.y, (m.dimensions?.[2] || 0) / 2)))
    pivot.multiplyScalar(1 / selected.length)
    proxy.position.copy(pivot)
    proxy.quaternion.identity()
    proxy.scale.set(1, 1, 1)
    if (selected.length === 1 && tool.value !== 'translate') {
      const model = selected[0]
      proxy.quaternion.fromArray(model.effectiveQuaternion || [0, 0, 0, 1])
      proxy.scale.fromArray(model.effectiveScale || [1, 1, 1])
    }
    gizmo.setMode(tool.value)
    gizmo.setSpace(tool.value === 'translate' ? 'world' : 'local')
    gizmo.showX = true
    gizmo.showY = true
    gizmo.showZ = tool.value !== 'translate'
    gizmo.attach(proxy)
    scheduleRender()
  }
  function beginGizmo() {
    dragState = {
      matrix: proxy.matrixWorld.clone(),
      position: proxy.position.clone(),
      scale: proxy.scale.clone(),
      models: props.models
        .filter((m) => props.selectedIds.includes(String(m.id)))
        .map((m) => ({ model: m, group: groups.get(String(m.id)), matrix: groups.get(String(m.id))?.matrixWorld.clone() })),
    }
    controls.enabled = false
  }
  function moveGizmo() {
    if (!dragState) return
    if (tool.value === 'scale' && uniform.value) {
      const ratios = ['x', 'y', 'z'].map((axis) => proxy.scale[axis] / dragState.scale[axis])
      const ratio = ratios.reduce((a, b) => (Math.abs(b - 1) > Math.abs(a - 1) ? b : a), 1)
      proxy.scale.copy(dragState.scale).multiplyScalar(ratio)
    }
    proxy.updateMatrixWorld(true)
    const delta = proxy.matrixWorld.clone().multiply(dragState.matrix.clone().invert())
    for (const entry of dragState.models)
      if (entry.group && entry.matrix) {
        const matrix = delta.clone().multiply(entry.matrix)
        matrix.decompose(entry.group.position, entry.group.quaternion, entry.group.scale)
      }
    scheduleRender()
  }
  function endGizmo() {
    if (!dragState) return
    const saved = dragState
    dragState = null
    controls.enabled = true
    if (props.disabled) {
      syncPositions()
      return
    }
    if (tool.value === 'translate') {
      const delta = proxy.position.clone().sub(saved.position)
      emit(
        'positions',
        saved.models.map(({ model }) => ({
          id: String(model.id),
          position: { x: model.position.x + delta.x, y: model.position.y + delta.y },
        }))
      )
    } else if (saved.models[0]) {
      const model = saved.models[0].model
      if (tool.value === 'rotate') emit('transform', { id: String(model.id), patch: quaternionTransform(proxy.quaternion.toArray()) })
      else {
        const values = proxy.scale.toArray()
        emit('transform', {
          id: String(model.id),
          patch: {
            scale: 100,
            scaleX: Math.max(1, Math.min(1000, Math.abs(values[0]) * 100)),
            scaleY: Math.max(1, Math.min(1000, Math.abs(values[1]) * 100)),
            scaleZ: Math.max(1, Math.min(1000, Math.abs(values[2]) * 100)),
            mirrorX: values[0] < 0,
            mirrorY: values[1] < 0,
            mirrorZ: values[2] < 0,
            ...quaternionTransform(proxy.quaternion.toArray()),
          },
        })
      }
    }
    scheduleRender()
  }
  function pointerDown(event) {
    down = { x: event.clientX, y: event.clientY }
    if (props.disabled || loading.value || gizmo?.axis) return
    const hit = hits(event)[0]
    if (!hit) return
    if (tool.value === 'lay') {
      event.preventDefault()
      event.stopImmediatePropagation()
      const model = props.models.find((m) => String(m.id) === hit.object.userData.id)
      emit('transform', {
        id: String(model.id),
        patch: alignFaceTransform(hit.face.normal.toArray(), model.effectiveQuaternion || [0, 0, 0, 1]),
      })
      tool.value = 'select'
      return
    }
    if (tool.value === 'select' && props.painting && props.painting.tool !== 'orbit') {
      event.preventDefault()
      event.stopImmediatePropagation()
      controls.enabled = false
      select(hit.object.userData.id)
      stroke = { id: hit.object.userData.id, changes: new Map(), pointerId: event.pointerId }
      renderer.domElement.setPointerCapture(event.pointerId)
      paintAt(event)
    }
  }
  function paintAt(event) {
    if (!stroke) return
    const hit = hits(event).find((h) => h.object.userData.id === stroke.id)
    if (!hit) return
    const group = groups.get(stroke.id),
      topology = group?.userData.topology
    if (!topology) return
    const face = hit.object.userData.faceIds?.[hit.faceIndex] ?? hit.faceIndex,
      point = hit.object.worldToLocal(hit.point.clone())
    const faces = selectPaintFaces(topology, face, point, props.painting.radius || 5, props.painting.tool === 'fill')
    const after = props.painting.tool === 'erase' ? null : props.painting.slotId
    for (const id of faces) {
      const before = props.appearance[stroke.id]?.faces?.[id] ?? null
      if (!stroke.changes.has(id)) stroke.changes.set(id, { face: id, before, after })
    }
    const preview = { ...(props.appearance[stroke.id]?.faces || {}) }
    for (const change of stroke.changes.values())
      if (change.after) preview[change.face] = change.after
      else delete preview[change.face]
    const color = new THREE.Color()
    for (const mesh of group.userData.content.children) {
      const colors = mesh.geometry.getAttribute('color'),
        positions = mesh.geometry.getAttribute('position'),
        style = props.appearance[stroke.id] || {}
      for (let local = 0; local < positions.count / 3; local++) {
        const id = mesh.userData.faceIds?.[local] ?? local
        if (!stroke.changes.has(id)) continue
        const z = positions.getZ(local * 3),
          slot = preview[id]
        color.set(
          props.painting.slots.find((s) => s.id === slot)?.hex ||
            (style.bands || []).find((b) => z >= b.from && z < b.to)?.color ||
            style.color ||
            '#b6c2c0'
        )
        for (let j = 0; j < 3; j++) colors.setXYZ(local * 3 + j, color.r, color.g, color.b)
      }
      colors.needsUpdate = true
    }
    scheduleRender()
  }
  function pointerMove(event) {
    if (stroke) {
      event.preventDefault()
      paintAt(event)
    }
  }
  function finishPaint(cancelled = false) {
    if (!stroke) return
    const saved = stroke
    stroke = null
    controls.enabled = true
    if (renderer.domElement.hasPointerCapture(saved.pointerId)) renderer.domElement.releasePointerCapture(saved.pointerId)
    if (cancelled) applyColors()
    else emit('paint', { modelId: saved.id, changes: [...saved.changes.values()].filter((c) => c.before !== c.after) })
  }
  function pointerUp(event) {
    if (stroke) {
      event.preventDefault()
      event.stopImmediatePropagation()
      finishPaint()
      return
    }
    if (gizmo?.axis || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return
    const hit = hits(event)[0]
    if (hit) select(hit.object.userData.id, event.ctrlKey || event.metaKey || event.shiftKey)
    down = null
  }
  function shortcut(event) {
    if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName) || props.disabled) return
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && props.selectedIds.length) {
      event.preventDefault()
      const d = event.shiftKey ? 10 : 1
      emit(
        'positions',
        props.models
          .filter((m) => props.selectedIds.includes(String(m.id)))
          .map((m) => ({
            id: String(m.id),
            position: {
              x: m.position.x + (event.key === 'ArrowRight' ? d : event.key === 'ArrowLeft' ? -d : 0),
              y: m.position.y + (event.key === 'ArrowUp' ? d : event.key === 'ArrowDown' ? -d : 0),
            },
          }))
      )
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      emit('command', 'selectAll')
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      emit('command', event.shiftKey ? 'redo' : 'undo')
      return
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault()
      emit('command', 'clone')
      return
    }
    if (['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault()
      emit('command', 'remove')
      return
    }
    const t = studioTools.find((t) => t.key.toLowerCase() === event.key.toLowerCase())
    if (t) tool.value = t.id
  }
  watch(() => props.models.map((m) => [m.id, m.file]), syncModels)
  watch(() => props.models.map((m) => [m.position.x, m.position.y, m.hidden, ...(m.dimensions || [])]), syncPositions)
  watch(() => props.appearance, applyColors, { deep: true })
  watch(
    () => props.selectedIds,
    () => {
      applyColors()
      updateGizmo()
    },
    { deep: true }
  )
  watch(() => !!props.painting, syncModels)
  watch(
    () => props.painting?.tool,
    () => {
      if (props.painting?.tool !== 'orbit') {
        tool.value = 'select'
        if (props.painting && window.innerWidth <= 760) inspectorOpen.value = false
      }
      finishPaint(true)
      updateGizmo()
    }
  )
  watch(tool, () => {
    if (tool.value === 'lay' && window.innerWidth <= 760) inspectorOpen.value = false
    finishPaint(true)
    updateGizmo()
  })
  watch(() => props.disabled, updateGizmo)
  onMounted(async () => {
    await nextTick()
    try {
      scene = new THREE.Scene()
      scene.background = new THREE.Color(getComputedStyle(host.value).getPropertyValue('--rfm-canvas').trim() || '#eef0f3')
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 5000)
      camera.up.set(0, 0, 1)
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.domElement.setAttribute('aria-label', '多模型 3D 列印平台')
      host.value.append(renderer.domElement)
      scene.add(new THREE.HemisphereLight(0xffffff, 0x53685a, 2))
      const light = new THREE.DirectionalLight(0xffffff, 2)
      light.position.set(100, -150, 500)
      scene.add(light)
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: '#fafbf7', roughness: 0.94 }))
      plane.position.set(130, 130, -0.6)
      scene.add(plane)
      const grid = new THREE.GridHelper(260, 26, 0xa8b9af, 0xd8e0d9)
      grid.rotation.x = Math.PI / 2
      grid.position.set(130, 130, -0.3)
      scene.add(grid)
      volume = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(260, 260, 260)),
        new THREE.LineBasicMaterial({ color: '#6f9b86', transparent: true, opacity: 0.45 })
      )
      volume.position.set(130, 130, 130)
      scene.add(volume)
      const margin = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(5, 5, 0.02),
          new THREE.Vector3(255, 5, 0.02),
          new THREE.Vector3(255, 255, 0.02),
          new THREE.Vector3(5, 255, 0.02),
        ]),
        new THREE.LineDashedMaterial({ color: '#a98b56', dashSize: 3, gapSize: 2 })
      )
      margin.computeLineDistances()
      scene.add(margin)
      const axes = new THREE.AxesHelper(50)
      axes.position.set(0, 0, 0)
      scene.add(axes)
      controls = new OrbitControls(camera, renderer.domElement)
      controls.target.set(130, 130, 45)
      controls.enableDamping = false
      controls.addEventListener('change', scheduleRender)
      gizmo = new TransformControls(camera, renderer.domElement)
      gizmo.setSize(0.8)
      scene.add(gizmo)
      scene.add(proxy)
      gizmo.addEventListener('mouseDown', beginGizmo)
      gizmo.addEventListener('objectChange', moveGizmo)
      gizmo.addEventListener('mouseUp', endGizmo)
      gizmo.addEventListener('change', scheduleRender)
      const canvas = renderer.domElement
      canvas.addEventListener('pointerdown', pointerDown, true)
      canvas.addEventListener('pointermove', pointerMove, true)
      canvas.addEventListener('pointerup', pointerUp, true)
      canvas.addEventListener('pointercancel', () => finishPaint(true))
      observer = new ResizeObserver(resize)
      observer.observe(host.value)
      resize()
      cameraView('iso')
      await syncModels()
    } catch (err) {
      error.value = '無法啟動 3D 工作區，請確認瀏覽器支援 WebGL。'
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    loadVersion++
    cancelAnimationFrame(frame)
    observer?.disconnect()
    workers.forEach((w) => w.terminate())
    controls?.dispose()
    gizmo?.dispose()
    for (const g of groups.values()) disposeGroup(g)
    scene?.traverse((o) => {
      o.geometry?.dispose()
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose())
    })
    renderer?.dispose()
    renderer?.forceContextLoss()
    renderer?.domElement.remove()
  })
  defineExpose({ cameraView, fitCamera })
</script>

<style scoped>
  .slicer-stage {
    position: relative;
    min-width: 0;
    height: 100%;
    min-height: 620px;
    background: var(--rfm-canvas);
    overflow: hidden;
    border-radius: var(--rfm-radius-panel);
    isolation: isolate;
    font-family: var(--rfm-font);
    color: var(--rfm-ink);
  }
  .stage-canvas {
    position: absolute;
    inset: 0;
  }
  .stage-canvas :deep(canvas) {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .stage-top {
    position: absolute;
    inset: 14px 16px auto 18px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    pointer-events: none;
  }
  .stage-label {
    font-weight: 900;
    letter-spacing: 1px;
    font-size: 16px;
  }
  .stage-label b {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 2px;
    border-left: 1px solid var(--rfm-line);
    margin-left: 12px;
    padding-left: 12px;
  }
  .stage-actions {
    display: flex;
    gap: 6px;
    pointer-events: auto;
  }
  .slicer-stage button {
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    color: inherit;
    border-radius: var(--rfm-radius-control);
    font: inherit;
    font-size: 11px;
    padding: 8px 10px;
    cursor: pointer;
  }
  .slicer-stage button:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .slicer-stage button:focus-visible {
    outline: 2px solid var(--rfm-focus);
    outline-offset: 3px;
  }
  .stage-tools {
    position: absolute;
    left: 14px;
    top: 70px;
    display: grid;
    gap: 4px;
    padding: 5px;
    background: var(--rfm-surface);
    border: 1px solid var(--rfm-line);
    border-radius: var(--rfm-radius-panel);
    box-shadow: 0 3px 20px #1d40300b;
  }
  .stage-tools button {
    width: 54px;
    min-height: 47px;
    border: 0;
    display: grid;
    justify-items: center;
    gap: 1px;
    background: transparent;
    padding: 5px;
  }
  .stage-tools button[aria-pressed='true'] {
    background: var(--rfm-ink);
    color: var(--rfm-surface);
  }
  .stage-tools span {
    font-size: 21px;
    line-height: 1;
  }
  .stage-tools small {
    font-size: 9px;
  }
  .stage-tools hr {
    width: 34px;
    border: 0;
    border-top: 1px solid var(--rfm-line);
    margin: 4px auto;
  }
  .stage-empty {
    position: absolute;
    top: 33%;
    left: 50%;
    transform: translateX(-50%);
    text-align: center;
    max-width: 300px;
    pointer-events: none;
  }
  .stage-empty h3 {
    font-size: 24px;
    letter-spacing: -0.5px;
  }
  .stage-empty p {
    font-size: 12px;
    color: var(--rfm-muted);
    line-height: 1.8;
  }
  .stage-empty button {
    pointer-events: auto;
    background: var(--rfm-ink);
    color: white;
    border: 0;
    padding: 12px 22px;
  }
  .empty-coordinate {
    display: block;
    font-size: 16px;
    line-height: 1.2;
    letter-spacing: 8px;
    color: var(--rfm-muted);
    opacity: 0.8;
  }
  .stage-message {
    position: absolute;
    top: 65px;
    left: 50%;
    transform: translateX(-50%);
    max-width: 65%;
    padding: 10px 16px;
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    font-size: 12px;
    border-radius: var(--rfm-radius-control);
  }
  .stage-message.error {
    color: var(--rfm-danger);
  }
  .stage-inspector {
    position: absolute;
    top: 70px;
    right: 14px;
    width: 250px;
    max-height: calc(100% - 170px);
    overflow: auto;
    background: var(--rfm-surface);
    border: 1px solid var(--rfm-line);
    border-radius: 7px;
    padding: 12px;
    font-size: 11px;
    box-shadow: 0 3px 20px #1d40300b;
  }
  .inspector-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .inspector-title button {
    border: 0;
    background: none;
    padding: 4px;
  }
  .inspector-title span {
    color: var(--rfm-muted);
    padding-left: 6px;
  }
  .object-list {
    margin-top: 12px;
    max-height: 150px;
    overflow: auto;
  }
  .object-row {
    display: flex;
    align-items: center;
    border-radius: var(--rfm-radius-control);
    overflow: hidden;
  }
  .object-row.selected {
    background: var(--rfm-selected);
  }
  .object-row.outside {
    box-shadow: inset 3px 0 #b65035;
  }
  .object-row button {
    background: none;
    border: 0;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .object-row button:first-child {
    flex: 1;
  }
  .object-row span {
    font-size: 9px;
    color: var(--rfm-muted);
    margin-right: 8px;
  }
  .inspector-note {
    font-size: 10px;
    color: var(--rfm-muted);
    line-height: 1.7;
  }
  .transform-heading {
    display: grid;
    gap: 4px;
    border-top: 1px solid var(--rfm-line);
    padding-top: 12px;
    margin-top: 12px;
  }
  .transform-heading span {
    color: var(--rfm-muted);
    font-size: 10px;
  }
  .axis-fields {
    display: flex;
    gap: 6px;
    margin: 10px 0;
  }
  .axis-fields label {
    min-width: 0;
    flex: 1;
    font-size: 9px;
    color: var(--rfm-muted);
  }
  .axis-fields input {
    display: block;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--rfm-line);
    background: var(--rfm-surface);
    border-radius: 3px;
    padding: 7px 3px;
    font: inherit;
    font-size: 11px;
    color: var(--rfm-ink);
  }
  .scale-lock {
    display: flex;
    gap: 7px;
    align-items: center;
    margin-top: 12px;
  }
  .mirror-buttons,
  .inspector-buttons {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }
  .mirror-buttons button,
  .inspector-buttons button {
    font-size: 10px;
    padding: 6px;
  }
  .mirror-buttons button[aria-pressed='true'] {
    background: var(--rfm-ink);
    color: white;
  }
  .stage-views {
    position: absolute;
    bottom: 43px;
    left: 88px;
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    right: 12px;
  }
  .stage-views button {
    padding: 6px 9px;
    font-size: 10px;
  }
  .stage-foot {
    position: absolute;
    bottom: 12px;
    left: 18px;
    right: 18px;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 9px;
    color: var(--rfm-muted);
    pointer-events: none;
  }
  @media (max-width: 760px) {
    .slicer-stage {
      min-height: 600px;
    }
    .stage-inspector {
      width: 200px;
      right: 10px;
      top: 63px;
    }
    .stage-tools {
      left: 8px;
      top: 63px;
    }
    .stage-tools button {
      width: 40px;
      min-height: 41px;
    }
    .stage-tools small {
      font-size: 8px;
    }
    .stage-top {
      inset: 12px 10px auto 12px;
    }
    .stage-label b {
      display: none;
    }
    .stage-actions button {
      font-size: 10px;
      padding: 7px;
    }
    .stage-views {
      left: 61px;
      bottom: 48px;
    }
    .stage-foot {
      font-size: 8px;
      left: 12px;
    }
    .stage-foot span:last-child {
      display: none;
    }
    .stage-message {
      top: auto;
      bottom: 94px;
      max-width: 80%;
      width: 70%;
      font-size: 10px;
    }
    .stage-empty {
      max-width: 200px;
      top: 45%;
    }
    .stage-empty h3 {
      font-size: 18px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto;
    }
  }
</style>
