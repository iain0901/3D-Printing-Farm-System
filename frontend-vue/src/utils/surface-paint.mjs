export const MAX_PAINT_FACES = 200000
export const MAX_HISTORY_FACES = 200000

// Exact shared-edge topology: disconnected shells and opposite surfaces stay separate.
export function buildPaintTopology(positions) {
  const count = positions.length / 9
  if (!Number.isInteger(count) || count < 1 || count > MAX_PAINT_FACES) throw new Error('上色模型最多 20 萬個三角面。')
  const neighbors = new Int32Array(count * 3).fill(-1),
    centers = new Float32Array(count * 3),
    normals = new Float32Array(count * 3)
  const edges = new Map()
  for (let face = 0; face < count; face++) {
    const p = face * 9,
      n = face * 3
    const keys = [0, 3, 6].map((o) => `${positions[p + o]},${positions[p + o + 1]},${positions[p + o + 2]}`)
    for (let axis = 0; axis < 3; axis++) centers[n + axis] = (positions[p + axis] + positions[p + 3 + axis] + positions[p + 6 + axis]) / 3
    const ax = positions[p + 3] - positions[p],
      ay = positions[p + 4] - positions[p + 1],
      az = positions[p + 5] - positions[p + 2]
    const bx = positions[p + 6] - positions[p],
      by = positions[p + 7] - positions[p + 1],
      bz = positions[p + 8] - positions[p + 2]
    const nx = ay * bz - az * by,
      ny = az * bx - ax * bz,
      nz = ax * by - ay * bx,
      length = Math.hypot(nx, ny, nz) || 1
    normals.set([nx / length, ny / length, nz / length], n)
    for (let edge = 0; edge < 3; edge++) {
      const a = keys[edge],
        b = keys[(edge + 1) % 3],
        key = a < b ? `${a}|${b}` : `${b}|${a}`
      if (!edges.has(key)) edges.set(key, [n + edge])
      else edges.get(key).push(n + edge)
    }
  }
  for (const entries of edges.values())
    if (entries.length === 2) {
      neighbors[entries[0]] = Math.floor(entries[1] / 3)
      neighbors[entries[1]] = Math.floor(entries[0] / 3)
    }
  return { count, neighbors, centers, normals }
}

export function selectPaintFaces(topology, seed, point, radius, fill = false) {
  if (!topology || !Number.isInteger(seed) || seed < 0 || seed >= topology.count || !Number.isFinite(radius) || radius <= 0) return []
  const { neighbors, centers, normals, count } = topology
  const seen = new Uint8Array(count),
    queue = [seed],
    result = [],
    origin = seed * 3
  seen[seed] = 1
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const face = queue[cursor],
      n = face * 3
    const dot = normals[n] * normals[origin] + normals[n + 1] * normals[origin + 1] + normals[n + 2] * normals[origin + 2]
    if (
      face !== seed &&
      (dot < Math.cos(Math.PI / 6) ||
        (!fill && Math.hypot(centers[n] - point.x, centers[n + 1] - point.y, centers[n + 2] - point.z) > radius))
    )
      continue
    result.push(face)
    for (let edge = 0; edge < 3; edge++) {
      const adjacent = neighbors[n + edge]
      if (adjacent >= 0 && !seen[adjacent]) {
        seen[adjacent] = 1
        queue.push(adjacent)
      }
    }
  }
  return result
}

export function applyPaintChanges(faces, changes, reverse = false) {
  const next = { ...faces }
  for (const change of changes) {
    const value = reverse ? change.before : change.after
    if (value) next[change.face] = value
    else delete next[change.face]
  }
  return next
}
export function appendPaintHistory(history, changes) {
  const result = [...history, changes]
  let size = result.reduce((sum, item) => sum + item.length, 0)
  while (result.length > 1 && (result.length > 30 || size > MAX_HISTORY_FACES)) size -= result.shift().length
  return result
}
export function validateSurfacePaint(faces, model, slots) {
  const entries = Object.entries(faces || {})
  if (!entries.length) return ''
  if (!Number.isInteger(model.triangleCount) || model.triangleCount > MAX_PAINT_FACES || !/^[a-f0-9]{64}$/.test(model.geometryHash || ''))
    return '上色模型尚未完成幾何驗證。'
  if (
    entries.length > model.triangleCount ||
    entries.some(([face, slot]) => !/^(0|[1-9]\d*)$/.test(face) || Number(face) >= model.triangleCount || !slots.some((s) => s.id === slot))
  )
    return '上色資料包含無效三角面或色槽。'
  return ''
}
