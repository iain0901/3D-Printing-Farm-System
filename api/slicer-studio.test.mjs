import { describe, it, expect } from "vitest";
import {
  BoxGeometry,
  Mesh,
  Vector3,
  Euler,
  Quaternion,
} from "../frontend-vue/node_modules/three/build/three.module.js";
import { STLExporter } from "../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js";
import { prepareStationModel } from "../frontend-vue/src/utils/prepare-station-model.js";
import {
  alignFaceTransform,
  studioSnapshot,
  snapshotKey,
} from "../frontend-vue/src/utils/slicer-studio.mjs";
import { buildToolpathPreview } from "./toolpath-preview.mjs";
import {
  orcaAdvancedSettings,
  advancedSlicerSchema,
} from "./studio-settings.mjs";
describe("desktop-style cloud slicer", () => {
  it("preserves face indices while nonuniform scaling and mirroring, with outward winding", () => {
    const g = new BoxGeometry(10, 20, 30),
      bytes = new STLExporter().parse(new Mesh(g), { binary: true }).buffer;
    g.dispose();
    const model = prepareStationModel(bytes, {
      scale: 100,
      scaleX: 150,
      scaleY: 80,
      scaleZ: 120,
      mirrorX: true,
      z: 90,
    });
    expect(model.dimensions[0]).toBeCloseTo(16);
    expect(model.dimensions[1]).toBeCloseTo(15);
    expect(model.dimensions[2]).toBeCloseTo(36);
    expect(new DataView(model.buffer).getUint32(80, true)).toBe(12);
    expect(model.effectiveScale).toEqual([-1.5, 0.8, 1.2]);
    const view = new DataView(model.buffer);
    let signedVolume = 0;
    for (let i = 0; i < 12; i++) {
      const base = 84 + i * 50 + 12;
      const vertices = [0, 1, 2].map(
        (v) =>
          new Vector3(
            ...[0, 1, 2].map((a) =>
              view.getFloat32(base + v * 12 + a * 4, true)
            )
          )
      );
      signedVolume +=
        vertices[0].dot(vertices[1].clone().cross(vertices[2])) / 6;
    }
    expect(signedVolume).toBeGreaterThan(0);
    expect(() => prepareStationModel(bytes, { scaleX: 0 })).toThrow();
  });
  it("aligns a selected surface to the bed and snapshots model transforms independently", () => {
    const result = alignFaceTransform([1, 0, 0], [0, 0, 0, 1]);
    const q = new Quaternion().setFromEuler(
      new Euler(
        (result.x * Math.PI) / 180,
        (result.y * Math.PI) / 180,
        (result.z * Math.PI) / 180
      )
    );
    const n = new Vector3(1, 0, 0).applyQuaternion(q);
    expect(n.z).toBeCloseTo(-1);
    expect(Math.abs(n.x)).toBeLessThan(1e-6);
    const source = new File(["a"], "a.stl"),
      items = [
        {
          id: 1,
          source,
          name: "a.stl",
          position: { x: 30, y: 40 },
          transform: { scale: 100 },
        },
      ];
    const saved = studioSnapshot(items);
    items[0].position.x = 80;
    items[0].transform.scale = 120;
    expect(saved[0].position.x).toBe(30);
    expect(saved[0].transform.scale).toBe(100);
    expect(saved[0].source).toBe(source);
    expect(snapshotKey(saved)).not.toBe(snapshotKey(studioSnapshot(items)));
  });
  it("maps every advanced control to validated process or machine settings", () => {
    const options = {
      lineWidth: 0.42,
      seamPosition: "back",
      infillPattern: "gyroid",
      topLayers: 5,
      bottomLayers: 4,
      outerWallSpeed: 60,
      innerWallSpeed: 100,
      infillSpeed: 90,
      travelSpeed: 200,
      initialLayerSpeed: 20,
      supportType: "normal(auto)",
      supportOnBuildPlate: true,
      supportAngle: 45,
      brimWidth: 4,
      skirtLoops: 1,
      raftLayers: 0,
      retractionLength: 0.8,
      retractionSpeed: 35,
    };
    const result = orcaAdvancedSettings(options);
    expect(result.process).toMatchObject({
      line_width: "0.42",
      seam_position: "back",
      sparse_infill_pattern: "gyroid",
      support_on_build_plate_only: "1",
      brim_type: "outer_only",
      brim_width: "4",
      raft_layers: "0",
    });
    expect(result.machine).toEqual({
      retraction_length: ["0.8"],
      retraction_speed: ["35"],
    });
    expect(
      Object.keys(result.process).length + Object.keys(result.machine).length
    ).toBe(Object.keys(options).length + 1);
    expect(
      advancedSlicerSchema.safeParse({ somePretendSetting: true }).success
    ).toBe(false);
    expect(advancedSlicerSchema.safeParse({ travelSpeed: 9999 }).success).toBe(
      false
    );
    expect(orcaAdvancedSettings({})).toEqual({ process: {}, machine: {} });
  });
  it("parses real extrusion roles, relative moves, per-tool E, retraction and travel without invented layers", () => {
    const code =
      "G90\nM83\nG1 Z0.2\n; FEATURE: Outer wall\nG1 X10 E1 F1200\nG1 E-1\nG1 Z0.6\nG0 X20\nG1 E1\nG1 Z0.2\n; FEATURE: Sparse infill\nG1 Y10 E1 F2400\nT1\nM82\nG92 E0\n; FEATURE: Support\nG1 X30 E1\nG1 Z0.4\nG1 Y20 E2\n";
    const result = buildToolpathPreview(code);
    expect(result.layers.map((l) => l.z)).toEqual([0.2, 0.4]);
    expect(result.layers[0].segments[0]).toMatchObject({
      from: [0, 0, 0.2],
      to: [10, 0, 0.2],
      role: "outer",
      speed: 20,
      tool: 0,
    });
    expect(
      result.layers[0].segments.find((s) => s.role === "infill").speed
    ).toBe(40);
    expect(result.layers[0].segments.some((s) => s.role === "travel")).toBe(
      true
    );
    expect(result.layers[1].segments.at(-1)).toMatchObject({
      role: "support",
      tool: 1,
    });
    expect(result.warning).toBe("");
    const bounded = buildToolpathPreview(code, { maxSegments: 2 });
    expect(bounded.segmentCount).toBe(2);
    expect(bounded.truncated).toBe(true);
    expect(
      buildToolpathPreview("; FARMFLOW QUOTE PLATE 1\n" + code).layers
    ).toEqual([]);
    expect(buildToolpathPreview(code + "G2 X5 Y5 E2").warning).toMatch(/圓弧/);
    const compact = buildToolpathPreview("G90\nM83\nG1Z.2\nG1X10E1F1200\n");
    expect(compact.layers[0].segments[0]).toMatchObject({
      to: [10, 0, 0.2],
      speed: 20,
      role: "other",
    });
  });
});
