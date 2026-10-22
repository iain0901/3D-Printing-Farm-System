// Bounded, display-only paths from actual worker output. Never executable G-code.
// Free-print presets disable arc fitting; unsupported arcs are disclosed, not drawn as straight lines.
export function buildLayerPreview(text, maxSegments = 100000) {
  const layers = new Map();
  let position = { X: 0, Y: 0, Z: 0, E: 0 };
  let absolute = true, absoluteE = true, stored = 0, truncated = false, unsupported = false;
  for (const raw of text.split(/\r?\n/)) {
    if (raw.startsWith("; FARMFLOW QUOTE PLATE")) {
      return { layers: [], truncated: false, warning: "這個結果包含多個列印盤，無法以單盤預覽；請縮小模型後重新切片。" };
    }
    const line = raw.split(";")[0].trim().toUpperCase();
    const command = line.match(/^(?:G|M)\d+/)?.[0];
    if (command === "G90") { absolute = true; absoluteE = true; }
    if (command === "G91") { absolute = false; absoluteE = false; }
    if (command === "M82") absoluteE = true;
    if (command === "M83") absoluteE = false;
    if (!["G0", "G1", "G2", "G3", "G92"].includes(command)) continue;
    const axes = Object.fromEntries([...line.matchAll(/([XYZE])\s*([-+]?(?:\d*\.\d+|\d+\.?\d*))/g)].map(m => [m[1], Number(m[2])]));
    if (command === "G92") { Object.assign(position, axes); continue; }
    const next = { ...position };
    for (const [axis, value] of Object.entries(axes)) next[axis] = (axis === "E" ? absoluteE : absolute) ? value : position[axis] + value;
    if (command === "G2" || command === "G3") unsupported = true;
    else if (next.E > position.E && (next.X !== position.X || next.Y !== position.Y)) {
      const key = next.Z.toFixed(3);
      let layer = layers.get(key);
      if (!layer && layers.size < 3000) {
        layer = { z: Number(key), segments: [], moves: 0 };
        layers.set(key, layer);
      }
      if (layer) {
        layer.moves++;
        if (stored < maxSegments && layer.segments.length < 1500) {
          layer.segments.push([position.X, position.Y, next.X, next.Y].map(v => Math.round(v * 1000) / 1000));
          stored++;
        } else truncated = true;
      } else truncated = true;
    }
    position = next;
  }
  return {
    layers: [...layers.values()].sort((a, b) => a.z - b.z),
    truncated,
    warning: [truncated ? "模型路徑較多，部分線段已省略；重量與時間仍採完整切片結果。" : "", unsupported ? "部分圓弧指令未顯示。" : ""].filter(Boolean).join(" ")
  };
}
