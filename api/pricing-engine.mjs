import { z } from "zod";

// ============================================================================
// 3DSTU FarmFlow 自動報價引擎 (Auto Quote Engine)
//
// 設計原則（來自定價討論結論）：
// 1. 基礎列印費 = MAX(重量階梯價, 機時價, 基本最低消費) —— 三者取高，防止「輕但久印」賠錢
// 2. 商務檔位倍率（經濟/標準/高檔）疊在基礎費上，各自有最低消費
// 3. 多色設定費：組合多色第 1 色免費；分開多色前 4 色免費；之後每色收設定費
//    （換色沖刷耗材/時間應反映在切片總克重與總時間，設定費只是管理費）
// 4. 急件加成 % 只作用於生產基本費
// 5. 生產風險加成（長工時/大尺寸/高支撐）取最高一項，絕不疊加
// 6. 品質責任費只對「功能/公差」案件收取；外觀優先的成本已反映在切片時間，不重複收
// 7. 量產折扣 vs 重量階梯折扣：兩者取對客戶較優的一種，不疊加（避免雙重折扣）
// 8. 分件數不計價——成本已反映在總克重與總時間
// 9. 超出自動服務範圍（超大、多色過多、需修檔、低檔急件等）→ 標記轉專員，
//    但仍回傳指示性金額供專員參考
// ============================================================================

const money = (value, roundTo = 1) => {
  const factor = 10 ** roundTo;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

// ---------------------------------------------------------------------------
// 設定 schema：全部可由專員透過 /api/costCatalog 調整
// （巢狀物件的預設值以「parse({}) 取得完整預設」方式掛入，相容 Zod v3/v4）
// ---------------------------------------------------------------------------
export const weightTierSchema = z.object({
  upToGrams: z.number().positive().nullable(), // null = 無上限（最後一階）
  pricePerGram: z.number().nonnegative()
});

const businessTierPolicySchema = z.object({
  multiplier: z.number().positive().default(1),
  minimumCharge: z.number().nonnegative().default(99)
});
const businessTiersSchema = z.object({
  economy: businessTierPolicySchema,
  standard: businessTierPolicySchema,
  premium: businessTierPolicySchema
});

const colorFeesSchema = z.object({
  combinedFreeCount: z.number().int().min(0).default(1),
  separatedFreeCount: z.number().int().min(0).default(4),
  feePerExtraColor: z.number().nonnegative().default(50)
});

const rushTierSchema = z.object({ dueInHours: z.number().int().positive(), percent: z.number().min(0).max(200) });
const rushTiersSchema = z.array(rushTierSchema);

const riskSurchargesSchema = z.object({
  longJobTiers: z
    .array(z.object({ aboveHours: z.number().nonnegative(), percent: z.number().min(0).max(200) }))
    .default([
      { aboveHours: 72, percent: 15 },
      { aboveHours: 48, percent: 10 },
      { aboveHours: 24, percent: 5 }
    ]),
  largeSizeThresholdMm: z.number().positive().default(350),
  largeSizePercent: z.number().min(0).max(200).default(10),
  supportPercentThreshold: z.number().min(0).max(100).default(35),
  supportRiskPercent: z.number().min(0).max(200).default(15)
});

const qualityResponsibilityPercentsSchema = z.object({
  standard: z.number().min(0).max(100).default(0),
  appearance: z.number().min(0).max(100).default(0),
  functional: z.number().min(0).max(100).default(12)
});

const volumeDiscountSchema = z.object({ minQty: z.number().int().positive(), percent: z.number().min(0).max(50) });
const volumeDiscountsSchema = z.array(volumeDiscountSchema);

const escalationSchema = z.object({
  maxSizeMm: z.number().positive().default(350),
  maxColorsCombined: z.number().int().positive().default(4),
  supportPercentThreshold: z.number().min(0).max(100).default(35),
  escalateEconomyRush24: z.boolean().default(true),
  largeQuantityThreshold: z.number().int().positive().default(50)
});

export const autoQuoteConfigSchema = z.object({
  enabled: z.boolean().default(true),
  currency: z.string().min(1).default("TWD"),
  // 重量階梯單價（每公克），由低到高，最後一階 upToGrams = null
  weightTiers: z.array(weightTierSchema).default([
    { upToGrams: 499, pricePerGram: 0.95 },
    { upToGrams: 999, pricePerGram: 0.85 },
    { upToGrams: 2999, pricePerGram: 0.78 },
    { upToGrams: null, pricePerGram: 0.7 }
  ]),
  machineHourlyRate: z.number().nonnegative().default(15),
  // 各商務檔位的倍率與最低消費
  businessTiers: businessTiersSchema.default(
    businessTiersSchema.parse({
      economy: { multiplier: 1, minimumCharge: 99 },
      standard: { multiplier: 1.2, minimumCharge: 180 },
      premium: { multiplier: 1.35, minimumCharge: 230 }
    })
  ),
  colorFees: colorFeesSchema.default(colorFeesSchema.parse({})),
  // 急件加成：dueInHours 符合的層級生效
  rushTiers: rushTiersSchema.default([
    { dueInHours: 24, percent: 30 },
    { dueInHours: 48, percent: 15 },
    { dueInHours: 72, percent: 8 }
  ]),
  // 生產風險加成候選（取最高，不疊加）
  riskSurcharges: riskSurchargesSchema.default(riskSurchargesSchema.parse({})),
  qualityResponsibilityPercents: qualityResponsibilityPercentsSchema.default(qualityResponsibilityPercentsSchema.parse({})),
  // 量產折扣（同款重複件）；與重量階梯折扣取優不疊加
  volumeDiscounts: volumeDiscountsSchema.default([
    { minQty: 5, percent: 3 },
    { minQty: 10, percent: 5 },
    { minQty: 20, percent: 8 }
  ]),
  // 固定價服務目錄（×組數）；未列出的服務由專員手動輸入
  serviceFees: z.record(z.string(), z.number().nonnegative()).default({
    assembly: 100,
    repair: 150,
    inspection: 50,
    photo: 80,
    packaging: 60,
    modeling: 800
  }),
  taxPercent: z.number().min(0).max(100).default(0),
  roundTo: z.number().int().min(0).max(2).default(0),
  // 轉專員門檻
  escalation: escalationSchema.default(escalationSchema.parse({}))
});

export const defaultAutoQuoteConfig = autoQuoteConfigSchema.parse({});

// ---------------------------------------------------------------------------
// 輸入 schema
// ---------------------------------------------------------------------------
export const autoQuoteInputSchema = z.object({
  scope: z.enum(["unit", "order"]).default("unit"), // unit=單組切片結果（會×組數）; order=整單切片總量（不再乘）
  grams: z.coerce.number().min(0),
  minutes: z.coerce.number().min(0),
  quantity: z.coerce.number().int().min(1).default(1), // 完整成品組數（分件不算）
  material: z.string().min(1).max(40).default("PETG"),
  businessTier: z.enum(["economy", "standard", "premium"]).default("economy"),
  colorMode: z.enum(["single", "combined", "separated"]).default("single"),
  colorCount: z.coerce.number().int().min(1).max(64).default(1),
  billedNewColors: z.coerce.number().int().min(0).max(64).optional(), // 專員指定本次要收費的新色數（已收過的顏色扣除）
  maxSizeMm: z.coerce.number().min(0).default(0),
  supportPercent: z.coerce.number().min(0).max(100).default(0),
  quality: z.enum(["standard", "appearance", "functional"]).default("standard"),
  dueInHours: z.coerce.number().int().positive().optional().nullable(),
  fileRepair: z.boolean().default(false),
  services: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  manualExtra: z.coerce.number().min(0).default(0) // 打磨外包等專員手填費用
});

// ---------------------------------------------------------------------------
// 公開詢價用的參考件用量模型（與舊版 reference-part 係數一致，集中在此維護）
// ---------------------------------------------------------------------------
export function referencePartUsage({ infill = 15, walls = 2, support = false, quality = "Standard" } = {}) {
  const REFERENCE_SHELL_GRAMS = 20;
  const REFERENCE_INFILL_GRAMS = 35;
  const REFERENCE_SUPPORT_GRAMS = 8;
  const REFERENCE_BASE_MINUTES = 55;
  const REFERENCE_INFILL_MINUTES = 35;
  const REFERENCE_WALL_MINUTES_PER_EXTRA_WALL = 6;
  const REFERENCE_SUPPORT_MINUTES = 12;
  const qualityFactor = { Draft: 0.85, Standard: 1, Fine: 1.25 }[quality] ?? 1;
  const infillRatio = infill / 100;
  const grams = REFERENCE_SHELL_GRAMS * (walls / 2) + REFERENCE_INFILL_GRAMS * infillRatio + (support ? REFERENCE_SUPPORT_GRAMS : 0);
  const minutes =
    (REFERENCE_BASE_MINUTES + REFERENCE_INFILL_MINUTES * infillRatio + REFERENCE_WALL_MINUTES_PER_EXTRA_WALL * (walls - 1) + (support ? REFERENCE_SUPPORT_MINUTES : 0)) *
    qualityFactor;
  return { grams: Math.round(grams * 10) / 10, minutes: Math.round(minutes) };
}

function weightTierPrice(config, gramsPerUnit) {
  for (const tier of config.weightTiers) {
    if (tier.upToGrams === null || gramsPerUnit <= tier.upToGrams) return tier.pricePerGram;
  }
  return config.weightTiers[config.weightTiers.length - 1].pricePerGram;
}

function volumeDiscountPercent(config, quantity) {
  let best = 0;
  for (const tier of config.volumeDiscounts) {
    if (quantity >= tier.minQty && tier.percent > best) best = tier.percent;
  }
  return best;
}

// ---------------------------------------------------------------------------
// 核心計算
// ---------------------------------------------------------------------------
export function computeAutoQuote(rawConfig, rawInput) {
  const config = autoQuoteConfigSchema.parse(rawConfig || {});
  const input = autoQuoteInputSchema.parse(rawInput || {});

  const lines = [];
  const escalations = [];
  const addLine = (key, label, amount, detail = "") => lines.push({ key, label, amount, detail });

  // -- 生產數量正規化：單組切片 × 組數；整單切片直接使用 --
  const scale = input.scope === "unit" ? input.quantity : 1;
  const totalGrams = money(input.grams * scale, 1);
  const totalMinutes = Math.round(input.minutes * scale);

  // -- 1) 重量階梯價：以「單組克重」決定適用階梯單價，再乘總量 --
  const perUnitGrams = input.scope === "unit" ? input.grams : totalGrams / input.quantity;
  const tierPrice = weightTierPrice(config, perUnitGrams);
  const weightFee = money(totalGrams * tierPrice, 2);

  // -- 2) 機時價 --
  const timeFee = money((totalMinutes / 60) * config.machineHourlyRate, 2);

  // -- 基本最低消費：基礎費用地板（經濟檔），檔位專屬地板在倍率後套用 --
  const tierConfig = config.businessTiers[input.businessTier];
  const baseFloor = config.businessTiers.economy.minimumCharge;

  // -- 基礎生產費 = MAX 三者取高（只採計勝出者；落選者僅列 0 元供對照，避免重複加總）--
  const baseCandidates = [
    { key: "weight", label: `重量階梯 $${tierPrice}/g × ${totalGrams}g`, amount: weightFee },
    { key: "time", label: `機時 $${config.machineHourlyRate}/hr × ${Math.round((totalMinutes / 60) * 10) / 10}hr`, amount: timeFee },
    { key: "minimum", label: `基本最低消費`, amount: baseFloor }
  ];
  const baseWinner = baseCandidates.reduce((a, b) => (b.amount > a.amount ? b : a));
  const productionBase = money(baseWinner.amount, 2);
  for (const candidate of baseCandidates) {
    if (candidate.key === baseWinner.key) {
      addLine(`base_${candidate.key}`, `基礎費（採用）${candidate.label}`, productionBase, "三者取高");
    } else {
      addLine(`base_${candidate.key}`, `${candidate.label}`, 0, `未採用（$${money(candidate.amount, 2)} < 採用值）`);
    }
  }

  // -- 4) 商務檔位倍率 --
  const afterMultiplier = money(productionBase * tierConfig.multiplier, 2);
  if (tierConfig.multiplier !== 1) {
    addLine("business_multiplier", `商務檔位 ×${tierConfig.multiplier}`, money(afterMultiplier - productionBase, 2));
  }

  // -- 檔位最低消費保護：倍率後仍不得低於該檔最低消費 --
  const minimumCharge = tierConfig.minimumCharge;
  const afterMinimum = Math.max(afterMultiplier, minimumCharge);
  if (afterMinimum > afterMultiplier) {
    addLine("tier_minimum", `${input.businessTier} 檔最低消費補足`, money(afterMinimum - afterMultiplier, 2));
  }

  // -- 5) 多色設定費（管理費；沖刷耗材已在切片重量內）--
  let colorFee = 0;
  if (input.colorMode !== "single") {
    const freeCount = input.colorMode === "combined" ? config.colorFees.combinedFreeCount : config.colorFees.separatedFreeCount;
    const newColors = input.billedNewColors ?? Math.max(0, input.colorCount - freeCount);
    colorFee = money(newColors * config.colorFees.feePerExtraColor, 2);
    addLine(
      "color_setup",
      `多色設定費（${input.colorMode === "combined" ? "組合" : "分開"}，前 ${freeCount} 色免費，本次計費新色 ${newColors} 色）`,
      colorFee,
      "$" + config.colorFees.feePerExtraColor + "/色"
    );
  }

  // -- 6) 急件加成 --
  let rushPercent = 0;
  if (input.dueInHours) {
    const rushTier = config.rushTiers.find((tier) => tier.dueInHours === input.dueInHours);
    if (!rushTier) escalations.push({ code: "rush_unconfigured", message: `交期 ${input.dueInHours} 小時未設定急件規則，請專員確認` });
    else if (rushTier.percent > 0) {
      rushPercent = rushTier.percent;
      addLine("rush", `急件加成（${input.dueInHours}hr +${rushPercent}%）`, money((afterMinimum * rushPercent) / 100, 2));
    }
  }

  // -- 7) 生產風險：長工時/大尺寸/高支撐 取最高，不疊加 --
  const hours = totalMinutes / 60;
  const longJobTier = [...config.riskSurcharges.longJobTiers].sort((a, b) => b.aboveHours - a.aboveHours).find((tier) => hours > tier.aboveHours);
  const riskCandidates = [];
  if (longJobTier) riskCandidates.push({ source: "long_job", label: `長工時風險（>${longJobTier.aboveHours}hr）`, percent: longJobTier.percent });
  if (input.maxSizeMm > config.riskSurcharges.largeSizeThresholdMm)
    riskCandidates.push({ source: "large_size", label: `大尺寸風險（> ${config.riskSurcharges.largeSizeThresholdMm}mm）`, percent: config.riskSurcharges.largeSizePercent });
  if (input.supportPercent > config.riskSurcharges.supportPercentThreshold)
    riskCandidates.push({ source: "support_heavy", label: `高支撐風險（支撐占比 ${input.supportPercent}%）`, percent: config.riskSurcharges.supportRiskPercent });
  const riskWinner = riskCandidates.length ? riskCandidates.reduce((a, b) => (b.percent > a.percent ? b : a)) : null;
  let riskFee = 0;
  if (riskWinner) {
    riskFee = money((afterMinimum * riskWinner.percent) / 100, 2);
    addLine("risk", `風險加成｜${riskWinner.label} +${riskWinner.percent}%（多重風險取最高）`, riskFee);
  }

  // -- 8) 品質責任費（僅 functional；外觀成本已在切片時間內）--
  const qualityPercent = config.qualityResponsibilityPercents[input.quality] ?? 0;
  const qualityFee = qualityPercent > 0 ? money((afterMinimum * qualityPercent) / 100, 2) : 0;
  if (qualityFee > 0) addLine("quality_responsibility", `功能／公差責任費 +${qualityPercent}%`, qualityFee);

  // -- 9) 固定價服務 ×組數 --
  let serviceTotal = 0;
  for (const service of input.services) {
    const unitFee = Number(config.serviceFees[service]);
    if (!Number.isFinite(unitFee)) {
      escalations.push({ code: "service_unpriced", message: `服務「${service}」未定價，請專員確認` });
      continue;
    }
    const amount = money(unitFee * input.quantity, 2);
    serviceTotal += amount;
    addLine(`service_${service}`, `服務｜${service}`, amount, `$${unitFee} × ${input.quantity} 組`);
  }

  // -- 10) 專員手填外部費用（打磨外包等）--
  if (input.manualExtra > 0) addLine("manual_extra", "外包／其他加購", money(input.manualExtra, 2));

  // -- 11) 量產折扣 vs 重量階梯折扣：取優不疊加 --
  let discountAmount = 0;
  const volumePercent = volumeDiscountPercent(config, input.quantity);
  if (volumePercent > 0) {
    // 若套用量產% 折扣作用於「以第一階單價計算的重量費」，比較何者較優：
    // A) 現況：階梯單價已降價的 weightFee，無量產折
    // B) 以最貴第一階單價計算的重量費 × (1 - volume%)
    const firstTierPrice = config.weightTiers[0].pricePerGram;
    const alternativeWeightFee = money(totalGrams * firstTierPrice * (1 - volumePercent / 100), 2);
    if (alternativeWeightFee < weightFee) {
      discountAmount = money(weightFee - alternativeWeightFee, 2);
      addLine("volume_discount", `改用量產折扣 -${volumePercent}%（較階梯價有利）`, -discountAmount);
    } else {
      addLine("volume_discount", `量產折扣 -${volumePercent}% 未採用（重量階梯價較優，不疊加）`, 0);
    }
  }

  // -- 加總 --
  const positiveLines = lines.filter((line) => line.amount > 0).reduce((sum, line) => sum + line.amount, 0);
  const subtotalBeforeTax = positiveLines - discountAmount;
  const tax = money((subtotalBeforeTax * config.taxPercent) / 100, 2);
  const total = money(Math.max(minimumCharge, subtotalBeforeTax + tax), config.roundTo);
  if (tax !== 0) addLine("tax", `稅額（${config.taxPercent}%）`, tax);
  addLine("total", "最終報價", total);

  // -- 轉專員評估 --
  const esc = config.escalation;
  if (input.maxSizeMm > esc.maxSizeMm) escalations.push({ code: "oversize", message: `最大邊長 ${input.maxSizeMm}mm 超過自動報價上限 ${esc.maxSizeMm}mm` });
  if (input.colorMode === "combined" && input.colorCount > esc.maxColorsCombined)
    escalations.push({ code: "too_many_colors", message: `組合多色 ${input.colorCount} 色超過自動上限 ${esc.maxColorsCombined} 色` });
  if (input.supportPercent > esc.supportPercentThreshold) escalations.push({ code: "support_heavy", message: `支撐占比 ${input.supportPercent}% 建議專員評估` });
  if (input.fileRepair) escalations.push({ code: "file_repair", message: "檔案需要修復，請專員確認" });
  if (esc.escalateEconomyRush24 && input.businessTier === "economy" && input.dueInHours === 24)
    escalations.push({ code: "economy_rush24", message: "經濟檔 + 24 小時急件，請專員確認可行性" });
  if (input.quantity >= esc.largeQuantityThreshold)
    escalations.push({ code: "large_quantity", message: `${input.quantity} 組大量件，建議專員議價` });

  return {
    ok: true,
    escalated: escalations.length > 0,
    escalationReasons: escalations,
    currency: config.currency,
    input: { ...input, totalGrams, totalMinutes },
    pricing: {
      tierPricePerGram: tierPrice,
      productionBase,
      businessMultiplier: tierConfig.multiplier,
      colorFee,
      rushPercent,
      risk: riskWinner ? { ...riskWinner } : null,
      qualityPercent,
      serviceTotal,
      discountAmount,
      volumePercentApplied: discountAmount > 0 ? volumePercent : 0,
      tax,
      minimumCharge
    },
    lines,
    total
  };
}
