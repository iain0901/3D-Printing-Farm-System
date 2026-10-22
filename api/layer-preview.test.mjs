import { describe, expect, it } from "vitest";
import { buildLayerPreview } from "./layer-preview.mjs";

describe("bounded actual G-code paths", () => {
  it("handles relative/absolute extrusion, resets, travel and Z hops without inventing layers", () => {
    const result = buildLayerPreview("G90\nM82\nG92 E0\nG1 Z.2\nG1 X10 E1\nG1 E0\nG1 Z.6\nG1 Y20\nG1 Z.2\nG92 E0\nM83\nG1 X20 E1\nG91\nG1 X2 E1\n");
    expect(result.layers).toEqual([{ z: 0.2, moves: 3, segments: [[0, 0, 10, 0], [10, 20, 20, 20], [20, 20, 22, 20]] }]);
  });
  it("discloses bounded previews, unsupported arcs and multi-plate output", () => {
    const clipped = buildLayerPreview("M83\nG1 X1 E1\nG1 X2 E1\nG1 X3 E1", 2);
    expect(clipped.truncated).toBe(true);
    expect(clipped.layers[0].segments).toHaveLength(2);
    expect(clipped.layers[0].moves).toBe(3);
    expect(buildLayerPreview("G2 X2 E1 I1").warning).toContain("圓弧");
    expect(buildLayerPreview("; FARMFLOW QUOTE PLATE 1\nG1 X1 E1").layers).toEqual([]);
  });
});
