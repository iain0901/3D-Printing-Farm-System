<template><div ref="host" class="bracket-canvas" role="img" :aria-label="`展示支架三維參考，角度 ${angle} 度`"><span v-if="failed">3D 顯示不可用；照片仍可檢視。</span></div></template>
<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import * as THREE from 'three'
const props = defineProps({ angle: { type: Number, default: 0 }, variant: { type: String, default: 'clear' } })
const host = ref(null), failed = ref(false)
let renderer, scene, camera, group, observer
function render() { if (group) group.rotation.y = props.angle * Math.PI / 180; renderer?.render(scene, camera) }
onMounted(() => {
  try {
    scene = new THREE.Scene(); scene.background = new THREE.Color('#edf0ef')
    camera = new THREE.PerspectiveCamera(38, 1, 0.1, 1000); camera.position.set(105, 90, 120); camera.lookAt(0, 22, 0)
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); host.value.appendChild(renderer.domElement)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x52656c, 2.2)); const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(40, 100, 80); scene.add(light)
    group = new THREE.Group(); scene.add(group)
    const material = new THREE.MeshStandardMaterial({ color: '#417e80', roughness: .65, metalness: .05 })
    const shape = new THREE.Shape(); shape.moveTo(-22, 0); shape.lineTo(22, 0); shape.lineTo(22, 55); shape.lineTo(-22, 55); shape.closePath()
    for (const y of props.variant === 'defect' ? [38] : [18, 41]) { const hole = new THREE.Path(); hole.absarc(0, y, 5, 0, Math.PI * 2, true); shape.holes.push(hole) }
    const upright = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 5, bevelEnabled: false, curveSegments: 32 }), material); upright.position.z = -20; group.add(upright)
    const foot = new THREE.Shape(); foot.moveTo(-22, -23); foot.lineTo(22, -23); foot.lineTo(22, 23); foot.lineTo(-22, 23); foot.closePath()
    if (props.variant === 'defect') { const hole = new THREE.Path(); hole.absarc(0, -10, 5, 0, Math.PI * 2, true); foot.holes.push(hole) }
    const base = new THREE.Mesh(new THREE.ExtrudeGeometry(foot, { depth: 5, bevelEnabled: false, curveSegments: 32 }), material); base.rotation.x = -Math.PI / 2; group.add(base)
    const grid = new THREE.GridHelper(140, 14, 0xb2c0c0, 0xd9e0de); grid.position.y = -.2; scene.add(grid)
    observer = new ResizeObserver(() => { const width = host.value.clientWidth, height = host.value.clientHeight; if (!width || !height) return; renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); render() }); observer.observe(host.value); render()
  } catch { failed.value = true }
})
watch(() => props.angle, render)
onBeforeUnmount(() => { observer?.disconnect(); scene?.traverse(o => { o.geometry?.dispose(); if (o.material) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose() } }); renderer?.dispose(); renderer?.forceContextLoss() })
</script>
<style scoped>.bracket-canvas { height: 100%; min-height: 220px; overflow: hidden; } .bracket-canvas :deep(canvas) { display: block; }</style>
