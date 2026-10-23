const roles = {
  outer: "外壁",
  inner: "內壁",
  infill: "填充",
  solid: "實心填充",
  support: "支撐",
  adhesion: "平台附著",
  travel: "空走",
  other: "其他",
};
function roleFor(comment, current) {
  const feature = comment.match(/(?:FEATURE|TYPE)\s*:\s*(.+)/i)?.[1] || "";
  if (!feature) return current;
  if (/support/i.test(feature)) return "support";
  if (/skirt|brim|raft/i.test(feature)) return "adhesion";
  if (/outer|external|wall-outer/i.test(feature)) return "outer";
  if (/inner|perimeter|wall-inner/i.test(feature)) return "inner";
  if (/top|bottom|solid|skin/i.test(feature)) return "solid";
  if (/infill|fill/i.test(feature)) return "infill";
  return "other";
}
function scanToolpaths(text, { maxLines = 2000000, onSegment } = {}) {
  const layers = [],
    byZ = new Map(),
    tools = new Map();
  let position = { X: 0, Y: 0, Z: 0 },
    absolute = true,
    absoluteE = true,
    tool = 0,
    speed = 0,
    role = "other",
    count = 0,
    lineCount = 0,
    truncated = false,
    unsupported = false,
    currentLayer = null,
    width = null,
    height = null;
  const toolState = () => {
    if (!tools.has(tool)) tools.set(tool, { e: 0, debt: 0 });
    return tools.get(tool);
  };
  const bounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  const objectBounds = { min: [...bounds.min], max: [...bounds.max] };
  if (text.includes("; FARMFLOW QUOTE PLATE"))
    return {
      layers: [],
      roles,
      segmentCount: 0,
      truncated: false,
      warning: "此結果包含多個列印盤，請分盤重新切片後檢視。",
      bounds: null,
    };
  for (const match of text.matchAll(/[^\r\n]+/g)) {
    if (++lineCount > maxLines) {
      truncated = true;
      break;
    }
    const raw = match[0],
      semicolon = raw.indexOf(";"),
      comment = semicolon >= 0 ? raw.slice(semicolon + 1) : "";
    role = roleFor(comment, role);
    const w = comment.match(/(?:WIDTH|LINE_WIDTH)\s*:\s*([\d.]+)/i),
      h = comment.match(/(?:HEIGHT|LAYER_HEIGHT)\s*:\s*([\d.]+)/i);
    if (w && Number(w[1]) > 0 && Number(w[1]) <= 5) width = Number(w[1]);
    if (h && Number(h[1]) > 0 && Number(h[1]) <= 5) height = Number(h[1]);
    const line = (semicolon >= 0 ? raw.slice(0, semicolon) : raw)
        .trim()
        .toUpperCase(),
      command = line.match(/^(?:G|M|T)\d+/)?.[0];
    if (command?.[0] === "T") {
      tool = Number(command.slice(1));
      continue;
    }
    if (command === "G90") {
      absolute = true;
      absoluteE = true;
      continue;
    }
    if (command === "G91") {
      absolute = false;
      absoluteE = false;
      continue;
    }
    if (command === "M82") {
      absoluteE = true;
      continue;
    }
    if (command === "M83") {
      absoluteE = false;
      continue;
    }
    if (!["G0", "G1", "G00", "G01", "G2", "G3", "G92"].includes(command))
      continue;
    const fields = Object.fromEntries(
      [...line.matchAll(/([XYZEF])\s*([-+]?(?:\d*\.\d+|\d+\.?\d*))/g)].map(
        (m) => [m[1], Number(m[2])]
      )
    );
    if (
      Object.values(fields).some(
        (v) => !Number.isFinite(v) || Math.abs(v) > 1e8
      )
    ) {
      unsupported = true;
      continue;
    }
    const state = toolState();
    if (command === "G92") {
      for (const axis of ["X", "Y", "Z"])
        if (fields[axis] !== undefined) position[axis] = fields[axis];
      if (fields.E !== undefined) state.e = fields.E;
      continue;
    }
    if (fields.F !== undefined) speed = fields.F / 60;
    const next = { ...position };
    for (const axis of ["X", "Y", "Z"])
      if (fields[axis] !== undefined)
        next[axis] = absolute ? fields[axis] : position[axis] + fields[axis];
    let deposited = 0;
    if (fields.E !== undefined) {
      const delta = absoluteE ? fields.E - state.e : fields.E;
      if (absoluteE) state.e = fields.E;
      if (delta < 0) state.debt += -delta;
      else {
        const restored = Math.min(delta, state.debt);
        state.debt -= restored;
        deposited = delta - restored;
      }
    }
    if (["G2", "G3"].includes(command)) {
      unsupported = true;
      position = next;
      continue;
    }
    const moves =
      next.X !== position.X || next.Y !== position.Y || next.Z !== position.Z;
    if (moves) {
      if (
        deposited > 1e-7 &&
        (next.X !== position.X || next.Y !== position.Y)
      ) {
        const z = Number(next.Z.toFixed(3));
        if (!byZ.has(z)) {
          if (layers.length >= 3000) {
            truncated = true;
            position = next;
            continue;
          }
          const layer = { z, count: 0 };
          byZ.set(z, layer);
          layers.push(layer);
        }
        currentLayer = byZ.get(z);
      }
      if (currentLayer) {
        {
          const from = [position.X, position.Y, position.Z].map(
              (v) => Math.round(v * 1000) / 1000
            ),
            to = [next.X, next.Y, next.Z].map(
              (v) => Math.round(v * 1000) / 1000
            );
          const segment = {
            from,
            to,
            role: deposited > 1e-7 ? role : "travel",
            speed: Math.round(speed * 100) / 100,
            tool,
            line: lineCount,
            width,
            height,
          };
          onSegment?.(currentLayer.z, segment, currentLayer.count);
          currentLayer.count++;
          count++;
          // Parking, wiping and Z-hop must not determine the model framing.
          if (segment.role !== "travel")
            for (const p of [from, to])
              p.forEach((v, i) => {
                bounds.min[i] = Math.min(bounds.min[i], v);
                bounds.max[i] = Math.max(bounds.max[i], v);
                if (
                  ["outer", "inner", "solid", "infill"].includes(segment.role)
                ) {
                  objectBounds.min[i] = Math.min(objectBounds.min[i], v);
                  objectBounds.max[i] = Math.max(objectBounds.max[i], v);
                }
              });
        }
      }
    }
    position = next;
  }
  return {
    layers: layers.sort((a, b) => a.z - b.z),
    roles,
    segmentCount: count,
    bounds: Number.isFinite(bounds.min[0]) ? bounds : null,
    objectBounds: Number.isFinite(objectBounds.min[0]) ? objectBounds : null,
    truncated,
    warning: [
      truncated
        ? "路徑資料超過安全讀取上限，目前僅能檢視部分內容；實際時間與用料仍採完整切片結果。"
        : "",
      unsupported ? "部分圓弧或不支援的指令未繪製。" : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export function buildToolpathPreview(
  text,
  { maxSegments = 100000, maxLines = 2000000 } = {}
) {
  // Two bounded passes: count first, then distribute the display budget across
  // ALL layers. Keeping only the first N moves made tall objects lose their top.
  const summary = scanToolpaths(text, { maxLines });
  const budget = Math.max(0, Math.floor(maxSegments));
  const total = summary.segmentCount;
  let remaining = Math.min(budget, total),
    remainingCount = total;
  const plans = new Map(
    summary.layers.map((layer, index) => {
      const laterLayers = summary.layers.length - index - 1;
      const reserve = Math.min(remaining, laterLayers);
      const quota = Math.min(
        layer.count,
        Math.max(
          remaining > reserve ? 1 : 0,
          Math.min(
            remaining - reserve,
            Math.round((remaining * layer.count) / remainingCount)
          )
        )
      );
      remaining -= quota;
      remainingCount -= layer.count;
      return [
        layer.z,
        { z: layer.z, totalSegments: layer.count, quota, segments: [] },
      ];
    })
  );
  if (total)
    scanToolpaths(text, {
      maxLines,
      onSegment(z, segment, index) {
        const plan = plans.get(z);
        if (!plan?.quota) return;
        const target =
          plan.quota === 1
            ? Math.floor((plan.totalSegments - 1) / 2)
            : Math.round(
                (plan.segments.length * (plan.totalSegments - 1)) /
                  (plan.quota - 1)
              );
        if (index === target && plan.segments.length < plan.quota)
          plan.segments.push(segment);
      },
    });
  const sampled = total > budget;
  const layers = [...plans.values()].map(({ z, segments, totalSegments }) => ({
    z,
    segments,
    totalSegments,
  }));
  return {
    ...summary,
    layers,
    totalSegments: total,
    segmentCount: layers.reduce((n, layer) => n + layer.segments.length, 0),
    sampled,
    truncated: summary.truncated || sampled,
    warning: [
      summary.warning,
      sampled
        ? "路徑較多，已跨所有圖層抽樣顯示，並非完整走線；模型外觀不受影響，時間與用料仍採完整切片結果。"
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}
