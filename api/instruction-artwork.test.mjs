import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import {
  instructionArtwork,
  instructionPlacements,
  instructionItems,
} from "../frontend-vue/src/content/instructionArtwork.mjs";
const read = (path) =>
  readFile(new URL("../frontend-vue/" + path, import.meta.url));

describe("image-model instruction illustrations", () => {
  it("ships sixteen distinct original image assets with traceable alpha-preserving encodes", async () => {
    const manifest = JSON.parse(
      await read("src/content/instructionArtworkAssets.json")
    );
    expect(manifest.generator).toBe("image_gen.imagegen");
    expect(Object.keys(instructionArtwork)).toHaveLength(16);
    expect(Object.keys(manifest.assets).sort()).toEqual(
      Object.keys(instructionArtwork).sort()
    );
    const hashes = new Set();
    for (const [id, asset] of Object.entries(manifest.assets)) {
      const bytes = await read(`public/images/instructions/${id}.webp`);
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        asset.webpSha256
      );
      expect(asset.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(asset.original).toMatch(/^exec-[a-f0-9-]+\.png$/);
      expect(asset.alpha).toBe(true);
      expect(asset.width).toBeGreaterThan(0);
      expect(asset.height).toBeGreaterThan(0);
      expect(bytes.length).toBe(asset.bytes);
      expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
      hashes.add(asset.webpSha256);
    }
    expect(hashes.size).toBe(16);
  });
  it("curates exactly two placements per illustration without unrelated fallbacks", () => {
    const counts = new Map();
    for (const [route, ids] of Object.entries(instructionPlacements)) {
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        expect(instructionArtwork[id], route).toBeTruthy();
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    expect(counts.size).toBe(16);
    for (const count of counts.values()) expect(count).toBe(2);
    expect(instructionItems("/privacy")).toEqual([]);
    expect(instructionItems("/terms")).toEqual([]);
    expect(instructionItems("/not-a-page")).toEqual([]);
    expect(instructionItems("/materials")[0].id).toBe("filament");
  });
  it("uses real image files, reserved dimensions and lazy loading instead of procedural art", async () => {
    const component = (
      await read("src/components/public/InstructionArt.vue")
    ).toString();
    expect(component).toContain("<img");
    expect(component).toContain('loading="lazy"');
    expect(component).toContain(':width="file?.width');
    expect(component).toContain(':height="file?.height');
    expect(component).toContain("decorative ?");
    expect(component).toContain("object-fit: contain");
    expect(component).not.toMatch(/<svg|<canvas|createElement\(['"]canvas/);
    expect(component).not.toContain("v-html");
  });
  it("does not mistake illustration examples for actual hardware or confirmed print capabilities", () => {
    expect(instructionArtwork.station.alt).toContain("非實際建築");
    expect(instructionArtwork.color.note).toContain("仍需確認");
    expect(instructionArtwork.pickup.note).toContain(
      "不把送出需求當作已保留名額"
    );
    expect(instructionArtwork.filament.title).toContain("PETG");
  });
});
