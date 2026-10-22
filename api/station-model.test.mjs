import { describe, expect, it } from "vitest";
import { BoxGeometry, Mesh } from "../frontend-vue/node_modules/three/build/three.module.js";
import { STLExporter } from "../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js";
import { STLLoader } from "../frontend-vue/node_modules/three/examples/jsm/loaders/STLLoader.js";
import { prepareStationModel } from "../frontend-vue/src/utils/prepare-station-model.js";

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
});
