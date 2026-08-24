import { describe, expect, it } from "vitest";
import { autoQuoteConfigSchema, computeAutoQuote, defaultAutoQuoteConfig, referencePartUsage } from "./pricing-engine.mjs";

const quote = (input, config) => computeAutoQuote(config || defaultAutoQuoteConfig, input);

describe("auto quote engine", () => {
  it("uses the weight tier that matches per-unit grams and multiplies by quantity for unit scope", () => {
    // 單組 300g 落在第一階 0.95；10 組總重 3000g 但階梯仍以單組 300g 判定
    const result = quote({ scope: "unit", grams: 300, minutes: 60, quantity: 10 });
    const weightLine = result.lines.find((line) => line.key === "base_weight");
    expect(weightLine.amount).toBeCloseTo(300 * 0.95 * 10, 2);
    expect(result.pricing.tierPricePerGram).toBe(0.95);
  });

  it("does not multiply by quantity again for whole-order scope", () => {
    const unit = quote({ scope: "unit", grams: 300, minutes: 60, quantity: 4 });
    const order = quote({ scope: "order", grams: 1200, minutes: 240, quantity: 4 });
    expect(order.total).toBe(unit.total);
    expect(order.input.totalGrams).toBe(1200);
  });

  it("picks a lower tier price when a single unit crosses the threshold", () => {
    const result = quote({ scope: "unit", grams: 600, minutes: 1, quantity: 1 });
    expect(result.pricing.tierPricePerGram).toBe(0.85);
  });

  it("base fee is MAX(weight, time, minimum)", () => {
    // 輕但久印：50g × 0.95 = 47.5；18hr × $15 = 270 → 機時勝出
    const longJob = quote({ scope: "unit", grams: 50, minutes: 18 * 60, quantity: 1 });
    expect(longJob.pricing.productionBase).toBe(270);
    const winnerLine = longJob.lines.find((line) => line.key === "base_time");
    expect(winnerLine.label).toContain("採用");
    // 重但快印：2000g 落在 ≤2999 階 $0.78 → 1560 > 機時與最低消費
    const heavy = quote({ scope: "unit", grams: 2000, minutes: 30, quantity: 1 });
    expect(heavy.pricing.productionBase).toBe(1560);
    // 三個候選只採計一個，不重複加總：總價應等於勝出者（無其他加成時）
    expect(heavy.total).toBe(1560);
  });

  it("applies business tier multiplier and enforces tier minimum charge after multiplier", () => {
    const small = { scope: "unit", grams: 60, minutes: 20, quantity: 1 }; // base = max(57, 5, 99) = 99 (economy min)
    const standard = quote({ ...small, businessTier: "standard" });
    // economy: base=99, multiplier=1 → 99
    const economy = quote(small);
    expect(economy.total).toBe(99);
    // standard: base=99×1.2=118.8 → 低於 standard 最低 180 → 補足到 180
    expect(standard.total).toBe(180);
    const premium = quote({ ...small, businessTier: "premium" });
    expect(premium.total).toBeGreaterThanOrEqual(230);
  });

  it("charges combined multi-color from the second color and separated from the fifth", () => {
    const combined = quote({ scope: "unit", grams: 100, minutes: 60, colorMode: "combined", colorCount: 3 });
    expect(combined.pricing.colorFee).toBe(2 * 50);
    const separated = quote({ scope: "unit", grams: 100, minutes: 60, colorMode: "separated", colorCount: 6 });
    expect(separated.pricing.colorFee).toBe(2 * 50);
    const single = quote({ scope: "unit", grams: 100, minutes: 60 });
    expect(single.pricing.colorFee).toBe(0);
  });

  it("lets specialists override billed new colors so already-charged colors are free", () => {
    const result = quote({ scope: "unit", grams: 100, minutes: 60, colorMode: "combined", colorCount: 4, billedNewColors: 1 });
    expect(result.pricing.colorFee).toBe(50);
  });

  it("applies rush percent to the production base only once", () => {
    const normal = quote({ scope: "unit", grams: 100, minutes: 60 });
    const rush = quote({ scope: "unit", grams: 100, minutes: 60, dueInHours: 48 });
    const base = normal.pricing.productionBase;
    expect(rush.lines.find((line) => line.key === "rush").amount).toBeCloseTo(base * 0.15, 0);
    expect(rush.pricing.rushPercent).toBe(15);
  });

  it("risk surcharge takes the highest candidate and never stacks", () => {
    // 80hr(+15%)、400mm(+10%)、支撐 50%(+15%) 同時成立 → 只取一個 +15%
    const result = quote({ scope: "unit", grams: 500, minutes: 80 * 60, maxSizeMm: 400, supportPercent: 50 });
    expect(result.pricing.risk.percent).toBe(15);
    const riskLines = result.lines.filter((line) => line.key === "risk");
    expect(riskLines.length).toBe(1);
  });

  it("quality responsibility applies only to functional jobs", () => {
    const appearance = quote({ scope: "unit", grams: 100, minutes: 60, quality: "appearance" });
    expect(appearance.pricing.qualityPercent).toBe(0);
    const functional = quote({ scope: "unit", grams: 100, minutes: 60, quality: "functional" });
    expect(functional.pricing.qualityPercent).toBe(12);
    expect(functional.lines.find((line) => line.key === "quality_responsibility").amount).toBeGreaterThan(0);
  });

  it("volume discount vs weight tier discount takes the better one without stacking", () => {
    // 30 組 × 100g：量產 -8% 可用。第一階價 = 0.95 → 替代重量費 = 3000g×0.95×0.92=2622；
    // 階梯價（單組100g→0.95）= 2850 → 改用量產折較優
    const result = quote({ scope: "unit", grams: 100, minutes: 60, quantity: 30 });
    expect(result.pricing.volumePercentApplied).toBe(8);
    expect(result.pricing.discountAmount).toBeGreaterThan(0);
    // 階梯已降到 $0.85（單組 800g），量產 -3% 替代方案（×0.95×0.97）不划算時不採用
    const tierBetter = quote({ scope: "unit", grams: 800, minutes: 5, quantity: 6 });
    expect(tierBetter.pricing.volumePercentApplied).toBe(0);
    expect(tierBetter.pricing.discountAmount).toBe(0);
  });

  it("prices configured services by quantity and flags unpriced services as escalations", () => {
    const result = quote({ scope: "unit", grams: 100, minutes: 60, services: ["assembly"], quantity: 3 });
    expect(result.lines.find((line) => line.key === "service_assembly").amount).toBe(300);
    const weird = quote({ scope: "unit", grams: 100, minutes: 60, services: ["chrome_plating"] });
    expect(weird.escalated).toBe(true);
    expect(weird.escalationReasons.some((reason) => reason.code === "service_unpriced")).toBe(true);
  });

  it("escalates on oversize, too many colors, support heavy, file repair, economy rush24 and large quantity", () => {
    const result = quote({
      scope: "unit",
      grams: 900,
      minutes: 30 * 60,
      quantity: 60,
      maxSizeMm: 420,
      colorMode: "combined",
      colorCount: 6,
      supportPercent: 40,
      fileRepair: true,
      dueInHours: 24
    });
    const codes = result.escalationReasons.map((reason) => reason.code);
    for (const code of ["oversize", "too_many_colors", "support_heavy", "file_repair", "economy_rush24", "large_quantity"]) {
      expect(codes).toContain(code);
    }
    expect(result.escalated).toBe(true);
    // 即使轉專員仍提供指示性金額
    expect(result.total).toBeGreaterThan(0);
  });

  it("adds manual extra fees and tax, then rounds the total", () => {
    const config = autoQuoteConfigSchema.parse({ taxPercent: 5, roundTo: 0 });
    const result = quote({ scope: "unit", grams: 100, minutes: 60, manualExtra: 200 }, config);
    expect(result.lines.find((line) => line.key === "manual_extra").amount).toBe(200);
    expect(Number.isInteger(result.total)).toBe(true);
    expect(result.lines.find((line) => line.key === "tax")).toBeTruthy();
  });

  it("reference part usage stays within sane bounds for the public wizard", () => {
    const usage = referencePartUsage({ infill: 15, walls: 2, support: false, quality: "Standard" });
    expect(usage.grams).toBeGreaterThan(25);
    expect(usage.minutes).toBeGreaterThanOrEqual(55);
  });
});
