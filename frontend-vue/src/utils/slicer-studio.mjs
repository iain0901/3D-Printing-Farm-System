import { Euler, Quaternion, Vector3 } from 'three'

export const studioTools = [
  { id: 'select', label: '選取', key: 'Q', glyph: '↖' },
  { id: 'translate', label: '移動', key: 'W', glyph: '✥' },
  { id: 'rotate', label: '旋轉', key: 'E', glyph: '⤾' },
  { id: 'scale', label: '縮放', key: 'R', glyph: '⤢' },
  { id: 'lay', label: '按面放平', key: 'F', glyph: '▱' },
]
export function quaternionTransform(quaternion) {
  const q = new Quaternion(...quaternion).normalize(),
    e = new Euler().setFromQuaternion(q, 'XYZ')
  return { x: (e.x * 180) / Math.PI, y: (e.y * 180) / Math.PI, z: (e.z * 180) / Math.PI, layFlat: false }
}
export function alignFaceTransform(normal, effectiveQuaternion) {
  const n = new Vector3(...normal).normalize()
  if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) throw new Error('無法辨識這個模型表面')
  const delta = new Quaternion().setFromUnitVectors(n, new Vector3(0, 0, -1))
  return quaternionTransform(delta.multiply(new Quaternion(...effectiveQuaternion)))
}
export function studioSnapshot(items) {
  return items.map((i) => ({
    id: i.id,
    source: i.source,
    name: i.name,
    transform: { ...i.transform },
    position: { ...i.position },
    hidden: !!i.hidden,
    cloneOf: i.cloneOf || null,
  }))
}
export function snapshotKey(snapshot) {
  return JSON.stringify(snapshot.map(({ source, ...i }) => i))
}
export function modelFits(model) {
  if (!model.dimensions) return true
  const [w, d, h] = model.dimensions,
    p = model.position
  return p.x - w / 2 >= 5 && p.x + w / 2 <= 255 && p.y - d / 2 >= 5 && p.y + d / 2 <= 255 && h <= 260
}
