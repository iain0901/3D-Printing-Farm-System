import { describe, it, expect } from "vitest";
import {
  BoxGeometry,
  Mesh,
} from "../frontend-vue/node_modules/three/build/three.module.js";
import { STLExporter } from "../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "../frontend-vue/node_modules/three/examples/jsm/loaders/STLLoader.js";
import { prepareStationModel } from "../frontend-vue/src/utils/prepare-station-model.js";
import {
  buildPaintTopology,
  selectPaintFaces,
  applyPaintChanges,
  appendPaintHistory,
  validateSurfacePaint,
} from "../frontend-vue/src/utils/surface-paint.mjs";
import {
  createQuoteDraft,
  defaultQuoteSettings,
} from "../frontend-vue/src/utils/quote-workspace.mjs";
import { createHash } from "node:crypto";

const cube = new BoxGeometry(20, 30, 40).toNonIndexed();
const positions = cube.attributes.position.array;
const topology = buildPaintTopology(positions);
describe("模型三角面上色", () => {
  it("平面填色只選取相連同向面，不穿到立方體背面或轉過直角", () => {
    const faces = selectPaintFaces(topology, 0, { x: 10, y: 0, z: 0 }, 5, true);
    expect(faces.sort()).toEqual([0, 1]);
    expect(selectPaintFaces(topology, 0, { x: 10, y: 0, z: 0 }, 1)).toEqual([
      0,
    ]);
  });
  it("不跨過分離外殼，也不跨過非流形共邊", () => {
    const separate = new Float32Array(positions.length * 2);
    separate.set(positions);
    separate.set(
      positions.map((value, i) => value + (i % 3 === 0 ? 60 : 0)),
      positions.length
    );
    const t = buildPaintTopology(separate);
    expect(selectPaintFaces(t, 0, { x: 10, y: 0, z: 0 }, 500, true)).toEqual([
      0, 1,
    ]);
    const triple = new Float32Array([
      ...positions.slice(0, 9),
      ...positions.slice(0, 9),
      ...positions.slice(0, 9),
    ]);
    expect(
      selectPaintFaces(
        buildPaintTopology(triple),
        0,
        { x: 0, y: 0, z: 0 },
        100,
        true
      )
    ).toEqual([0]);
  });
  it("拒絕無效面與範圍，避免無界模型處理", () => {
    expect(selectPaintFaces(topology, -1, {}, 5)).toEqual([]);
    expect(selectPaintFaces(topology, 99, {}, 5)).toEqual([]);
    expect(selectPaintFaces(topology, 0, {}, NaN)).toEqual([]);
    expect(() => buildPaintTopology(new Float32Array(0))).toThrow();
    expect(() => buildPaintTopology(new Float32Array(200001 * 9))).toThrow();
  });
  it("塗色、擦除與復原都不修改原資料；歷史容量有上限", () => {
    const faces = { 0: "red" },
      changes = [
        { face: 0, before: "red", after: null },
        { face: 1, before: null, after: "green" },
      ];
    const next = applyPaintChanges(faces, changes);
    expect(next).toEqual({ 1: "green" });
    expect(faces).toEqual({ 0: "red" });
    expect(applyPaintChanges(next, changes, true)).toEqual(faces);
    let history = [];
    for (let i = 0; i < 40; i++) history = appendPaintHistory(history, changes);
    expect(history).toHaveLength(30);
    expect(
      appendPaintHistory([new Array(150000)], new Array(100000))
    ).toHaveLength(1);
  });
  it("匯出綁定真實幾何雜湊、三角面順序與色槽，未知資料不放行", () => {
    const model = { triangleCount: 12, geometryHash: "a".repeat(64) },
      slots = [{ id: "s1", label: "紅", hex: "#ff0000" }];
    expect(validateSurfacePaint({ 0: "s1", 11: "s1" }, model, slots)).toBe("");
    for (const faces of [
      { 12: "s1" },
      { "-1": "s1" },
      { 1.5: "s1" },
      { 0: "missing" },
    ])
      expect(validateSurfacePaint(faces, model, slots)).not.toBe("");
    expect(
      validateSurfacePaint({ 0: "s1" }, { ...model, geometryHash: "" }, slots)
    ).not.toBe("");
    const settings = { ...defaultQuoteSettings(), colorMode: "multi" };
    const layout = {
      ready: true,
      files: [{}],
      models: [
        {
          ...model,
          id: "a",
          name: "a.stl",
          dimensions: [20, 30, 40],
          position: { x: 100, y: 100 },
          transform: {},
        },
      ],
    };
    const assignments = {
      a: {
        quantity: 1,
        slotId: "s1",
        bands: [],
        surfacePaint: { 8: "s1", 2: "s1" },
      },
    };
    const draft = createQuoteDraft(layout, settings, slots, assignments);
    expect(draft.schemaVersion).toBe("3drfm.quote-workspace.v2");
    expect(draft.models[0].surfacePaint).toMatchObject({
      geometrySha256: model.geometryHash,
      triangleCount: 12,
      faces: [
        [2, "s1"],
        [8, "s1"],
      ],
      priority: "surface-over-height-over-base",
    });
    settings.colorMode = "single";
    expect(
      createQuoteDraft(layout, settings, slots, assignments).models[0]
        .surfacePaint
    ).toBeNull();
  });
  it("旋轉、縮放與平躺保留三角面索引與相鄰關係，幾何 hash 隨實際位元組改變", () => {
    const bytes = new STLExporter().parse(new Mesh(cube), {
      binary: true,
    }).buffer;
    const source = prepareStationModel(bytes),
      changed = prepareStationModel(bytes, {
        x: 90,
        scale: 150,
        layFlat: true,
      });
    const parse = (result) => {
      const g = new STLLoader().parse(result.buffer),
        t = buildPaintTopology(g.attributes.position.array);
      g.dispose();
      return t;
    };
    const a = parse(source),
      b = parse(changed);
    expect(a.neighbors).toEqual(b.neighbors);
    for (let face = 0; face < a.count; face++)
      expect(selectPaintFaces(b, face, {}, 1, true)).toEqual(
        selectPaintFaces(a, face, {}, 1, true)
      );
    expect(
      createHash("sha256").update(Buffer.from(source.buffer)).digest("hex")
    ).not.toBe(
      createHash("sha256").update(Buffer.from(changed.buffer)).digest("hex")
    );
  });
});
