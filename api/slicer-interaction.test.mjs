import { describe, expect, it } from "vitest";
import { slicingProgress } from "../frontend-vue/src/utils/slicing-progress.mjs";
import {
  resolveSlicerHelp,
  slicerHelpTopics,
} from "../frontend-vue/src/utils/slicer-help.mjs";
import { slicerSettingFields } from "../frontend-vue/src/utils/slicer-settings.mjs";
import { prepareStationModel } from "../frontend-vue/src/utils/prepare-station-model.js";
import {
  BoxGeometry,
  Mesh,
} from "../frontend-vue/node_modules/three/build/three.module.js";
import { STLExporter } from "../frontend-vue/node_modules/three/examples/jsm/exporters/STLExporter.js";

describe("honest slicing progress", () => {
  it("starts immediately and reports only measured upload percentages", () => {
    expect(slicingProgress({})).toBeNull();
    expect(slicingProgress({ uploading: true }).percent).toBeNull();
    for (const [uploadPercent, expected] of [
      [0, 0],
      [42, 42],
      [100, 100],
      [101, 100],
      [-1, 0],
      [NaN, null],
      [Infinity, null],
    ]) {
      expect(slicingProgress({ uploading: true, uploadPercent })).toMatchObject(
        { phase: "upload", percent: expected }
      );
    }
    expect(
      slicingProgress({ uploading: true, uploadPercent: 100 }).title
    ).toContain("建立工作");
  });
  it.each(["queued", "processing"])(
    "never invents a percentage for %s",
    (status) => {
      const state = slicingProgress({ job: { status } });
      expect(state.phase).toBe(status);
      expect(state.percent).toBeNull();
    }
  );
  it("distinguishes engine completion from preview readiness", () => {
    const job = { status: "completed" };
    expect(slicingProgress({ job, previewLoading: true })).toMatchObject({
      phase: "preview",
      step: 3,
      percent: null,
    });
    expect(slicingProgress({ job, preview: { layers: [] } })).toMatchObject({
      phase: "completed",
      step: 4,
      percent: 100,
    });
  });
  it.each(["failed", "cancelled"])(
    "stops without claiming completion for %s",
    (status) => {
      expect(slicingProgress({ job: { status } })).toMatchObject({
        phase: status,
        percent: null,
      });
    }
  );
  it("shows a paused retryable query instead of progress or a fake completion", () => {
    for (const status of ["queued", "processing", "completed"]) {
      expect(
        slicingProgress({ job: { status }, pollError: "網路中斷" })
      ).toMatchObject({ phase: "paused", percent: null, detail: "網路中斷" });
    }
    expect(slicingProgress({ error: "上傳失敗" })).toMatchObject({
      phase: "failed",
      step: 0,
      percent: null,
    });
    expect(slicingProgress({ job: { status: "unknown" } })).toBeNull();
  });
});
describe("contextual feature explanations", () => {
  it("covers every advanced field with its own nonempty explanation", () => {
    expect(new Set(slicerHelpTopics.map((t) => t.id)).size).toBe(
      slicerHelpTopics.length
    );
    for (const topic of slicerHelpTopics) {
      expect(topic.title.length).toBeGreaterThan(1);
      expect(topic.description.length).toBeGreaterThan(20);
      expect(topic.description).not.toContain("undefined");
    }
    for (const field of slicerSettingFields) {
      const topic = resolveSlicerHelp(field.label);
      expect(topic.id).toBe(field.id);
      expect(topic.description.length).toBeGreaterThan(30);
      expect(topic.description).not.toContain("undefined");
    }
    expect(resolveSlicerHelp("未實作的控制項")).toBeNull();
    expect(resolveSlicerHelp("還原所有進階參數").id).toBe("advanced-reset");
  });
  it("explains limitations and never confuses camera / playback with manufacturing", () => {
    expect(resolveSlicerHelp("立即自動朝向").description).toContain(
      "不必開始切片"
    );
    expect(resolveSlicerHelp("前視圖").description).toContain("不會修改模型");
    expect(resolveSlicerHelp("暫停路徑播放").description).toContain("不會啟動");
    expect(resolveSlicerHelp("隱藏 a.stl").description).toContain(
      "不會排除切片"
    );
    expect(resolveSlicerHelp("路徑線段進度").description).toContain(
      "不是雲端切片"
    );
  });
});
describe("immediate browser orientation uses the uploaded geometry", () => {
  it("lays the shortest bounding axis down before any slice API is called and preserves triangle identity", () => {
    const geometry = new BoxGeometry(10, 20, 30);
    const source = new STLExporter().parse(new Mesh(geometry), {
      binary: true,
    }).buffer;
    geometry.dispose();
    const initial = prepareStationModel(source, { scaleX: 150, mirrorX: true });
    const oriented = prepareStationModel(source, {
      scaleX: 150,
      mirrorX: true,
      layFlat: true,
    });
    expect(initial.dimensions).toEqual([15, 20, 30]);
    expect(oriented.dimensions[2]).toBeCloseTo(15);
    expect(oriented.effectiveScale).toEqual(initial.effectiveScale);
    expect(new DataView(oriented.buffer).getUint32(80, true)).toBe(12);
    expect(Buffer.from(oriented.buffer)).not.toEqual(
      Buffer.from(initial.buffer)
    );
    // Identical source / transform produces identical preview & upload bytes, no deferred CLI rotation.
    expect(
      Buffer.from(
        prepareStationModel(source, {
          scaleX: 150,
          mirrorX: true,
          layFlat: true,
        }).buffer
      )
    ).toEqual(Buffer.from(oriented.buffer));
  });
});
