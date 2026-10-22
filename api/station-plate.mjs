import JSZip from "jszip";

export const STATION_BED = { width: 260, depth: 260, height: 260, margin: 5, gap: 2 };

export function readStationStl(buffer) {
  const count = buffer.length >= 84 ? buffer.readUInt32LE(80) : 0;
  if (!count || count > 200000 || buffer.length !== 84 + count * 50) throw new Error("請透過線上工作台重新處理 STL 模型");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const vertices = [];
  for (let i = 0; i < count; i++) for (let v = 0; v < 3; v++) {
    const xyz = [0, 1, 2].map(axis => buffer.readFloatLE(84 + i * 50 + 12 + v * 12 + axis * 4));
    if (xyz.some(value => !Number.isFinite(value))) throw new Error("模型含有無效座標");
    xyz.forEach((value, axis) => { min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value); });
    vertices.push(xyz);
  }
  return { vertices, min, max };
}

export function validateStationPlate(buffers, placements, autoArrange) {
  if (!autoArrange && (!placements || placements.length !== buffers.length)) throw new Error("每個模型都需要對應的平台位置");
  const meshes = buffers.map(readStationStl);
  const boxes = meshes.map((mesh, i) => {
    const size = mesh.max.map((value, axis) => value - mesh.min[axis]);
    if (size.some(value => value <= 0) || size[0] > 250 || size[1] > 250 || size[2] > 260) throw new Error("模型尺寸超出參考平台可用範圍，請縮小或調整方向");
    const p = placements?.[i] || { x: 130, y: 130 };
    if (![p.x, p.y].every(value => Number.isFinite(value) && value >= 0 && value <= 260)) throw new Error("平台位置無效");
    const box = { x1: mesh.min[0] + p.x, x2: mesh.max[0] + p.x, y1: mesh.min[1] + p.y, y2: mesh.max[1] + p.y };
    if (!autoArrange && (box.x1 < 4.99 || box.y1 < 4.99 || box.x2 > 255.01 || box.y2 > 255.01 || Math.abs(mesh.min[2]) > 0.01)) throw new Error("模型超出平台安全邊界或未貼合平台");
    return box;
  });
  if (!autoArrange) for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.x1 < b.x2 + 1.99 && a.x2 + 1.99 > b.x1 && a.y1 < b.y2 + 1.99 && a.y2 + 1.99 > b.y1) throw new Error("模型包圍框重疊或間距不足 2 mm，請重新排版");
  }
  return meshes;
}

// Core 3MF build transforms preserve absolute plate placement. Loading separate STLs
// would let the CLI recenter each object even with --arrange 0.
export async function createStationPlate(buffers, placements, autoArrange) {
  const meshes = validateStationPlate(buffers, placements, autoArrange);
  const resources = meshes.map((mesh, i) => `<object id="${i + 1}" type="model"><mesh><vertices>${mesh.vertices.map(([x,y,z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("")}</vertices><triangles>${Array.from({ length: mesh.vertices.length / 3 }, (_, t) => `<triangle v1="${t*3}" v2="${t*3+1}" v3="${t*3+2}"/>`).join("")}</triangles></mesh></object>`).join("");
  const build = meshes.map((_, i) => { const p = placements?.[i] || { x: 130, y: 130 }; return `<item objectid="${i+1}" transform="1 0 0 0 1 0 0 0 1 ${p.x} ${p.y} 0"/>`; }).join("");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
  zip.file("_rels/.rels", '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>');
  zip.file("3D/3dmodel.model", `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${resources}</resources><build>${build}</build></model>`);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
