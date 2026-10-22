import { describe, it, expect } from "vitest";
import {
  quoteMaterials,
  defaultQuoteSettings,
  validateQuoteDraft,
  createQuoteDraft,
  modelAppearance,
} from "../frontend-vue/src/utils/quote-workspace.mjs";

function fixture() {
  const settings = defaultQuoteSettings();
  const slots = [
    { id: "s1", label: "白", hex: "#ffffff" },
    { id: "s2", label: "藍", hex: "#0055cc" },
  ];
  const layout = {
    ready: true,
    files: [{ name: "a.stl" }, { name: "b.stl" }],
    models: [
      {
        id: "a",
        name: "a.stl",
        dimensions: [10, 20, 30],
        transform: { x: 0, y: 0, z: 90, scale: 150, layFlat: false },
        position: { x: 30, y: 40 },
      },
      {
        id: "b",
        name: "b.stl",
        dimensions: [10, 20, 30],
        transform: { x: 0, y: 0, z: 0, scale: 100, layFlat: false },
        position: { x: 70, y: 40 },
      },
    ],
  };
  const assignments = {
    a: { quantity: 2, slotId: "s1", bands: [] },
    b: { quantity: 3, slotId: "s2", bands: [] },
  };
  return { settings, slots, layout, assignments };
}
describe("付費切片工作台前端契約", () => {
  it("提供六種 FDM 材料，PETG 預設，沒有虛構機型或價格", () => {
    const f = fixture(),
      draft = createQuoteDraft(f.layout, f.settings, f.slots, f.assignments);
    expect(quoteMaterials.map((m) => m.id)).toEqual([
      "PETG",
      "PLA",
      "ABS",
      "ASA",
      "TPU",
      "Nylon",
    ]);
    expect(draft.settings.material).toBe("PETG");
    expect(draft.machineProfileId).toBeNull();
    expect(draft.estimate).toBeNull();
    expect(draft.status).toBe("awaiting_machine_profile");
    expect(draft.referenceBed.isProductionBed).toBe(false);
    expect(draft.colorSlots).toHaveLength(1);
  });
  it("保留檔案順序、實際布局與每個模型數量，顏色不綁易變的陣列索引", () => {
    const f = fixture();
    f.settings.colorMode = "multi";
    f.assignments.a.bands = [{ from: 10, to: 20, slotId: "s2" }];
    const d = createQuoteDraft(f.layout, f.settings, f.slots, f.assignments);
    expect(d.models[0]).toMatchObject({
      id: "a",
      fileIndex: 0,
      quantity: 2,
      placement: { x: 30, y: 40 },
      baseSlotId: "s1",
      sourceTransform: { scale: 150 },
    });
    expect(d.models[1]).toMatchObject({
      id: "b",
      quantity: 3,
      baseSlotId: "s2",
    });
    expect(d.models[0].heightBands).toEqual([
      { from: 10, to: 20, slotId: "s2" },
    ]);
    f.layout.models.shift();
    f.layout.files.shift();
    expect(
      createQuoteDraft(f.layout, f.settings, f.slots, f.assignments).models[0]
    ).toMatchObject({ id: "b", fileIndex: 0, quantity: 3, baseSlotId: "s2" });
  });
  it("單色模式明確忽略暫存多色區間，預覽與匯出一致", () => {
    const f = fixture();
    f.assignments.a.bands = [{ from: 10, to: 20, slotId: "s2" }];
    expect(
      modelAppearance(f.layout.models, f.settings, f.slots, f.assignments).b
        .color
    ).toBe("#ffffff");
    const draft = createQuoteDraft(
      f.layout,
      f.settings,
      f.slots,
      f.assignments
    );
    expect(
      draft.models.every((m) => m.baseSlotId === "s1" && !m.heightBands.length)
    ).toBe(true);
    f.settings.colorMode = "multi";
    expect(
      modelAppearance(f.layout.models, f.settings, f.slots, f.assignments).a
        .bands
    ).toEqual([{ from: 10, to: 20, color: "#0055cc" }]);
  });
  it("阻擋過高、反向、重疊、空值、失效色槽與自動定向的換色設定", () => {
    const f = fixture();
    f.settings.colorMode = "multi";
    for (const bands of [
      [{ from: 10, to: 40, slotId: "s2" }],
      [{ from: 20, to: 10, slotId: "s2" }],
      [{ from: "", to: 10, slotId: "s2" }],
      [{ from: 1, to: 10, slotId: "missing" }],
      [
        { from: 0, to: 20, slotId: "s1" },
        { from: 10, to: 30, slotId: "s2" },
      ],
    ]) {
      f.assignments.a.bands = bands;
      expect(
        validateQuoteDraft(f.layout, f.settings, f.slots, f.assignments).length
      ).toBeGreaterThan(0);
    }
    f.assignments.a.bands = [
      { from: 0, to: 10, slotId: "s1" },
      { from: 10, to: 30, slotId: "s2" },
    ];
    expect(
      validateQuoteDraft(f.layout, f.settings, f.slots, f.assignments)
    ).toEqual([]);
    f.settings.autoOrient = true;
    expect(
      validateQuoteDraft(f.layout, f.settings, f.slots, f.assignments)
    ).toContain("高度換色需固定模型方向，請關閉切片器自動定向。");
  });
  it("阻擋不完整模型、錯誤品質數值、重複色槽與不合法數量", () => {
    const f = fixture();
    f.layout.ready = false;
    expect(() =>
      createQuoteDraft(f.layout, f.settings, f.slots, f.assignments)
    ).toThrow();
    f.layout.ready = true;
    f.settings.infill = "";
    f.settings.walls = 0;
    f.assignments.a.quantity = 1.5;
    expect(
      validateQuoteDraft(f.layout, f.settings, f.slots, f.assignments)
    ).toHaveLength(3);
    f.slots[1].id = "s1";
    expect(
      validateQuoteDraft(f.layout, f.settings, f.slots, f.assignments)
    ).toHaveLength(4);
  });
  it("匯出快照不隨後續編輯改動，不含檔案內容或登入憑證", () => {
    const f = fixture();
    const draft = createQuoteDraft(
      f.layout,
      f.settings,
      f.slots,
      f.assignments
    );
    f.settings.material = "PLA";
    f.layout.models[0].position.x = 100;
    f.slots[0].hex = "#000000";
    expect(draft.settings.material).toBe("PETG");
    expect(draft.models[0].placement.x).toBe(30);
    expect(draft.colorSlots[0].hex).toBe("#ffffff");
    expect(draft).not.toHaveProperty("files");
    expect(draft).not.toHaveProperty("customer");
    expect(draft).not.toHaveProperty("accessToken");
  });
});
