import JSZip from "jszip";

const MATERIAL_DENSITY = {
  PLA: 1.24,
  PETG: 1.27,
  ASA: 1.07,
  TPU: 1.2,
  Resin: 1.1
};

// 單一 STL/3MF 檔案若三角形數超過這個上限，就跳過分件偵測（union-find 是 O(n) 但常數項在超大檔案上仍可能拖慢請求），
// 直接視為單一零件回傳整體外框，避免報價 API 被超大模型檔卡住。
const MAX_TRIANGLES_FOR_SHELL_DETECTION = 200000;

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function positiveDimensions(dimensions) {
  return dimensions.map((value) => Math.max(1, round(value, 1)));
}

function estimateFromDimensions(dimensions, material = "PLA", type = "STL") {
  const [x, y, z] = positiveDimensions(dimensions);
  const boundingVolumeCm3 = (x * y * z) / 1000;
  const infillFactor = type === "GCODE" ? 0.18 : 0.14;
  const grams = Math.max(1, Math.round(boundingVolumeCm3 * (MATERIAL_DENSITY[material] || MATERIAL_DENSITY.PLA) * infillFactor));
  const minutes = Math.max(10, Math.round(grams * (type === "GCODE" ? 1.7 : 2.3) + z * 0.8));
  const quote = Math.max(18, Math.round(grams * 1.4 + minutes * 0.28));
  return { estimateGrams: grams, estimateMinutes: minutes, quote };
}

function formatPrintTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = String(minutes % 60).padStart(2, "0");
  return `${hours}h ${remainder}m`;
}

function boundsFromPoints(points) {
  if (!points.length) return [100, 100, 50];
  const mins = [Infinity, Infinity, Infinity];
  const maxes = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    point.forEach((value, index) => {
      mins[index] = Math.min(mins[index], value);
      maxes[index] = Math.max(maxes[index], value);
    });
  }
  return positiveDimensions(maxes.map((value, index) => value - mins[index]));
}

/**
 * @description 用 union-find 對三角形網格做連通分量分析，把單一 STL 內互不相連的多個零件
 * （例如一次匯出多個鑰匙圈、多個打樣件）拆成各自的「殼」(shell)。判斷依據是頂點共用：
 * 兩個三角形若共用任一頂點（座標四捨五入到小數點後 4 位以容忍浮點誤差），就視為同一殼的一部分。
 * 這是業界常見的「單檔多零件」偵測作法（Shapeways/Xometry 等平台的做法基本相同）。
 */
function detectShells(triangles) {
  if (!triangles.length) return [];
  const parent = new Map();
  const find = (key) => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root);
    let current = key;
    while (parent.get(current) !== root) {
      const next = parent.get(current);
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  const vertexKey = (point) => `${round(point[0], 4)}|${round(point[1], 4)}|${round(point[2], 4)}`;

  for (const triangle of triangles) {
    for (const point of triangle) {
      const key = vertexKey(point);
      if (!parent.has(key)) parent.set(key, key);
    }
    const [k0, k1, k2] = triangle.map(vertexKey);
    union(k0, k1);
    union(k1, k2);
  }

  const shellPoints = new Map();
  for (const triangle of triangles) {
    const root = find(vertexKey(triangle[0]));
    if (!shellPoints.has(root)) shellPoints.set(root, []);
    const points = shellPoints.get(root);
    for (const point of triangle) points.push(point);
  }
  return Array.from(shellPoints.values());
}

function parseAsciiStl(text) {
  const points = [];
  const vertexPattern = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let match;
  while ((match = vertexPattern.exec(text))) {
    points.push([Number(match[1]), Number(match[2]), Number(match[3])]);
  }
  const triangles = [];
  for (let index = 0; index + 2 < points.length; index += 3) {
    triangles.push([points[index], points[index + 1], points[index + 2]]);
  }
  return { dimensions: boundsFromPoints(points), triangles };
}

function parseBinaryStl(buffer) {
  if (buffer.length < 84) return { dimensions: [100, 100, 50], triangles: [] };
  const triangleCount = buffer.readUInt32LE(80);
  const expectedLength = 84 + triangleCount * 50;
  if (expectedLength > buffer.length) return parseAsciiStl(buffer.toString("utf8"));
  const points = [];
  const triangles = [];
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    offset += 12;
    const face = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const point = [buffer.readFloatLE(offset), buffer.readFloatLE(offset + 4), buffer.readFloatLE(offset + 8)];
      points.push(point);
      face.push(point);
      offset += 12;
    }
    triangles.push(face);
    offset += 2;
  }
  return { dimensions: boundsFromPoints(points), triangles };
}

function parseStl(buffer) {
  const header = buffer.subarray(0, 80).toString("utf8").trimStart();
  if (header.startsWith("solid")) {
    const text = buffer.toString("utf8");
    if (text.includes("facet") && text.includes("vertex")) return parseAsciiStl(text);
  }
  return parseBinaryStl(buffer);
}

function parseGcode(buffer) {
  const text = buffer.toString("utf8");
  const points = [];
  let estimateMinutes = 0;
  for (const line of text.split(/\r?\n/)) {
    const timeMatch = line.match(/;\s*(?:TIME|estimated printing time).*?(\d+)/i);
    if (timeMatch) {
      const seconds = Number(timeMatch[1]);
      if (Number.isFinite(seconds) && seconds > 0) estimateMinutes = Math.max(estimateMinutes, Math.round(seconds / 60));
    }
    if (!/^(G0|G1)\b/i.test(line.trim())) continue;
    const x = line.match(/\bX([-+\d.]+)/i);
    const y = line.match(/\bY([-+\d.]+)/i);
    const z = line.match(/\bZ([-+\d.]+)/i);
    if (x || y || z) points.push([Number(x?.[1] || 0), Number(y?.[1] || 0), Number(z?.[1] || 0)]);
  }
  return { dimensions: boundsFromPoints(points), estimateMinutes };
}

// 從 <basematerials> 資源區塊解析每個材質的顏色（displaycolor="#RRGGBB[AA]"），供多色列印時每個物件對應的顏色查詢。
// 這是 Bambu Studio/PrusaSlicer/Orca Slicer 匯出多色/多材料 3MF 時的標準寫法。
function parse3mfMaterialColors(xml) {
  const colorsByGroupId = new Map();
  const groupPattern = /<basematerials\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/basematerials>/g;
  let groupMatch;
  while ((groupMatch = groupPattern.exec(xml))) {
    const [, groupId, body] = groupMatch;
    const colors = [];
    const basePattern = /<base\b[^>]*\bdisplaycolor="(#[0-9a-fA-F]{6,8})"/g;
    let baseMatch;
    while ((baseMatch = basePattern.exec(body))) colors.push(baseMatch[1].slice(0, 7));
    colorsByGroupId.set(groupId, colors);
  }
  return colorsByGroupId;
}

// 物件本身若沒有指定材質，顏色可能是掛在其 <mesh>/<component> 底下的三角形 pid/p1 上（per-triangle 材質），
// 這裡只取物件層級能拿到的第一個顏色線索，多色物件內部真正的逐三角形上色留給前端 3D 檢視器用使用者指定的顏色覆蓋。
function resolveObjectColor(objectBlock, colorsByGroupId) {
  const pidMatch = objectBlock.match(/<object\b[^>]*\bpid="([^"]+)"/);
  const pindexMatch = objectBlock.match(/<object\b[^>]*\bpindex="([^"]+)"/);
  if (!pidMatch) return "";
  const colors = colorsByGroupId.get(pidMatch[1]);
  if (!colors || !colors.length) return "";
  const index = pindexMatch ? Number(pindexMatch[1]) : 0;
  return colors[index] || colors[0] || "";
}

async function parse3mf(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const modelFile = zip.file("3D/3dmodel.model") || Object.values(zip.files).find((file) => file.name.endsWith(".model"));
  if (!modelFile) return { dimensions: [100, 100, 50], objectCount: 0 };
  const xml = await modelFile.async("string");
  const points = [];
  const objectDimensions = [];
  const objectColors = [];
  const colorsByGroupId = parse3mfMaterialColors(xml);
  // 3MF 原生用 <object> 元素表示各自獨立的零件，比 STL 的三角形連通分量分析可靠很多，直接照 <object> 切分即可。
  const objectBlocks = xml.match(/<object\b[\s\S]*?<\/object>/g) || [];
  const vertexPattern = /<vertex\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/g;
  if (objectBlocks.length > 1) {
    for (const block of objectBlocks) {
      const objectPoints = [];
      let match;
      vertexPattern.lastIndex = 0;
      while ((match = vertexPattern.exec(block))) {
        const point = [Number(match[1]), Number(match[2]), Number(match[3])];
        objectPoints.push(point);
        points.push(point);
      }
      if (objectPoints.length) {
        objectDimensions.push(boundsFromPoints(objectPoints));
        objectColors.push(resolveObjectColor(block, colorsByGroupId));
      }
    }
  } else {
    let match;
    while ((match = vertexPattern.exec(xml))) {
      points.push([Number(match[1]), Number(match[2]), Number(match[3])]);
    }
  }
  return { dimensions: boundsFromPoints(points), objectCount: objectBlocks.length, objectDimensions, objectColors };
}

export function modelTypeFromName(filename) {
  const extension = filename.split(".").pop()?.toUpperCase();
  if (extension === "GCODE") return "GCODE";
  if (extension === "STL") return "STL";
  if (extension === "3MF") return "3MF";
  if (extension === "OBJ") return "OBJ";
  return "STL";
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${round(bytes / 1024, 1)} KB`;
  return `${round(bytes / (1024 * 1024), 1)} MB`;
}

function partsFromDimensionsList(dimensionsList, material, type, colors = []) {
  return dimensionsList.map((dimensions, index) => ({
    index,
    dimensions,
    // 只有 3MF 且該物件在檔案內有指定材質顏色時才會有值；STL 本身不帶顏色資訊，由使用者在檢視器裡自行指定
    ...(colors[index] ? { color: colors[index] } : {}),
    ...estimateFromDimensions(dimensions, material, type)
  }));
}

export async function parseModelMetadata({ buffer, filename, material = "PLA" }) {
  const type = modelTypeFromName(filename);
  let dimensions = [100, 100, 50];
  let gcodeMinutes = 0;
  let parts;
  if (type === "STL") {
    const parsed = parseStl(buffer);
    dimensions = parsed.dimensions;
    if (parsed.triangles.length && parsed.triangles.length <= MAX_TRIANGLES_FOR_SHELL_DETECTION) {
      const shells = detectShells(parsed.triangles);
      if (shells.length > 1) parts = partsFromDimensionsList(shells.map(boundsFromPoints), material, type);
    }
  }
  if (type === "GCODE") {
    const parsed = parseGcode(buffer);
    dimensions = parsed.dimensions;
    gcodeMinutes = parsed.estimateMinutes;
  }
  if (type === "3MF") {
    const parsed = await parse3mf(buffer);
    dimensions = parsed.dimensions;
    if (parsed.objectDimensions?.length > 1) parts = partsFromDimensionsList(parsed.objectDimensions, material, type, parsed.objectColors);
  }
  const estimates = estimateFromDimensions(dimensions, material, type);
  const estimateMinutes = gcodeMinutes || estimates.estimateMinutes;
  return {
    type,
    dimensions: positiveDimensions(dimensions),
    ...estimates,
    estimateMinutes,
    printTime: formatPrintTime(estimateMinutes),
    sliced: type === "GCODE",
    status: type === "GCODE" ? "sliced" : "uploaded",
    // 只有偵測到 >1 個獨立零件時才會出現；單零件檔案沒有這個欄位，呼叫端要用 `if (parts)` 判斷
    ...(parts ? { parts, partCount: parts.length } : {})
  };
}
