import * as THREE from 'three'

// A lit rectangular extrusion, not a screen-space line. Z is the top of each
// deposited layer; never invent geometry to bridge missing/sampled moves.
export function extrusionGeometry(segments, palette) {
  const positions = new Float32Array(segments.length * 108)
  const colors = new Float32Array(positions.length)
  const faces = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  segments.forEach((s, index) => {
    const [ax, ay, az] = s.from,
      [bx, by, bz] = s.to
    const length = Math.hypot(bx - ax, by - ay) || 1
    const width = s.width || 0.42,
      height = s.height || 0.2
    const dx = ((-(by - ay) / length) * width) / 2,
      dy = (((bx - ax) / length) * width) / 2
    const vertices = [
      [ax + dx, ay + dy, az - height],
      [ax - dx, ay - dy, az - height],
      [bx - dx, by - dy, bz - height],
      [bx + dx, by + dy, bz - height],
      [ax + dx, ay + dy, az],
      [ax - dx, ay - dy, az],
      [bx - dx, by - dy, bz],
      [bx + dx, by + dy, bz],
    ]
    const color = new THREE.Color(palette[s.role] || palette.other)
    faces.forEach((v, i) => {
      positions.set(vertices[v], index * 108 + i * 3)
      colors.set([color.r, color.g, color.b], index * 108 + i * 3)
    })
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function previewBounds(preview) {
  if (preview.objectBounds)
    return new THREE.Box3(new THREE.Vector3(...preview.objectBounds.min), new THREE.Vector3(...preview.objectBounds.max))
  // Backward compatible with results generated before objectBounds existed.
  const body = new THREE.Box3(),
    extrusion = new THREE.Box3()
  for (const layer of preview.layers)
    for (const s of layer.segments) {
      if (s.role === 'travel') continue
      for (const p of [s.from, s.to]) {
        extrusion.expandByPoint(new THREE.Vector3(...p))
        if (['outer', 'inner', 'solid', 'infill'].includes(s.role)) body.expandByPoint(new THREE.Vector3(...p))
      }
    }
  return body.isEmpty() ? extrusion : body
}

export function fitPreviewCamera(camera, controls, bounds) {
  if (bounds.isEmpty()) return
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  // Fit a bounding sphere in the narrower FOV, with room around the model.
  const halfFov = Math.min(
    THREE.MathUtils.degToRad(camera.fov) / 2,
    Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect)
  )
  const distance = (Math.max(2, size.length() / 2) / Math.sin(halfFov)) * 1.12
  controls.target.copy(center)
  camera.position.copy(center).add(new THREE.Vector3(1, -1, 0.85).normalize().multiplyScalar(distance))
  camera.near = Math.max(0.01, distance / 1000)
  camera.far = Math.max(5000, distance * 10)
  camera.updateProjectionMatrix()
  controls.update()
}
