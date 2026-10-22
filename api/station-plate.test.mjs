import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createStationPlate, validateStationPlate } from "./station-plate.mjs";
import { testStl } from "./test-helpers/stl.mjs";
import { arrangeModels, layoutWarning } from "../frontend-vue/src/utils/station-layout.mjs";

describe("manual and automatic station layouts", () => {
  it("writes separate 3MF objects with the exact UI plate coordinates", async () => {
    const bytes = await createStationPlate([testStl(), testStl()], [{ x: 40, y: 50 }, { x: 90, y: 100 }], false);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("3D/3dmodel.model").async("string");
    expect(xml).toContain('objectid="1" transform="1 0 0 0 1 0 0 0 1 40 50 0"');
    expect(xml).toContain('objectid="2" transform="1 0 0 0 1 0 0 0 1 90 100 0"');
    expect(xml.match(/<object /g)).toHaveLength(2);
  });
  it("rejects malformed coordinates, overlaps and out-of-bounds manual models", () => {
    expect(() => validateStationPlate([testStl()], undefined, false)).toThrow();
    expect(() => validateStationPlate([testStl()], [{ x: 2, y: 20 }], false)).toThrow(/邊界/);
    expect(() => validateStationPlate([testStl(), testStl()], [{ x: 130, y: 130 }, { x: 130, y: 130 }], false)).toThrow(/重疊/);
    const bad = testStl(); bad.writeFloatLE(NaN, 96);
    expect(() => validateStationPlate([bad], undefined, true)).toThrow(/無效/);
  });
  it("automatically packs models with a safe gap and detects impossible arrangements", () => {
    const dimensions = [[80,100,20],[120,80,30],[30,50,10]];
    const placements = arrangeModels(dimensions);
    expect(layoutWarning(dimensions.map((size, i) => ({ dimensions: size, position: placements[i] })))).toBe('');
    validateStationPlate(dimensions.map(size => testStl(...size)), placements, false);
    expect(arrangeModels([[10,20,30]])).toEqual([{ x: 130, y: 130 }]);
    expect(() => arrangeModels([[200,200,10],[200,200,10]])).toThrow();
  });
});
