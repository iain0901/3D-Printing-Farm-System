import { describe, it, expect } from "vitest";
import { buildToolpathPreview } from "./toolpath-preview.mjs";
import {
  extrusionGeometry,
  previewBounds,
  fitPreviewCamera,
} from "../frontend-vue/src/utils/toolpath-geometry.js";
import {
  PerspectiveCamera,
  Vector3,
} from "../frontend-vue/node_modules/three/build/three.module.js";

const code =
  "G90\nM83\nG0 X105 Y105 Z0.2\n; FEATURE: Outer wall\n; WIDTH: 0.45\n; HEIGHT: 0.2\nG1 X155 E1\nG1 Y155 E1\nG1 X105 E1\nG1 Y105 E1\nG0 X0 Y0 Z250\n";
describe("recognizable full-object slicing preview", () => {
  it("excludes parking and Z-hop from framing even for legacy responses", () => {
    const preview = buildToolpathPreview(code);
    expect(preview.bounds).toEqual({
      min: [105, 105, 0.2],
      max: [155, 155, 0.2],
    });
    expect(preview.objectBounds).toEqual(preview.bounds);
    expect(
      previewBounds({ ...preview, objectBounds: undefined }).max.toArray()
    ).toEqual([155, 155, 0.2]);
    expect(preview.layers[0].segments.at(-1).role).toBe("travel");
  });
  it("keeps full-height bounds and distributes a limited budget across every layer", () => {
    const lines = ["G90", "M83"];
    for (let z = 1; z <= 120; z++) {
      lines.push(`G0 X100 Y100 Z${z}`, "; FEATURE: Outer wall");
      for (let i = 0; i < 100; i++)
        lines.push(`G1 X${100 + (i % 2) * 50} Y${100 + i} E1`);
    }
    const p = buildToolpathPreview(lines.join("\n"), { maxSegments: 1000 });
    expect(p.segmentCount).toBe(1000);
    expect(p.layers).toHaveLength(120);
    expect(
      p.layers.every((l) => l.segments.some((s) => s.role === "outer"))
    ).toBe(true);
    expect(p.objectBounds.max[2]).toBe(120);
    expect(p.layers.at(-1).segments.at(-1).to[2]).toBe(120);
    expect(p.sampled).toBe(true);
    expect(p.warning).toMatch(/跨所有圖層抽樣/);
  });
  it("keeps exact geometry below the cap and identifies incomplete input separately", () => {
    const p = buildToolpathPreview(code);
    expect(p.layers[0].segments[0]).toMatchObject({ width: 0.45, height: 0.2 });
    expect(p.sampled).toBe(false);
    expect(p.totalSegments).toBe(p.segmentCount);
    expect(buildToolpathPreview(code, { maxLines: 8 }).warning).toMatch(
      /安全讀取上限/
    );
    expect(buildToolpathPreview("; FARMFLOW QUOTE PLATE").layers).toEqual([]);
  });
  it("renders deposited layer thickness below Z without covering a ring hole", () => {
    const paths = [];
    for (let i = 0; i < 64; i++) {
      const a = (i * Math.PI) / 32,
        b = ((i + 1) * Math.PI) / 32;
      paths.push({
        from: [Math.cos(a) * 15, Math.sin(a) * 15, 0.2],
        to: [Math.cos(b) * 15, Math.sin(b) * 15, 0.2],
        role: "outer",
        width: 0.45,
        height: 0.2,
      });
    }
    const g = extrusionGeometry(paths, { outer: "#cccccc" });
    g.computeBoundingBox();
    expect(g.boundingBox.min.z).toBeCloseTo(0);
    expect(g.boundingBox.max.z).toBeCloseTo(0.2);
    const positions = g.getAttribute("position");
    for (let i = 0; i < positions.count; i++)
      expect(Math.hypot(positions.getX(i), positions.getY(i))).toBeGreaterThan(
        14
      );
    expect(g.getAttribute("normal").array.every(Number.isFinite)).toBe(true);
    g.dispose();
  });
  it("frames the object in portrait and landscape, not the plate or end moves", () => {
    const bounds = previewBounds(buildToolpathPreview(code));
    for (const aspect of [0.45, 1.5]) {
      const camera = new PerspectiveCamera(40, aspect, 0.1, 5000);
      camera.up.set(0, 0, 1);
      const controls = {
        target: new Vector3(),
        update() {
          camera.lookAt(this.target);
          camera.updateMatrixWorld();
        },
      };
      fitPreviewCamera(camera, controls, bounds);
      expect(controls.target.toArray()).toEqual([130, 130, 0.2]);
      for (const x of [105, 155])
        for (const y of [105, 155]) {
          const p = new Vector3(x, y, 0.2).project(camera);
          expect(Math.abs(p.x)).toBeLessThan(1);
          expect(Math.abs(p.y)).toBeLessThan(1);
        }
      expect(camera.position.distanceTo(controls.target)).toBeLessThan(300);
    }
  });
});
