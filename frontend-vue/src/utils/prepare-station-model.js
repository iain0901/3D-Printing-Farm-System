import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { Euler, Matrix4, Mesh } from 'three'

// The preview and upload both consume this same transformed STL, never separate transforms.
export function prepareStationModel(buffer, { scale = 100, x = 0, y = 0, z = 0, layFlat = false } = {}) {
  if (![scale, x, y, z].every(Number.isFinite) || scale < 1 || scale > 1000 || [x, y, z].some((v) => Math.abs(v) > 360))
    throw new Error('請輸入有效的縮放比例與角度')
  const geometry = new STLLoader().parse(buffer)
  try {
    const positions = geometry.getAttribute('position')
    if (!positions || positions.count < 3 || positions.count > 600000) throw new Error('模型內容為空或過於複雜，請先簡化模型')
    for (const value of positions.array) if (!Number.isFinite(value)) throw new Error('模型含有無效座標')
    geometry.center()
    geometry.scale(scale / 100, scale / 100, scale / 100)
    geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180)))
    geometry.computeBoundingBox()
    if (layFlat) {
      const box = geometry.boundingBox
      const size = [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z]
      const axis = size.indexOf(Math.min(...size))
      if (axis === 0) geometry.rotateY(Math.PI / 2)
      if (axis === 1) geometry.rotateX(Math.PI / 2)
      geometry.computeBoundingBox()
    }
    const { min, max } = geometry.boundingBox
    const dimensions = [max.x - min.x, max.y - min.y, max.z - min.z]
    if (dimensions.some((v) => v <= 0 || v > 1000)) throw new Error('模型需有立體尺寸，且各邊不得超過 1,000 mm；請確認單位或縮放')
    geometry.translate(-(min.x + max.x) / 2, -(min.y + max.y) / 2, -min.z)
    geometry.computeVertexNormals()
    const result = new STLExporter().parse(new Mesh(geometry), { binary: true })
    return { buffer: result.buffer, dimensions }
  } finally {
    geometry.dispose()
  }
}
