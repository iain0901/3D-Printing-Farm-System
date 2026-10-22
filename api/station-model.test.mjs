import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh } from "../frontend-vue/node_modules/three/build/three.module.js";
import { STLExporter } from "../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "../frontend-vue/node_modules/three/examples/jsm/loaders/STLLoader.js";
import { prepareStationModel } from "../frontend-vue/src/utils/prepare-station-model.js";
import { testStl } from "./test-helpers/stl.mjs";

describe("station model geometry sent to the slicer", () => {
  const geometry = new BoxGeometry(10, 20, 30);
  const source = new STLExporter().parse(new Mesh(geometry), { binary: true }).buffer;
  geometry.dispose();
  it("applies scale and rotation to uploaded bytes, places the actual result on the bed", () => {
    const result = prepareStationModel(source, { scale: 200, x: 90 });
    expect(result.dimensions).toEqual([20, 60, 40]);
    const parsed = new STLLoader().parse(result.buffer);
    parsed.computeBoundingBox();
    expect(parsed.boundingBox.min.z).toBe(0);
    expect(parsed.boundingBox.max.z).toBe(40);
    parsed.dispose();
    expect(prepareStationModel(source).dimensions).toEqual([10, 20, 30]);
  });
  it("rejects invalid transforms and malformed models", () => {
    expect(() => prepareStationModel(source, { scale: 0 })).toThrow();
    expect(() => prepareStationModel(source, { x: Infinity })).toThrow();
    expect(() => prepareStationModel(new ArrayBuffer(0))).toThrow();
  });
  it("automatically lays the shortest axis onto height while preserving volume and scale", () => {
    expect(prepareStationModel(source, { layFlat: true }).dimensions.map(v => Math.round(v))).toEqual([30,20,10]);
    expect(prepareStationModel(source, { scale: 200, layFlat: true }).dimensions.map(v => Math.round(v))).toEqual([60,40,20]);
  });
  it("recenters asymmetric rotated meshes so UI positions match 3MF build transforms", () => {
    const source = testStl();
    const result = prepareStationModel(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), { x: 40, y: 20 });
    const model = new STLLoader().parse(result.buffer); model.computeBoundingBox();
    expect(model.boundingBox.min.x + model.boundingBox.max.x).toBeCloseTo(0, 4);
    expect(model.boundingBox.min.y + model.boundingBox.max.y).toBeCloseTo(0, 4);
    expect(model.boundingBox.min.z).toBeCloseTo(0, 4);
    model.dispose();
  });
});
