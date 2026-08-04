import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const caseView = path.join(root, "frontend-vue", "src", "views", "cases", "index.vue");

describe("案件中心操作面板", () => {
  it("以繁體中文呈現排程、列印、品管與售後操作", async () => {
    const source = await readFile(caseView, "utf8");

    expect(source).toContain("帶入系統排程建議");
    expect(source).toContain("列印排程");
    expect(source).toContain("確認排程");
    expect(source).toContain("開始列印");
    expect(source).toContain("列印作業");
    expect(source).toContain("記錄列印完成");
    expect(source).toContain("品質檢查");
    expect(source).toContain("品管失敗，建立重印");
    expect(source).toContain("售後服務");
    expect(source).toContain("建立售後重印案件");
    expect(source).not.toMatch(/\?{2,}/);
  });
});
