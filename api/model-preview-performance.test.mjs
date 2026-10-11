import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readFrontend = (path) =>
  readFile(new URL(`../frontend-vue/${path}`, import.meta.url), "utf8");

describe("quote model preview performance regressions", () => {
  it("keeps uploaded File objects outside Vue deep reactivity", async () => {
    const wizard = await readFrontend("src/views/quote/Wizard.vue");

    expect(wizard).toContain("import { markRaw } from 'vue'");
    expect(wizard).toContain("markRaw(item.raw)");
    expect(wizard).toContain("markRaw(item)");
  });

  it("parses STL geometry in a transferable web worker instead of the UI thread", async () => {
    const [viewer, worker] = await Promise.all([
      readFrontend("src/components/ModelViewer.vue"),
      readFrontend("src/workers/model-preview.worker.js"),
    ]);

    expect(viewer).toContain("new Worker(new URL('../workers/model-preview.worker.js', import.meta.url)");
    expect(viewer).toContain("postMessage({ id, buffer }, [buffer])");
    expect(viewer).not.toContain("new STLLoader().parse(buffer)");
    expect(worker).toContain("new STLLoader().parse(buffer)");
    expect(worker).toContain("postMessage({ id, parts }");
    expect(worker).toContain("transferables");
  });

  it("renders on demand and bounds resize work instead of running a permanent frame loop", async () => {
    const viewer = await readFrontend("src/components/ModelViewer.vue");

    expect(viewer).toContain("new ResizeObserver");
    expect(viewer).toContain("scheduleRender()");
    expect(viewer).not.toMatch(/const animate\s*=\s*\(\)\s*=>/);
    expect(viewer).not.toContain("window.addEventListener('resize'");
    expect(viewer).toContain("Math.min(window.devicePixelRatio || 1, 2)");
  });

  it("cancels stale loading work and frames models with scale-aware clipping planes", async () => {
    const viewer = await readFrontend("src/components/ModelViewer.vue");

    expect(viewer).toContain("this.loadSequence += 1");
    expect(viewer).toContain("this.modelWorker?.terminate()");
    expect(viewer).toContain("if (loadId !== this.loadSequence || this.viewerDisposed) return");
    expect(viewer).toContain("this.camera.near = Math.max(maxDim / 10000, 0.001)");
    expect(viewer).toContain("this.camera.far = Math.max(distance * 10, this.camera.near * 1000)");
  });
});
