import JSZip from "jszip";

const MATERIAL_DENSITY = {
  PLA: 1.24,
  PETG: 1.27,
  ASA: 1.07,
  TPU: 1.2,
  Resin: 1.1
};

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

function parseAsciiStl(text) {
  const points = [];
  const vertexPattern = /vertex\s+([-+\d.eE]+)\s+([-+\d.eE]+)\s+([-+\d.eE]+)/g;
  let match;
  while ((match = vertexPattern.exec(text))) {
    points.push([Number(match[1]), Number(match[2]), Number(match[3])]);
  }
  return boundsFromPoints(points);
}

function parseBinaryStl(buffer) {
  if (buffer.length < 84) return [100, 100, 50];
  const triangles = buffer.readUInt32LE(80);
  const expectedLength = 84 + triangles * 50;
  if (expectedLength > buffer.length) return parseAsciiStl(buffer.toString("utf8"));
  const points = [];
  let offset = 84;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    offset += 12;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      points.push([
        buffer.readFloatLE(offset),
        buffer.readFloatLE(offset + 4),
        buffer.readFloatLE(offset + 8)
      ]);
      offset += 12;
    }
    offset += 2;
  }
  return boundsFromPoints(points);
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

async function parse3mf(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const modelFile = zip.file("3D/3dmodel.model") || Object.values(zip.files).find((file) => file.name.endsWith(".model"));
  if (!modelFile) return [100, 100, 50];
  const xml = await modelFile.async("string");
  const points = [];
  const vertexPattern = /<vertex\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/g;
  let match;
  while ((match = vertexPattern.exec(xml))) {
    points.push([Number(match[1]), Number(match[2]), Number(match[3])]);
  }
  return boundsFromPoints(points);
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

export async function parseModelMetadata({ buffer, filename, material = "PLA" }) {
  const type = modelTypeFromName(filename);
  let dimensions = [100, 100, 50];
  let gcodeMinutes = 0;
  if (type === "STL") dimensions = parseStl(buffer);
  if (type === "GCODE") {
    const parsed = parseGcode(buffer);
    dimensions = parsed.dimensions;
    gcodeMinutes = parsed.estimateMinutes;
  }
  if (type === "3MF") dimensions = await parse3mf(buffer);
  const estimates = estimateFromDimensions(dimensions, material, type);
  const estimateMinutes = gcodeMinutes || estimates.estimateMinutes;
  return {
    type,
    dimensions: positiveDimensions(dimensions),
    ...estimates,
    estimateMinutes,
    printTime: formatPrintTime(estimateMinutes),
    sliced: type === "GCODE",
    status: type === "GCODE" ? "sliced" : "uploaded"
  };
}
