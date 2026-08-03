import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseModelMetadata } from "./model-metadata.mjs";

// 建一個最小可用的多物件、多材質顏色 3MF（Bambu Studio/PrusaSlicer/Orca Slicer 匯出多色檔案的典型結構）
async function buildThreeMf({ objects, basematerials }) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`);
  zip.folder("_rels").file(".rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" Target="/3D/3dmodel.model"/></Relationships>`);
  const basematerialsXml = `<basematerials id="1">${basematerials.map((color) => `<base name="mat" displaycolor="${color}"/>`).join("")}</basematerials>`;
  const objectsXml = objects.map((object, index) => {
    const verticesXml = object.vertices.map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("");
    const pidAttr = object.pindex !== undefined ? ` pid="1" pindex="${object.pindex}"` : "";
    return `<object id="${index + 1}"${pidAttr} type="model"><mesh><vertices>${verticesXml}</vertices><triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object>`;
  }).join("");
  const modelXml = `<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${basematerialsXml}${objectsXml}</resources><build/></model>`;
  zip.folder("3D").file("3dmodel.model", modelXml);
  return zip.generateAsync({ type: "nodebuffer" });
}

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

  it("detects multiple disconnected shells in a single STL as separate parts", async () => {
    const stl = `solid two-parts
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 10 0 0
vertex 0 10 0
endloop
endfacet
facet normal 0 0 0
outer loop
vertex 100 100 100
vertex 110 100 100
vertex 100 110 100
endloop
endfacet
endsolid two-parts`;
    const metadata = await parseModelMetadata({ buffer: Buffer.from(stl), filename: "batch.stl", material: "PLA" });
    expect(metadata.partCount).toBe(2);
    expect(metadata.parts).toHaveLength(2);
    expect(metadata.parts[0].dimensions).toEqual([10, 10, 1]);
    expect(metadata.parts[1].dimensions).toEqual([10, 10, 1]);
  });

  it("does not report parts for a single connected shell", async () => {
    const stl = `solid single
facet normal 0 0 0
outer loop
vertex 0 0 0
vertex 40 0 0
vertex 0 20 10
endloop
endfacet
endsolid single`;
    const metadata = await parseModelMetadata({ buffer: Buffer.from(stl), filename: "single.stl", material: "PLA" });
    expect(metadata.parts).toBeUndefined();
    expect(metadata.partCount).toBeUndefined();
  });

  it("detects multiple objects in a 3MF and resolves each object's embedded material color", async () => {
    const buffer = await buildThreeMf({
      basematerials: ["#FF0000", "#0000FF"],
      objects: [
        { vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0]], pindex: 0 },
        { vertices: [[100, 100, 100], [110, 100, 100], [100, 110, 100]], pindex: 1 }
      ]
    });
    const metadata = await parseModelMetadata({ buffer, filename: "multi-color.3mf", material: "PLA" });
    expect(metadata.partCount).toBe(2);
    expect(metadata.parts[0]).toMatchObject({ index: 0, dimensions: [10, 10, 1], color: "#FF0000" });
    expect(metadata.parts[1]).toMatchObject({ index: 1, dimensions: [10, 10, 1], color: "#0000FF" });
  });

  it("omits color for 3MF objects with no material reference", async () => {
    const buffer = await buildThreeMf({
      basematerials: ["#00FF00"],
      objects: [
        { vertices: [[0, 0, 0], [10, 0, 0], [0, 10, 0]] },
        { vertices: [[100, 100, 100], [110, 100, 100], [100, 110, 100]] }
      ]
    });
    const metadata = await parseModelMetadata({ buffer, filename: "no-color.3mf", material: "PLA" });
    expect(metadata.partCount).toBe(2);
    expect(metadata.parts[0].color).toBeUndefined();
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
