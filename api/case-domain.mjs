import { randomUUID } from "node:crypto";
import { z } from "zod";

export const CASE_STATUSES = [
  "new",
  "under_review",
  "supplement_requested",
  "awaiting_customer",
  "formal_quote_sent",
  "accepted",
  "revision_requested",
  "awaiting_payment",
  "paid",
  "production_pending",
  "ready_to_print",
  "printing",
  "quality_check",
  "ready_for_delivery",
  "completed",
  "cancelled",
  "aftersales"
];

export const CASE_STATUS_LABELS = {
  new: "新案件",
  under_review: "審核中",
  supplement_requested: "等待補件",
  awaiting_customer: "等待客戶回覆",
  formal_quote_sent: "正式報價已送出",
  accepted: "客戶已接受",
  revision_requested: "客戶要求修改",
  awaiting_payment: "等待付款",
  paid: "已付款",
  production_pending: "待生產確認",
  ready_to_print: "可開始列印",
  printing: "列印中",
  quality_check: "品質檢查",
  ready_for_delivery: "待交付",
  completed: "已完成",
  cancelled: "已取消",
  aftersales: "售後處理"
};

const allowedTransitions = {
  new: ["under_review", "supplement_requested", "cancelled"],
  under_review: ["supplement_requested", "awaiting_customer", "formal_quote_sent", "cancelled"],
  supplement_requested: ["under_review", "cancelled"],
  awaiting_customer: ["under_review", "formal_quote_sent", "cancelled"],
  formal_quote_sent: ["accepted", "revision_requested", "cancelled"],
  accepted: ["awaiting_payment", "paid", "revision_requested", "cancelled"],
  revision_requested: ["under_review", "formal_quote_sent", "cancelled"],
  awaiting_payment: ["paid", "revision_requested", "cancelled"],
  paid: ["production_pending", "cancelled"],
  production_pending: ["ready_to_print", "supplement_requested", "cancelled"],
  ready_to_print: ["printing", "cancelled"],
  printing: ["quality_check", "cancelled"],
  quality_check: ["ready_to_print", "ready_for_delivery", "cancelled"],
  ready_for_delivery: ["completed", "aftersales"],
  completed: ["aftersales"],
  aftersales: ["completed", "production_pending", "cancelled"]
};

const trimmed = (max) => z.string().trim().max(max);
const optionalText = (max) => trimmed(max).optional().default("");

export const caseDefaultsSchema = z.object({
  material: optionalText(80),
  color: optionalText(80),
  quantity: z.coerce.number().int().min(1).max(10000).optional().default(1),
  quality: optionalText(40).transform((value) => value || "Standard"),
  layerHeight: optionalText(20),
  infill: z.coerce.number().min(0).max(100).optional().default(15),
  walls: z.coerce.number().int().min(1).max(12).optional().default(2),
  support: optionalText(40).transform((value) => value || "Auto"),
  postProcessing: z.array(trimmed(80)).max(20).optional().default([])
});

export const casePartSchema = z.object({
  id: optionalText(80),
  name: trimmed(160).min(1),
  fileId: optionalText(100),
  sourcePartIndexes: z.array(z.number().int().min(0)).max(256).optional().default([]),
  material: optionalText(80),
  color: optionalText(80),
  quantity: z.coerce.number().int().min(1).max(10000).optional(),
  quality: optionalText(40),
  layerHeight: optionalText(20),
  infill: z.coerce.number().min(0).max(100).optional(),
  walls: z.coerce.number().int().min(1).max(12).optional(),
  support: optionalText(40),
  postProcessing: z.array(trimmed(80)).max(20).optional(),
  notes: optionalText(1000),
  readiness: z.enum(["pending", "ready", "blocked"]).optional().default("pending")
});

export const caseIntakeSchema = z.object({
  mode: z.enum(["estimate", "agent"]).optional().default("estimate"),
  source: z.enum(["website", "line", "chatwoot", "staff", "shopify", "etsy", "ebay", "manual"]).optional().default("website"),
  hasModel: z.coerce.boolean(),
  customer: z.object({
    id: optionalText(100),
    name: trimmed(120).min(1),
    email: z.string().trim().email().optional().or(z.literal("")).default(""),
    phone: optionalText(60),
    lineUserId: optionalText(160),
    company: optionalText(120)
  }),
  project: trimmed(160).min(1),
  purpose: optionalText(2000),
  dueDate: optionalText(40),
  budget: z.coerce.number().min(0).optional().default(0),
  notes: optionalText(4000),
  defaults: caseDefaultsSchema,
  parts: z.array(casePartSchema).max(256).optional().default([]),
  fileIds: z.array(trimmed(100)).max(20).optional().default([]),
  modeling: z.object({
    sketches: z.array(trimmed(100)).max(20).optional().default([]),
    criticalDimensions: optionalText(2000),
    requirements: optionalText(4000)
  }).optional().default({}),
  chatwoot: z.object({
    accountId: trimmed(80).min(1),
    conversationId: trimmed(80).min(1),
    contactId: trimmed(80).min(1),
    inboxId: optionalText(80)
  }).optional()
}).superRefine((value, ctx) => {
  if (value.hasModel && value.fileIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["fileIds"], message: "有模型的案件至少需要一個已上傳檔案" });
  }
  if (!value.hasModel && !value.purpose && !value.modeling.requirements) {
    ctx.addIssue({ code: "custom", path: ["purpose"], message: "沒有模型的案件需要用途或建模需求" });
  }
});

export const quoteBreakdownSchema = z.object({
  material: z.coerce.number().min(0).default(0),
  machineTime: z.coerce.number().min(0).default(0),
  setup: z.coerce.number().min(0).default(0),
  modeling: z.coerce.number().min(0).default(0),
  postProcessing: z.coerce.number().min(0).default(0),
  multicolor: z.coerce.number().min(0).default(0),
  packing: z.coerce.number().min(0).default(0),
  shipping: z.coerce.number().min(0).default(0),
  risk: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  tax: z.coerce.number().min(0).default(0)
});

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function calculateQuoteTotal(input) {
  const breakdown = quoteBreakdownSchema.parse(input || {});
  const subtotal = money(
    breakdown.material + breakdown.machineTime + breakdown.setup + breakdown.modeling +
    breakdown.postProcessing + breakdown.multicolor + breakdown.packing +
    breakdown.shipping + breakdown.risk
  );
  return {
    ...breakdown,
    subtotal,
    total: money(Math.max(0, subtotal - breakdown.discount + breakdown.tax))
  };
}

export function createQuoteVersion(caseRecord, input, actor, now = new Date()) {
  const calculated = calculateQuoteTotal(input.breakdown);
  const versions = Array.isArray(caseRecord.quoteVersions) ? caseRecord.quoteVersions : [];
  for (const version of versions) {
    if (["draft", "sent"].includes(version.status)) version.status = "superseded";
  }
  const versionNo = versions.reduce((max, version) => Math.max(max, Number(version.versionNo || 0)), 0) + 1;
  const createdAt = now.toISOString();
  const validUntil = input.validUntil || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const version = {
    id: `qv-${randomUUID().slice(0, 12)}`,
    versionNo,
    status: input.send ? "sent" : "draft",
    currency: "TWD",
    breakdown: calculated,
    customerTotal: calculated.total,
    scope: String(input.scope || "").trim(),
    validUntil,
    approvedBy: String(actor?.email || actor?.name || "system"),
    createdAt,
    sentAt: input.send ? createdAt : ""
  };
  versions.push(version);
  caseRecord.quoteVersions = versions;
  caseRecord.currentQuoteVersionId = version.id;
  caseRecord.quotedValue = version.customerTotal;
  return version;
}

export function publicQuoteVersion(version) {
  if (!version) return null;
  return {
    id: version.id,
    versionNo: version.versionNo,
    status: version.status,
    currency: version.currency || "TWD",
    total: Number(version.customerTotal || 0),
    scope: version.scope || "",
    validUntil: version.validUntil,
    sentAt: version.sentAt || ""
  };
}

export function canTransitionCase(from, to) {
  if (!CASE_STATUSES.includes(from) || !CASE_STATUSES.includes(to)) {
    return { allowed: false, reason: "未知案件狀態" };
  }
  if (!(allowedTransitions[from] || []).includes(to)) {
    return { allowed: false, reason: `案件不可由「${CASE_STATUS_LABELS[from]}」直接變更為「${CASE_STATUS_LABELS[to]}」` };
  }
  return { allowed: true };
}

export function evaluateReadyToPrint(caseRecord) {
  const currentQuote = (caseRecord.quoteVersions || []).find((version) => version.id === caseRecord.currentQuoteVersionId);
  const paymentSatisfied = ["paid", "monthly_terms", "waived"].includes(caseRecord.paymentStatus);
  const slicerJob = (caseRecord.slicerJobs || []).find((job) => job.id === caseRecord.approvedSlicerJobId);
  const checks = {
    acceptedCurrentQuote: Boolean(currentQuote && currentQuote.status === "accepted"),
    paymentSatisfied,
    printerAssigned: Boolean(caseRecord.printerId),
    orcaSliceComplete: Boolean(slicerJob && slicerJob.engine === "OrcaSlicer" && slicerJob.status === "completed" && slicerJob.gcodeFileId),
    gcodeApproved: Boolean(slicerJob?.approvedAt && slicerJob?.approvedBy),
    allItemsReady: Boolean(caseRecord.parts?.length) && caseRecord.parts.every((part) => part.readiness === "ready")
  };
  const labels = {
    acceptedCurrentQuote: "目前報價版本尚未由客戶接受",
    paymentSatisfied: "付款或月結條件尚未完成",
    printerAssigned: "尚未指派印表機",
    orcaSliceComplete: "OrcaSlicer 尚未產生有效 G-code",
    gcodeApproved: "G-code 尚未經人員核准",
    allItemsReady: "仍有零件尚未完成生產準備"
  };
  const blockers = Object.entries(checks).filter(([, value]) => !value).map(([key]) => ({ key, message: labels[key] }));
  return { allowed: blockers.length === 0, checks, blockers };
}

export function formatCaseNumber(date = new Date(), sequence = 1) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type) => parts.find((part) => part.type === type)?.value || "00";
  return `Q-${value("year")}${value("month")}${value("day")}-${String(sequence).padStart(3, "0")}`;
}

export function normalizeTaiwanPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (/^8869\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return /^09\d{8}$/.test(digits) ? digits : "";
}

export function normalizeChatwootContext(input = {}) {
  const conversation = input.conversation || {};
  const contact = input.contact || {};
  const agent = input.agent || input.currentAgent || {};
  const context = {
    accountId: String(input.accountId || input.account_id || conversation.account_id || "").trim(),
    conversationId: String(input.conversationId || conversation.id || "").trim(),
    contactId: String(input.contactId || contact.id || "").trim(),
    inboxId: String(input.inboxId || conversation.inbox_id || "").trim(),
    contactName: String(contact.name || "").trim(),
    phone: normalizeTaiwanPhone(contact.phone_number || contact.phone),
    email: String(contact.email || "").trim().toLowerCase(),
    agentId: String(agent.id || "").trim(),
    agentName: String(agent.name || "").trim()
  };
  if (!context.accountId || !context.conversationId || !context.contactId) {
    throw new Error("Chatwoot 內容缺少帳號、對話或聯絡人識別碼");
  }
  return context;
}
