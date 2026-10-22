import * as THREE from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { buildPaintTopology } from '../utils/surface-paint.mjs'

// Shell analysis is useful for small multi-body STL files, but its vertex map is
// deliberately bounded. Large files still parse and render as one mesh.
const MAX_TRIANGLES_FOR_SHELL_SPLIT = 200000

function detectShells(positions) {
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

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const base = triangle * 9
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = base + vertex * 3
      const key = vertexKey(positions[offset], positions[offset + 1], positions[offset + 2])
      keys[triangle * 3 + vertex] = key
      if (!parent.has(key)) parent.set(key, key)
    }
    union(keys[triangle * 3], keys[triangle * 3 + 1])
    union(keys[triangle * 3 + 1], keys[triangle * 3 + 2])
  }

  const trianglesByRoot = new Map()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const root = find(keys[triangle * 3])
    if (!trianglesByRoot.has(root)) trianglesByRoot.set(root, [])
    trianglesByRoot.get(root).push(triangle)
  }
  return Array.from(trianglesByRoot.values())
}

function copyTriangles(source, triangleIndices) {
  const valuesPerTriangle = 9
  const copy = new Float32Array(triangleIndices.length * valuesPerTriangle)
  triangleIndices.forEach((triangleIndex, index) => {
    const sourceOffset = triangleIndex * valuesPerTriangle
    copy.set(source.subarray(sourceOffset, sourceOffset + valuesPerTriangle), index * valuesPerTriangle)
  })
  return copy
}

function parseStl(buffer, painting) {
  const geometry = new STLLoader().parse(buffer)
  const positions = geometry.getAttribute('position')?.array
  if (!positions?.length) throw new Error('STL file has no mesh content')

  let normals = geometry.getAttribute('normal')?.array
  if (!normals?.length) {
    geometry.computeVertexNormals()
    normals = geometry.getAttribute('normal')?.array
  }

  const shells = detectShells(positions)
  const parts =
    shells && shells.length > 1
      ? shells.map((triangles) => ({
          positions: copyTriangles(positions, triangles),
          normals: copyTriangles(normals, triangles),
          faceIds: painting ? Uint32Array.from(triangles) : null,
        }))
      : [
          {
            positions: new Float32Array(positions),
            normals: new Float32Array(normals),
            faceIds: painting ? Uint32Array.from({ length: positions.length / 9 }, (_, i) => i) : null,
          },
        ]

  const topology = painting ? buildPaintTopology(positions) : null
  geometry.dispose()
  return { parts, topology }
}

self.onmessage = ({ data: { id, buffer, painting } }) => {
  try {
    const { parts, topology } = parseStl(buffer, painting)
    const transferables = parts.flatMap((part) => [
      part.positions.buffer,
      part.normals.buffer,
      ...(part.faceIds ? [part.faceIds.buffer] : []),
    ])
    if (topology) transferables.push(topology.neighbors.buffer, topology.centers.buffer, topology.normals.buffer)
    self.postMessage({ id, parts, topology }, transferables)
  } catch (error) {
    self.postMessage({ id, error: error?.message || String(error) })
  }
}
