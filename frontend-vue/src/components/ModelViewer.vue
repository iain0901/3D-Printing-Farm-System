<template>
  <div class="model-viewer">
    <div ref="canvasHost" class="model-viewer-canvas" :style="{ height: height + 'px' }" />
    <div v-if="loading" class="model-viewer-overlay">
      <el-icon><Loading /></el-icon> 載入模型中…
    </div>
    <div v-else-if="errorMessage" class="model-viewer-overlay error">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script>
  import * as THREE from 'three'
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
  import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
  import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'

  // 跟常見耗材色卡對齊的預設調色盤，偵測到多零件但使用者還沒指定顏色時，依序套用讓畫面上就能分辨零件
  const DEFAULT_PALETTE = ['#f5f5f0', '#1c1c1c', '#d64545', '#3b6fd6', '#3f9142', '#e0b400', '#e07b28', '#8752c9']
  // 跟後端 api/model-metadata.mjs 的 MAX_TRIANGLES_FOR_SHELL_DETECTION 對齊，超過就不切殼，整個檔案當一個零件顯示
  const MAX_TRIANGLES_FOR_SHELL_SPLIT = 200000

  function detectShellsFromPositions(positions) {
    const triangleCount = positions.length / 9
    if (!triangleCount || triangleCount > MAX_TRIANGLES_FOR_SHELL_SPLIT) return null
    const parent = new Map()
    const find = (key) => {
      let root = key
      while (parent.get(root) !== root) root = parent.get(root)
      let current = key
      while (parent.get(current) !== root) {
        const next = parent.get(current)
        parent.set(current, root)
        current = next
      }
      return root
    }
    const union = (a, b) => {
      const rootA = find(a)
      const rootB = find(b)
      if (rootA !== rootB) parent.set(rootA, rootB)
    }
    const vertexKey = (x, y, z) => `${Math.round(x * 1e4)}|${Math.round(y * 1e4)}|${Math.round(z * 1e4)}`

    const keys = new Array(triangleCount * 3)
    for (let t = 0; t < triangleCount; t += 1) {
      const base = t * 9
      for (let v = 0; v < 3; v += 1) {
        const o = base + v * 3
        const key = vertexKey(positions[o], positions[o + 1], positions[o + 2])
        keys[t * 3 + v] = key
        if (!parent.has(key)) parent.set(key, key)
      }
      union(keys[t * 3], keys[t * 3 + 1])
      union(keys[t * 3 + 1], keys[t * 3 + 2])
    }

    const trianglesByRoot = new Map()
    for (let t = 0; t < triangleCount; t += 1) {
      const root = find(keys[t * 3])
      if (!trianglesByRoot.has(root)) trianglesByRoot.set(root, [])
      trianglesByRoot.get(root).push(t)
    }
    return Array.from(trianglesByRoot.values())
  }

  function subGeometryFromTriangles(positions, triangleIndices) {
    const sub = new Float32Array(triangleIndices.length * 9)
    triangleIndices.forEach((triangleIndex, i) => {
      sub.set(positions.subarray(triangleIndex * 9, triangleIndex * 9 + 9), i * 9)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(sub, 3))
    geometry.computeVertexNormals()
    return geometry
  }

  export default {
    name: 'ModelViewer',
    props: {
      file: { type: File, default: null },
      arrayBuffer: { type: ArrayBuffer, default: null },
      filename: { type: String, required: true },
      height: { type: Number, default: 320 },
      partColors: { type: Array, default: () => [] },
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
      arrayBuffer() {
        this.loadModel()
      },
      partColors: {
        deep: true,
        handler(colors) {
          this.applyColors(colors)
        },
      },
    },
    mounted() {
      this.initScene()
      this.loadModel()
      window.addEventListener('resize', this.handleResize)
    },
    beforeUnmount() {
      window.removeEventListener('resize', this.handleResize)
      cancelAnimationFrame(this.frameHandle)
      this.disposeMeshes()
      this.renderer?.dispose()
      this.controls?.dispose()
    },
    methods: {
      initScene() {
        const host = this.$refs.canvasHost
        this.scene = new THREE.Scene()
        this.scene.background = new THREE.Color(0xf4f6f8)
        this.camera = new THREE.PerspectiveCamera(45, host.clientWidth / this.height, 0.1, 5000)
        this.renderer = new THREE.WebGLRenderer({ antialias: true })
        this.renderer.setPixelRatio(window.devicePixelRatio || 1)
        this.renderer.setSize(host.clientWidth, this.height)
        host.appendChild(this.renderer.domElement)

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6))
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
        dirLight.position.set(1, 1.5, 1)
        this.scene.add(dirLight)
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.35)
        dirLight2.position.set(-1, -0.5, -1)
        this.scene.add(dirLight2)

        this.controls = new OrbitControls(this.camera, this.renderer.domElement)
        this.controls.enableDamping = true

        this.partsGroup = new THREE.Group()
        this.scene.add(this.partsGroup)

        const animate = () => {
          this.frameHandle = requestAnimationFrame(animate)
          this.controls.update()
          this.renderer.render(this.scene, this.camera)
        }
        animate()
      },
      handleResize() {
        const host = this.$refs.canvasHost
        if (!host || !this.renderer) return
        this.camera.aspect = host.clientWidth / this.height
        this.camera.updateProjectionMatrix()
        this.renderer.setSize(host.clientWidth, this.height)
      },
      disposeMeshes() {
        if (!this.partsGroup) return
        this.partsGroup.children.slice().forEach((mesh) => {
          mesh.geometry?.dispose()
          mesh.material?.dispose()
          this.partsGroup.remove(mesh)
        })
      },
      async loadModel() {
        const source = this.file || this.arrayBuffer
        if (!source) return
        this.loading = true
        this.errorMessage = ''
        try {
          const buffer = this.file ? await this.file.arrayBuffer() : this.arrayBuffer
          const extension = (this.filename.split('.').pop() || '').toLowerCase()
          this.disposeMeshes()
          if (extension === '3mf') {
            this.loadThreeMf(buffer)
          } else {
            this.loadStl(buffer)
          }
          this.frameCamera()
          this.applyColors(this.partColors)
        } catch (err) {
          this.errorMessage = '無法解析此模型檔案，可能格式不受支援或檔案損壞。'
          this.$emit('error', err?.message || String(err))
        } finally {
          this.loading = false
        }
      },
      loadStl(buffer) {
        const geometry = new STLLoader().parse(buffer)
        const positions = geometry.attributes.position.array
        const shells = detectShellsFromPositions(positions)
        const parts = []
        if (shells && shells.length > 1) {
          shells.forEach((triangleIndices, index) => {
            const subGeometry = subGeometryFromTriangles(positions, triangleIndices)
            const material = new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE[index % DEFAULT_PALETTE.length], roughness: 0.6 })
            const mesh = new THREE.Mesh(subGeometry, material)
            this.partsGroup.add(mesh)
            parts.push({ index, color: material.color.getHexString() })
          })
        } else {
          geometry.computeVertexNormals()
          const material = new THREE.MeshStandardMaterial({ color: DEFAULT_PALETTE[0], roughness: 0.6 })
          const mesh = new THREE.Mesh(geometry, material)
          this.partsGroup.add(mesh)
          parts.push({ index: 0, color: material.color.getHexString() })
        }
        this.$emit('parts', parts)
      },
      loadThreeMf(buffer) {
        const group = new ThreeMFLoader().parse(buffer)
        const meshes = []
        group.traverse((child) => {
          if (child.isMesh) meshes.push(child)
        })
        const parts = []
        meshes.forEach((mesh, index) => {
          const existingColor = mesh.material?.color ? mesh.material.color.clone() : new THREE.Color(DEFAULT_PALETTE[index % DEFAULT_PALETTE.length])
          const material = new THREE.MeshStandardMaterial({ color: existingColor, roughness: 0.6 })
          mesh.material = material
          this.partsGroup.add(mesh)
          parts.push({ index, color: material.color.getHexString() })
        })
        if (!meshes.length) throw new Error('3MF file has no mesh content')
        this.$emit('parts', parts)
      },
      applyColors(colors) {
        if (!colors || !colors.length || !this.partsGroup) return
        this.partsGroup.children.forEach((mesh, index) => {
          const hex = colors[index]
          if (hex && mesh.material) mesh.material.color.set(hex)
        })
      },
      frameCamera() {
        const box = new THREE.Box3().setFromObject(this.partsGroup)
        if (box.isEmpty()) return
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const distance = maxDim * 1.8
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
