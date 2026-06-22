import { describe, expect, it } from "vitest";
import { parseModelMetadata } from "./model-metadata.mjs";

describe("model metadata parser", () => {
  it("reads ASCII STL bounds and estimates production fields", async () => {
    const stl = `solid cube
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 40 0 0
vertex 0 20 10
endloop
endfacet
endsolid cube`;
    const metadata = await parseModelMetadata({ buffer: Buffer.from(stl), filename: "cube.stl", material: "PLA" });
    expect(metadata).toMatchObject({ type: "STL", dimensions: [40, 20, 10], sliced: false, status: "uploaded" });
    expect(metadata.estimateGrams).toBeGreaterThan(0);
    expect(metadata.quote).toBeGreaterThan(0);
  });

  it("reads G-code bounds and time comments", async () => {
    const gcode = `;TIME:7200
G1 X0 Y0 Z0.2
G1 X120 Y60 Z12
G1 X10 Y50 Z3`;
    const metadata = await parseModelMetadata({ buffer: Buffer.from(gcode), filename: "job.gcode", material: "PETG" });
    expect(metadata).toMatchObject({ type: "GCODE", dimensions: [120, 60, 11.8], sliced: true, status: "sliced", estimateMinutes: 120, printTime: "2h 00m" });
  });
});
