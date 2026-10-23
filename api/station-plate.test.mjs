import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createStationPlate, validateStationPlate } from "./station-plate.mjs";
import { testStl } from "./test-helpers/stl.mjs";
import {
  arrangeModels,
  layoutWarning,
} from "../frontend-vue/src/utils/station-layout.mjs";

describe("manual and automatic station layouts", () => {
  it("writes separate 3MF objects with the exact UI plate coordinates", async () => {
    const bytes = await createStationPlate(
      [testStl(), testStl()],
      [
        { x: 40, y: 50 },
        { x: 90, y: 100 },
      ],
      false
    );
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("3D/3dmodel.model").async("string");
    expect(xml).toContain('objectid="1" transform="1 0 0 0 1 0 0 0 1 40 50 0"');
    expect(xml).toContain(
      'objectid="2" transform="1 0 0 0 1 0 0 0 1 90 100 0"'
    );
    expect(xml.match(/<object /g)).toHaveLength(2);
  });
  it("rejects malformed coordinates, overlaps and out-of-bounds manual models", () => {
    expect(() => validateStationPlate([testStl()], undefined, false)).toThrow();
    expect(() =>
      validateStationPlate([testStl()], [{ x: 2, y: 20 }], false)
    ).toThrow(/邊界/);
    expect(() =>
      validateStationPlate(
        [testStl(), testStl()],
        [
          { x: 130, y: 130 },
          { x: 130, y: 130 },
        ],
        false
      )
    ).toThrow(/重疊/);
    const bad = testStl();
    bad.writeFloatLE(NaN, 96);
    expect(() => validateStationPlate([bad], undefined, true)).toThrow(/無效/);
  });
  it("shares identical STL vertices in each 3MF object without changing winding or coordinates", async () => {
    const source = testStl(10, 20, 30);
    const zip = await JSZip.loadAsync(
      await createStationPlate([source], [{ x: 130, y: 130 }], false)
    );
    const xml = await zip.file("3D/3dmodel.model").async("string");
    const vertices = [
      ...xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g),
    ].map((m) => m.slice(1).map(Number));
    const triangles = [
      ...xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g),
    ].map((m) => m.slice(1).map(Number));
    expect(vertices).toHaveLength(4);
    expect(triangles).toHaveLength(4);
    const edges = new Map();
    triangles.forEach((triangle, t) => {
      triangle.forEach((index, v) => {
        expect(vertices[index]).toEqual(
          [0, 1, 2].map((a) =>
            source.readFloatLE(84 + t * 50 + 12 + v * 12 + a * 4)
          )
        );
        const next = triangle[(v + 1) % 3],
          key = [index, next].sort((a, b) => a - b).join(",");
        const value = edges.get(key) || { count: 0, direction: 0 };
        value.count++;
        value.direction += index < next ? 1 : -1;
        edges.set(key, value);
      });
    });
    expect(
      [...edges.values()].every((e) => e.count === 2 && e.direction === 0)
    ).toBe(true);
  });
  it("automatically packs models with a safe gap and detects impossible arrangements", () => {
    const dimensions = [
      [80, 100, 20],
      [120, 80, 30],
      [30, 50, 10],
    ];
    const placements = arrangeModels(dimensions);
    expect(
      layoutWarning(
        dimensions.map((size, i) => ({
          dimensions: size,
          position: placements[i],
        }))
      )
    ).toBe("");
    validateStationPlate(
      dimensions.map((size) => testStl(...size)),
      placements,
      false
    );
    expect(arrangeModels([[10, 20, 30]])).toEqual([{ x: 130, y: 130 }]);
    expect(() =>
      arrangeModels([
        [200, 200, 10],
        [200, 200, 10],
      ])
    ).toThrow();
  });
});
