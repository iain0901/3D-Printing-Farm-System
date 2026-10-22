<template>
  <div class="model-viewer">
    <div ref="canvasHost" class="model-viewer-canvas" :style="{ height: height + 'px' }" />
    <p v-if="paintEnabled && !loading" class="paint-status" role="status">
      {{ paintTool === 'orbit' ? '旋轉檢視：拖曳旋轉、滾輪縮放。' : '上色模式：拖曳塗色；切換「旋轉」以查看背面。' }}
    </p>
    <div v-if="loading" class="model-viewer-overlay">
      <el-icon><Loading /></el-icon>
      載入模型中…
    </div>
    <div v-else-if="errorMessage" class="model-viewer-overlay error">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script>
  import { markRaw } from 'vue'
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
  import { selectPaintFaces } from '@/utils/surface-paint.mjs'

  // STL 不含實際材料顏色；避免用多色預覽讓客戶誤以為已完成選色。
  const DEFAULT_PALETTE = ['#d7e0e8']

  export default {
    name: 'ModelViewer',
    props: {
      file: { type: File, default: null },
      arrayBuffer: { type: ArrayBuffer, default: null },
      filename: { type: String, required: true },
      height: { type: Number, default: 320 },
      partColors: { type: Array, default: () => [] },
      // Presentation only: local model Z ranges, never interpreted as sliced layers.
      heightColors: { type: Array, default: () => [] },
      zUp: { type: Boolean, default: false },
      paintEnabled: { type: Boolean, default: false },
      paintTool: { type: String, default: 'orbit' },
      paintSlotId: { type: String, default: '' },
      brushRadius: { type: Number, default: 5 },
      paintPalette: { type: Array, default: () => [] },
      surfacePaint: { type: Object, default: () => ({}) },
    },
    data() {
      return {
        loading: false,
        errorMessage: '',
      }
    },
    watch: {
      file() {
        this.loadModel()
      },
      paintEnabled() {
        this.loadModel()
        this.updatePaintControls()
      },
      paintTool() {
        this.finishPaint(false)
        this.updatePaintControls()
      },
      paintSlotId() {
        this.finishPaint(false)
      },
      surfacePaint: {
        deep: true,
        handler() {
          this.applySurfacePaint()
        },
      },
      paintPalette: {
        deep: true,
        handler() {
          this.applyHeightColors()
          this.applySurfacePaint()
        },
      },
      arrayBuffer() {
        this.loadModel()
      },
      filename() {
        this.loadModel()
      },
      partColors(colors) {
        this.applyColors(colors)
      },
      heightColors: {
        deep: true,
        handler() {
          this.applyHeightColors()
        },
      },
      height() {
        this.handleResize()
      },
    },
    mounted() {
      this.viewerDisposed = false
      this.loadSequence = 0
      this.renderHandle = 0
      this.lastRenderWidth = 0
      this.lastRenderHeight = 0
      try {
        this.initScene()
        this.loadModel()
      } catch {
        this.errorMessage = '此裝置無法啟用 3D 預覽。'
        this.$emit('error', this.errorMessage)
      }
    },
    beforeUnmount() {
      this.finishPaint(true)
      if (this.paintFrame) cancelAnimationFrame(this.paintFrame)
      const canvas = this.renderer?.domElement
      canvas?.removeEventListener('pointerdown', this.beginPaint, true)
      canvas?.removeEventListener('pointermove', this.movePaint, true)
      canvas?.removeEventListener('pointerup', this.endPaint, true)
      canvas?.removeEventListener('pointercancel', this.cancelPaint, true)
      canvas?.removeEventListener('lostpointercapture', this.cancelPaint, true)
      this.viewerDisposed = true
      this.loadSequence += 1
      this.resizeObserver?.disconnect()
      this.cancelModelWorker('模型預覽已關閉')
      cancelAnimationFrame(this.renderHandle)
      this.controls?.removeEventListener('change', this.scheduleRender)
      this.controls?.dispose()
      this.disposeMeshes()
      this.renderer?.dispose()
      this.renderer?.forceContextLoss()
      this.renderer?.domElement?.remove()
    },
    methods: {
      initScene() {
        const host = this.$refs.canvasHost
        const width = Math.max(host.clientWidth, 1)
        this.scene = markRaw(new THREE.Scene())
        this.scene.background = new THREE.Color(0xf4f6f8)
        this.camera = markRaw(new THREE.PerspectiveCamera(45, width / this.height, 0.1, 5000))
        if (this.zUp) this.camera.up.set(0, 0, 1)
        this.renderer = markRaw(new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }))
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        this.renderer.setSize(width, this.height)
        host.appendChild(this.renderer.domElement)

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.75))
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.9)
        dirLight.position.set(1, 1.5, 1)
        this.scene.add(dirLight)
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4)
        dirLight2.position.set(-1, -0.5, -1)
        this.scene.add(dirLight2)

        this.controls = markRaw(new OrbitControls(this.camera, this.renderer.domElement))
        this.controls.enableDamping = false
        this.controls.addEventListener('change', this.scheduleRender)
        const canvas = this.renderer.domElement
        canvas.addEventListener('pointerdown', this.beginPaint, true)
        canvas.addEventListener('pointermove', this.movePaint, true)
        canvas.addEventListener('pointerup', this.endPaint, true)
        canvas.addEventListener('pointercancel', this.cancelPaint, true)
        canvas.addEventListener('lostpointercapture', this.cancelPaint, true)
        canvas.setAttribute('aria-label', '模型表面上色畫布')
        this.updatePaintControls()

        this.partsGroup = markRaw(new THREE.Group())
        this.scene.add(this.partsGroup)
        this.resizeObserver = markRaw(new ResizeObserver(() => this.handleResize()))
        this.resizeObserver.observe(host)
        this.handleResize()
        this.scheduleRender()
      },
      scheduleRender() {
        if (this.viewerDisposed || this.renderHandle) return
        this.renderHandle = requestAnimationFrame(() => {
          this.renderHandle = 0
          if (!this.viewerDisposed && this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera)
            // Actual renderer counters support diagnostics without exposing model buffers.
            this.renderer.domElement.dataset.renderedTriangles = String(this.renderer.info.render.triangles)
            this.renderer.domElement.dataset.renderCount = String(Number(this.renderer.domElement.dataset.renderCount || 0) + 1)
          }
        })
      },
      handleResize() {
        const host = this.$refs.canvasHost
        if (!host || !this.renderer || !this.camera) return
        const width = Math.round(host.clientWidth)
        const renderHeight = Math.round(this.height)
        if (width <= 0 || renderHeight <= 0) return
        if (width === this.lastRenderWidth && renderHeight === this.lastRenderHeight) return
        this.lastRenderWidth = width
        this.lastRenderHeight = renderHeight
        this.camera.aspect = width / renderHeight
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(width, renderHeight)
        this.scheduleRender()
      },
      meshList() {
        const meshes = []
        this.partsGroup?.traverse((child) => {
          if (child.isMesh) meshes.push(child)
        })
        return meshes
      },
      disposeMeshes() {
        if (!this.partsGroup) return
        this.partsGroup.traverse((child) => {
          if (!child.isMesh) return
          child.geometry?.dispose()
          const materials = Array.isArray(child.material) ? child.material : [child.material]
          materials.forEach((material) => material?.dispose())
        })
        this.partsGroup.clear()
      },
      cancelModelWorker(reason = '模型解析已由新工作取代') {
        const rejectPending = this.workerReject
        this.workerReject = null
        this.modelWorker?.terminate()
        this.modelWorker = null
        rejectPending?.(new Error(reason))
      },
      parseStlInWorker(buffer, id) {
        this.cancelModelWorker()
        const modelWorker = markRaw(new Worker(new URL('../workers/model-preview.worker.js', import.meta.url), { type: 'module' }))
        this.modelWorker = modelWorker
        return new Promise((resolve, reject) => {
          this.workerReject = reject
          modelWorker.onmessage = ({ data }) => {
            if (data.id !== id) return
            if (data.error) reject(new Error(data.error))
            else {
              this.paintTopology = data.topology
              resolve(data.parts)
            }
          }
          modelWorker.onerror = (event) => reject(new Error(event.message || '模型背景解析失敗'))
          modelWorker.postMessage({ id, buffer, painting: this.paintEnabled }, [buffer])
        }).finally(() => {
          modelWorker.terminate()
          if (this.modelWorker === modelWorker) {
            this.workerReject = null
            this.modelWorker = null
          }
        })
      },
      async loadModel() {
        if (!this.renderer || !this.partsGroup) return
        this.finishPaint(true)
        this.paintTopology = null
        this.paintFaceLookup = new Map()
        this.loadSequence += 1
        const loadId = this.loadSequence
        const source = this.file || this.arrayBuffer
        this.cancelModelWorker()
        if (!source) {
          this.disposeMeshes()
          this.scheduleRender()
          return
        }

        this.loading = true
        this.errorMessage = ''
        try {
          // Yield once so the loading state paints before reading/parsing a large file.
          await new Promise((resolve) => requestAnimationFrame(resolve))
          if (loadId !== this.loadSequence || this.viewerDisposed) return
          const extension = (this.filename.split('.').pop() || '').toLowerCase()
          if (extension !== 'stl' && extension !== '3mf') throw new Error('此格式需要由專員轉檔後預覽')
          const buffer = this.file ? await this.file.arrayBuffer() : this.arrayBuffer.slice(0)
          if (loadId !== this.loadSequence || this.viewerDisposed) return
          this.disposeMeshes()
          if (extension === 'stl') {
            const parts = await this.parseStlInWorker(buffer, loadId)
            if (loadId !== this.loadSequence || this.viewerDisposed) return
            this.loadWorkerParts(parts)
          } else {
            this.loadThreeMf(buffer)
          }
          if (loadId !== this.loadSequence || this.viewerDisposed) return
          this.frameCamera()
          this.applyColors(this.partColors)
          this.applyHeightColors()
          this.applySurfacePaint()
          this.scheduleRender()
        } catch (error) {
          if (loadId !== this.loadSequence || this.viewerDisposed) return
          this.errorMessage = '無法解析此模型檔案，可能格式不受支援或檔案損壞。'
          this.$emit('error', error?.message || String(error))
        } finally {
          if (loadId === this.loadSequence && !this.viewerDisposed) this.loading = false
        }
      },
      loadWorkerParts(workerParts) {
        const parts = workerParts.map((part, index) => {
          const geometry = new THREE.BufferGeometry()
          geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3))
          geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3))
          geometry.computeBoundingBox()
          geometry.computeBoundingSphere()
          const material = new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE[index % DEFAULT_PALETTE.length], roughness: 0.6 })
          const mesh = new THREE.Mesh(geometry, material)
          mesh.userData.faceIds = part.faceIds
          if (part.faceIds) part.faceIds.forEach((face, local) => this.paintFaceLookup.set(face, { mesh, local }))
          this.partsGroup.add(mesh)
          return { index, color: material.color.getHexString() }
        })
        if (!parts.length) throw new Error('STL file has no mesh content')
        this.$emit('parts', parts)
      },
      loadThreeMf(buffer) {
        const group = new ThreeMFLoader().parse(buffer)
        const meshes = []
        group.traverse((child) => {
          if (!child.isMesh) return
          const existingColor = child.material?.color
            ? child.material.color.clone()
            : new THREE.Color(DEFAULT_PALETTE[meshes.length % DEFAULT_PALETTE.length])
          const oldMaterials = Array.isArray(child.material) ? child.material : [child.material]
          oldMaterials.forEach((material) => material?.dispose())
          child.material = new THREE.MeshStandardMaterial({ color: existingColor, roughness: 0.6 })
          meshes.push(child)
        })
        if (!meshes.length) throw new Error('3MF file has no mesh content')
        // Keep the 3MF hierarchy so nested build transforms are not lost.
        this.partsGroup.add(group)
        this.$emit(
          'parts',
          meshes.map((mesh, index) => ({ index, color: mesh.material.color.getHexString() }))
        )
      },
      applyColors(colors) {
        if (!colors?.length || !this.partsGroup) return
        this.meshList().forEach((mesh, index) => {
          const hex = colors[index] || (colors.length === 1 ? colors[0] : '')
          if (hex && mesh.material?.color) mesh.material.color.set(hex)
        })
        this.scheduleRender()
      },
      applyHeightColors() {
        // Fixed-size uniforms avoid compiling a new shader for every input edit.
        const bands = this.heightColors
          .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.to) && b.to > b.from && /^#[0-9a-f]{6}$/i.test(b.color))
          .slice(0, 8)
        for (const mesh of this.meshList()) {
          const material = mesh.material
          if (!material.userData.heightUniforms && !bands.length && !this.paintEnabled) continue
          if (!material.userData.heightUniforms) {
            mesh.geometry.setAttribute(
              'quotePaintSlot',
              new THREE.BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count), 1)
            )
            const uniforms = {
              quoteBandCount: { value: 0 },
              quoteBandRanges: { value: Array.from({ length: 8 }, () => new THREE.Vector2()) },
              quoteBandColors: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
              quotePaintColors: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
            }
            material.userData.heightUniforms = uniforms
            material.onBeforeCompile = (shader) => {
              Object.assign(shader.uniforms, uniforms)
              shader.vertexShader =
                'varying float quoteLocalZ;\nattribute float quotePaintSlot;\nvarying float quoteFaceSlot;\n' +
                shader.vertexShader.replace(
                  '#include <begin_vertex>',
                  '#include <begin_vertex>\nquoteLocalZ = position.z;\nquoteFaceSlot = quotePaintSlot;'
                )
              shader.fragmentShader =
                'varying float quoteLocalZ;\nvarying float quoteFaceSlot;\nuniform vec3 quotePaintColors[8];\nuniform int quoteBandCount;\nuniform vec2 quoteBandRanges[8];\nuniform vec3 quoteBandColors[8];\n' +
                shader.fragmentShader.replace(
                  '#include <color_fragment>',
                  '#include <color_fragment>\nfor (int i = 0; i < 8; i++) { if (i < quoteBandCount && quoteLocalZ >= quoteBandRanges[i].x - 0.0001 && quoteLocalZ <= quoteBandRanges[i].y + 0.0001) diffuseColor.rgb = quoteBandColors[i]; }\nfor (int i = 0; i < 8; i++) { if (abs(quoteFaceSlot - float(i + 1)) < 0.1) diffuseColor.rgb = quotePaintColors[i]; }'
                )
            }
            material.customProgramCacheKey = () => '3drfm-surface-color-preview-v2'
            material.needsUpdate = true
          }
          const uniforms = material.userData.heightUniforms
          this.paintPalette.slice(0, 8).forEach((slot, i) => {
            if (/^#[0-9a-f]{6}$/i.test(slot.hex)) uniforms.quotePaintColors.value[i].set(slot.hex)
          })
          uniforms.quoteBandCount.value = bands.length
          bands.forEach((band, i) => {
            uniforms.quoteBandRanges.value[i].set(band.from, band.to)
            uniforms.quoteBandColors.value[i].set(band.color)
          })
        }
        this.scheduleRender()
      },
      updatePaintControls() {
        if (this.controls) this.controls.enabled = !this.paintEnabled || this.paintTool === 'orbit'
        if (this.renderer) this.renderer.domElement.style.cursor = this.paintEnabled && this.paintTool !== 'orbit' ? 'crosshair' : 'grab'
      },
      setFaceSlot(face, slotId) {
        const entry = this.paintFaceLookup?.get(face)
        const attr = entry?.mesh.geometry.getAttribute('quotePaintSlot')
        if (!attr) return
        const value = slotId ? this.paintPalette.findIndex((s) => s.id === slotId) + 1 : 0
        attr.array.fill(value, entry.local * 3, entry.local * 3 + 3)
        attr.needsUpdate = true
      },
      applySurfacePaint() {
        for (const mesh of this.meshList()) {
          const attr = mesh.geometry.getAttribute('quotePaintSlot')
          if (attr) {
            attr.array.fill(0)
            attr.needsUpdate = true
          }
        }
        if (this.paintEnabled) for (const [face, slot] of Object.entries(this.surfacePaint)) this.setFaceSlot(Number(face), slot)
        this.scheduleRender()
      },
      beginPaint(event) {
        if (
          !this.paintEnabled ||
          this.paintTool === 'orbit' ||
          this.loading ||
          !this.paintTopology ||
          event.button !== 0 ||
          this.paintStroke
        )
          return
        event.preventDefault()
        event.stopImmediatePropagation()
        this.paintStroke = new Map()
        this.paintPointer = event.pointerId
        this.renderer.domElement.setPointerCapture(event.pointerId)
        this.samplePaint(event.clientX, event.clientY)
      },
      movePaint(event) {
        if (!this.paintStroke || event.pointerId !== this.paintPointer) return
        event.preventDefault()
        event.stopImmediatePropagation()
        this.paintPoint = [event.clientX, event.clientY]
        if (!this.paintFrame)
          this.paintFrame = requestAnimationFrame(() => {
            this.paintFrame = 0
            if (this.paintStroke && this.paintPoint) this.samplePaint(...this.paintPoint)
          })
      },
      samplePaint(x, y) {
        if (!this.paintStroke || !this.paintTopology) return
        const rect = this.renderer.domElement.getBoundingClientRect()
        if (x < rect.left || y < rect.top || x > rect.right || y > rect.bottom) return
        const ray = new THREE.Raycaster()
        ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, (-(y - rect.top) / rect.height) * 2 + 1), this.camera)
        const hit = ray.intersectObjects(this.meshList(), false)[0]
        if (!hit || !hit.object.userData.faceIds) return
        const face = hit.object.userData.faceIds[hit.faceIndex],
          point = hit.object.worldToLocal(hit.point.clone())
        const after = this.paintTool === 'erase' ? null : this.paintSlotId
        if (after && !this.paintPalette.some((s) => s.id === after)) return
        const faces = selectPaintFaces(this.paintTopology, face, point, this.brushRadius, this.paintTool === 'fill')
        for (const id of faces) {
          const before = this.surfacePaint[id] || null
          if (!this.paintStroke.has(id)) this.paintStroke.set(id, { face: id, before, after })
          else this.paintStroke.get(id).after = after
          this.setFaceSlot(id, after)
        }
        this.scheduleRender()
      },
      endPaint(event) {
        if (!this.paintStroke || event.pointerId !== this.paintPointer) return
        event.preventDefault()
        event.stopImmediatePropagation()
        this.samplePaint(event.clientX, event.clientY)
        this.finishPaint(false)
      },
      cancelPaint() {
        this.finishPaint(true)
      },
      finishPaint(cancel) {
        if (!this.paintStroke) return
        if (this.paintFrame) cancelAnimationFrame(this.paintFrame)
        this.paintFrame = 0
        this.paintPoint = null
        const changes = [...this.paintStroke.values()].filter((c) => c.before !== c.after)
        const pointer = this.paintPointer
        this.paintStroke = null
        if (this.renderer?.domElement.hasPointerCapture(pointer)) this.renderer.domElement.releasePointerCapture(pointer)
        if (cancel) this.applySurfacePaint()
        else if (changes.length) this.$emit('paint', changes)
      },
      frameCamera() {
        const box = new THREE.Box3().setFromObject(this.partsGroup)
        if (box.isEmpty()) throw new Error('模型沒有可顯示的邊界')
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const distance = maxDim * 1.8
        this.camera.near = Math.max(maxDim / 10000, 0.001)
        this.camera.far = Math.max(distance * 10, this.camera.near * 1000)
        this.camera.updateProjectionMatrix()
        this.camera.position.set(center.x + distance, center.y + distance * 0.7, center.z + distance)
        this.camera.lookAt(center)
        this.controls.target.copy(center)
        this.controls.update()
        this.$emit('loaded', { dimensions: [size.x, size.y, size.z] })
      },
    },
  }
</script>

<style lang="scss" scoped>
  .paint-status {
    margin: 0;
    padding: 10px 12px;
    font-size: 12px;
    background: #eef3eb;
    color: #315644;
  }
  .model-viewer {
    position: relative;
    width: 100%;
    border: 1px solid $base-border-color;
    border-radius: 4px;
    overflow: hidden;

    .model-viewer-canvas {
      width: 100%;
    }

    .model-viewer-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(244, 246, 248, 0.85);
      font-size: 13px;
      color: $base-color-gray;

      &.error {
        color: $base-color-red;
      }
    }
  }
</style>
