export const BED = { width: 260, depth: 260, margin: 5, gap: 2 }

export function arrangeModels(dimensions) {
  const ordered = dimensions.map((size, index) => ({ size, index })).sort((a, b) => b.size[1] - a.size[1])
  let x = 5,
    y = 5,
    row = 0
  const positions = []
  for (const {
    size: [width, depth, height],
    index,
  } of ordered) {
    if (width > 250 || depth > 250 || height > 260) throw new Error('模型超出參考平台尺寸，請先縮小或調整方向。')
    if (x + width > 255) {
      x = 5
      y += row + 2
      row = 0
    }
    if (y + depth > 255) throw new Error('目前無法全部排入單一平台，請減少模型或縮小尺寸。')
    positions[index] = { x: x + width / 2, y: y + depth / 2 }
    x += width + 2
    row = Math.max(row, depth)
  }
  const maxX = Math.max(...positions.map((p, i) => p.x + dimensions[i][0] / 2))
  const maxY = Math.max(...positions.map((p, i) => p.y + dimensions[i][1] / 2))
  return positions.map((p) => ({ x: p.x + (255 - maxX) / 2, y: p.y + (255 - maxY) / 2 }))
}

export function layoutWarning(items) {
  if (items.some((i) => !i.dimensions)) return ''
  const boxes = items.map((i) => ({
    x1: i.position.x - i.dimensions[0] / 2,
    x2: i.position.x + i.dimensions[0] / 2,
    y1: i.position.y - i.dimensions[1] / 2,
    y2: i.position.y + i.dimensions[1] / 2,
  }))
  if (items.some((i) => !Number.isFinite(i.position.x) || !Number.isFinite(i.position.y))) return '請輸入有效的平台位置。'
  if (boxes.some((b, i) => b.x1 < 4.99 || b.y1 < 4.99 || b.x2 > 255.01 || b.y2 > 255.01 || items[i].dimensions[2] > 260))
    return '模型超出平台安全邊界，請移回虛線範圍內。'
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i],
        b = boxes[j]
      if (a.x1 < b.x2 + 1.99 && a.x2 + 1.99 > b.x1 && a.y1 < b.y2 + 1.99 && a.y2 + 1.99 > b.y1)
        return '模型包圍框重疊或間距不足 2 mm，請移開或自動排版。'
    }
  return ''
}
