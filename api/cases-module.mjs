import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  CASE_STATUSES,
  canTransitionCase,
  caseIntakeSchema,
  createQuoteVersion,
  evaluateReadyToPrint,
  formatCaseNumber,
  normalizeChatwootContext,
  publicQuoteVersion
} from "./case-domain.mjs";

const DEFAULT_WORKSPACE_ID = "ws-default";
const tokenDigest = (value) => createHash("sha256").update(String(value || "")).digest("hex");
const nowIso = () => new Date().toISOString();

function safeTokenMatches(record, token) {
  const expected = Buffer.from(String(record.publicAccessTokenHash || ""), "hex");
  const actual = Buffer.from(tokenDigest(token), "hex");
  return expected.length === actual.length && expected.length > 0 && timingSafeEqual(expected, actual);
}

function inWorkspace(item, workspaceId) {
  return (item.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId;
}

function ensureCollections(data) {
  for (const key of ["cases", "caseStatusHistory", "chatwootCaseLinks", "afterSalesCases", "files", "customers", "queue", "events"]) {
    if (!Array.isArray(data[key])) data[key] = [];
  }
}

function appendEvent(database, type, message, data, actor, workspaceId) {
  database.data.events.unshift({
    id: randomUUID(),
    type,
    message,
    data,
    actor: actor?.email || actor?.name || "public",
    workspaceId,
    at: nowIso()
  });
}

function appendStatusHistory(database, caseRecord, from, to, actor, reason = "") {
  const entry = {
    id: `csh-${randomUUID().slice(0, 12)}`,
    workspaceId: caseRecord.workspaceId,
    caseId: caseRecord.id,
    from,
    to,
    reason,
    actorId: actor?.id || "",
    actorName: actor?.name || actor?.email || "public",
    at: nowIso()
  };
  database.data.caseStatusHistory.unshift(entry);
  caseRecord.statusHistory ||= [];
  caseRecord.statusHistory.push(entry);
  return entry;
}

function transitionCase(database, caseRecord, target, actor, reason = "", options = {}) {
  const result = canTransitionCase(caseRecord.status, target);
  if (!result.allowed && !options.override) return result;
  const from = caseRecord.status;
  caseRecord.status = target;
  caseRecord.updatedAt = nowIso();
  appendStatusHistory(database, caseRecord, from, target, actor, reason || (options.override ? "管理員覆寫" : ""));
  appendEvent(database, "case.status_changed", `${caseRecord.caseNo} changed from ${from} to ${target}`, {
    caseId: caseRecord.id,
    caseNo: caseRecord.caseNo,
    from,
    to: target,
    reason,
    override: Boolean(options.override)
  }, actor, caseRecord.workspaceId);
  return { allowed: true };
}

function findCase(database, id, workspaceId) {
  return database.data.cases.find((item) => item.id === id && inWorkspace(item, workspaceId));
}

function nextCaseNumber(data, workspaceId, at = new Date()) {
  const prefix = formatCaseNumber(at, 0).slice(0, -3);
  const sequence = (data.cases || []).filter((item) => inWorkspace(item, workspaceId) && String(item.caseNo || "").startsWith(prefix)).length + 1;
  return formatCaseNumber(at, sequence);
}

function normalizePart(part, defaults, index, fileIds) {
  const value = (key) => part[key] === undefined || part[key] === "" ? defaults[key] : part[key];
  return {
    id: part.id || `part-${randomUUID().slice(0, 12)}`,
    name: part.name || `零件 ${index + 1}`,
    fileId: part.fileId || fileIds[index] || fileIds[0] || "",
    sourcePartIndexes: part.sourcePartIndexes || [],
    material: value("material"),
    color: value("color"),
    quantity: value("quantity"),
    quality: value("quality"),
    layerHeight: value("layerHeight"),
    infill: value("infill"),
    walls: value("walls"),
    support: value("support"),
    postProcessing: value("postProcessing") || [],
    notes: part.notes || "",
    readiness: part.readiness || "pending"
  };
}

function upsertCustomer(data, input, workspaceId) {
  const normalizedEmail = String(input.email || "").trim().toLowerCase();
  const normalizedPhone = String(input.phone || "").replace(/\D/g, "");
  let customer = input.id ? data.customers.find((item) => item.id === input.id && inWorkspace(item, workspaceId)) : null;
  customer ||= data.customers.find((item) => inWorkspace(item, workspaceId) && (
    normalizedEmail && String(item.email || "").toLowerCase() === normalizedEmail ||
    normalizedPhone && String(item.phone || "").replace(/\D/g, "") === normalizedPhone ||
    input.lineUserId && item.lineUserId === input.lineUserId
  ));
  const now = nowIso();
  if (!customer) {
    customer = {
      id: `cus-${randomUUID().slice(0, 12)}`,
      workspaceId,
      name: input.name,
      email: normalizedEmail,
      phone: input.phone || "",
      lineUserId: input.lineUserId || "",
      company: input.company || "",
      addresses: [],
      loyaltyPoints: 0,
      tags: ["3drfm-case"],
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now
    };
    data.customers.unshift(customer);
  } else {
    Object.assign(customer, {
      name: input.name || customer.name,
      email: normalizedEmail || customer.email,
      phone: input.phone || customer.phone,
      lineUserId: input.lineUserId || customer.lineUserId,
      company: input.company || customer.company,
      updatedAt: now,
      lastActivityAt: now
    });
  }
  return customer;
}

export function publicCase(caseRecord) {
  const currentQuote = (caseRecord.quoteVersions || []).find((version) => version.id === caseRecord.currentQuoteVersionId);
  return {
    id: caseRecord.id,
    caseNo: caseRecord.caseNo,
    project: caseRecord.project,
    status: caseRecord.status,
    mode: caseRecord.mode,
    source: caseRecord.source,
    parts: (caseRecord.parts || []).map((part) => ({
      id: part.id,
      name: part.name,
      material: part.material,
      color: part.color,
      quantity: part.quantity,
      quality: part.quality,
      readiness: part.readiness
    })),
    quote: publicQuoteVersion(currentQuote),
    paymentStatus: caseRecord.paymentStatus,
    delivery: caseRecord.delivery ? {
      method: caseRecord.delivery.method,
      status: caseRecord.delivery.status,
      carrier: caseRecord.delivery.carrier || "",
      trackingNumber: caseRecord.delivery.trackingNumber || ""
    } : null,
    createdAt: caseRecord.createdAt,
    updatedAt: caseRecord.updatedAt
  };
}

export function createCaseFromIntake(database, intake, { workspaceId = DEFAULT_WORKSPACE_ID, uploadResults = [], actor = null } = {}) {
  ensureCollections(database.data);
  const customer = upsertCustomer(database.data, intake.customer, workspaceId);
  const now = new Date();
  const accessToken = randomBytes(24).toString("base64url");
  const sourceParts = intake.parts.length ? intake.parts : [{ name: intake.project, fileId: intake.fileIds[0] || "" }];
  const technicalReviewReasons = uploadResults.flatMap((result) => result.technicalReviewReason ? [result.technicalReviewReason] : []);
  const caseRecord = {
    id: `case-${randomUUID().slice(0, 12)}`,
    caseNo: nextCaseNumber(database.data, workspaceId, now),
    workspaceId,
    customerId: customer.id,
    customerSnapshot: { name: customer.name, email: customer.email, phone: customer.phone, company: customer.company || "", lineUserId: customer.lineUserId || "" },
    project: intake.project,
    purpose: intake.purpose,
    mode: intake.mode,
    source: intake.source,
    hasModel: intake.hasModel,
    dueDate: intake.dueDate,
    budget: intake.budget,
    notes: intake.notes,
    defaults: intake.defaults,
    modeling: intake.modeling,
    fileIds: intake.fileIds,
    parts: sourceParts.map((part, index) => normalizePart(part, intake.defaults, index, intake.fileIds)),
    status: technicalReviewReasons.length ? "under_review" : "new",
    priority: "Normal",
    assigneeId: "",
    quoteVersions: [],
    currentQuoteVersionId: "",
    payments: [],
    paymentStatus: "unpaid",
    slicerJobs: [],
    approvedSlicerJobId: "",
    printerId: "",
    productionJobIds: [],
    printAttempts: [],
    qcChecks: [],
    delivery: null,
    afterSalesCaseIds: [],
    chatwoot: intake.chatwoot || null,
    technicalReviewRequired: technicalReviewReasons.length > 0,
    technicalReviewReasons,
    publicAccessTokenHash: tokenDigest(accessToken),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    statusHistory: []
  };
  database.data.cases.unshift(caseRecord);
  appendStatusHistory(database, caseRecord, "", caseRecord.status, actor, technicalReviewReasons.join("; "));
  if (intake.chatwoot) {
    database.data.chatwootCaseLinks.unshift({
      id: `cwl-${randomUUID().slice(0, 12)}`,
      workspaceId,
      caseId: caseRecord.id,
      ...intake.chatwoot,
      linkedAt: now.toISOString()
    });
  }
  appendEvent(database, "case.created", `${caseRecord.caseNo} created`, { caseId: caseRecord.id, source: caseRecord.source, customerId: customer.id }, actor, workspaceId);
  return { caseRecord, customer, accessToken };
}

function customerOwnsCase(caseRecord, customer) {
  const customerEmail = String(customer?.email || "").trim().toLowerCase();
  const caseEmail = String(caseRecord?.customerSnapshot?.email || "").trim().toLowerCase();
  return caseRecord?.customerId === customer?.id || Boolean(customerEmail && customerEmail === caseEmail);
}

function applyCustomerDecision(database, caseRecord, customer, decision, note) {
  const target = decision === "accepted" ? "accepted" : "revision_requested";
  const result = transitionCase(database, caseRecord, target, { id: customer.id, name: customer.name, email: customer.email }, note);
  if (!result.allowed) return result;
  const quote = (caseRecord.quoteVersions || []).find((version) => version.id === caseRecord.currentQuoteVersionId);
  if (quote) quote.status = decision === "accepted" ? "accepted" : "revision_requested";
  return { allowed: true };
}

async function parseIntake(request, storeCaseFile, workspaceId) {
  if (!request.isMultipart?.()) return { input: request.body || {}, uploadResults: [] };
  const uploadResults = [];
  let input = null;
  const looseFields = {};
  for await (const part of request.parts({ limits: { fileSize: 100 * 1024 * 1024, files: 20 } })) {
    if (part.type === "file") {
      const buffer = await part.toBuffer();
      if (!buffer.length) continue;
      const uploaded = await storeCaseFile({
        filename: part.filename,
        buffer,
        material: String(looseFields.material || "PLA"),
        workspaceId
      });
      uploadResults.push(uploaded);
      continue;
    }
    if (part.fieldname === "payload") {
      input = JSON.parse(String(part.value || "{}"));
    } else {
      looseFields[part.fieldname] = part.value;
    }
  }
  input ||= looseFields;
  input.fileIds = [...(Array.isArray(input.fileIds) ? input.fileIds : []), ...uploadResults.map((item) => item.file.id)];
  return { input, uploadResults };
}

const statusInputSchema = z.object({
  status: z.enum(CASE_STATUSES),
  reason: z.string().trim().max(1000).optional().default(""),
  override: z.boolean().optional().default(false)
});

const quoteVersionInputSchema = z.object({
  breakdown: z.record(z.string(), z.coerce.number().min(0)).default({}),
  scope: z.string().trim().max(4000).optional().default(""),
  validUntil: z.string().datetime().optional(),
  send: z.boolean().optional().default(false)
});

const paymentInputSchema = z.object({
  status: z.enum(["unpaid", "paid", "monthly_terms", "waived", "refunded"]),
  method: z.enum(["bank_transfer", "cash", "line_pay", "jkopay", "payuni", "monthly_terms", "waived", "refund"]),
  amount: z.coerce.number().min(0),
  reference: z.string().trim().max(200).optional().default(""),
  note: z.string().trim().max(1000).optional().default("")
});

const schedulingSuggestionSchema = z.object({
  suggestedStartAt: z.string().datetime(),
  suggestedPrinterId: z.string().trim().min(1).max(100),
  estimatedMinutes: z.coerce.number().int().min(1).max(60 * 24 * 30),
  reason: z.string().trim().max(1000).optional().default("")
});

const scheduleConfirmationSchema = z.object({
  startAt: z.string().datetime(),
  printerId: z.string().trim().min(1).max(100),
  note: z.string().trim().max(1000).optional().default("")
});

const printAttemptSchema = z.object({
  action: z.enum(["started", "completed", "failed"]),
  queueJobId: z.string().trim().max(100).optional().default(""),
  partIds: z.array(z.string().trim().min(1).max(100)).min(1).max(256).optional(),
  note: z.string().trim().max(4000).optional().default(""),
  telemetry: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({})
});

const qualityCheckSchema = z.object({
  parts: z.array(z.object({
    partId: z.string().trim().min(1).max(100),
    result: z.enum(["passed", "failed"]),
    notes: z.string().trim().max(2000).optional().default(""),
    photoFileIds: z.array(z.string().trim().min(1).max(100)).max(30).optional().default([])
  })).min(1).max(256),
  reprint: z.boolean().optional().default(false),
  note: z.string().trim().max(4000).optional().default("")
});

const deliverySchema = z.object({
  method: z.enum(["pickup", "courier", "internal_delivery"]),
  status: z.enum(["pending", "ready", "shipped", "delivered", "returned"]),
  carrier: z.string().trim().max(100).optional().default(""),
  trackingNumber: z.string().trim().max(200).optional().default(""),
  note: z.string().trim().max(2000).optional().default("")
});

const afterSalesSchema = z.object({
  type: z.enum(["reprint", "defect", "delivery", "refund", "other"]),
  description: z.string().trim().min(1).max(4000),
  reopenProduction: z.boolean().optional().default(false)
});

const preliminaryEstimateSchema = z.object({
  material: z.string().trim().min(1).max(80).default("PLA"),
  quantity: z.coerce.number().int().min(1).max(10000).default(1),
  quality: z.enum(["Draft", "Standard", "Fine"]).default("Standard"),
  infill: z.coerce.number().min(0).max(100).default(15),
  walls: z.coerce.number().int().min(1).max(12).default(2),
  support: z.boolean().default(false),
  postProcessing: z.array(z.string().trim().max(80)).max(20).default([]),
  hasModel: z.boolean().default(true),
  rush: z.boolean().default(false)
});

export async function registerCaseRoutes(app, options) {
  const { database, storeCaseFile, storeGcodeFile, readCaseFile, hasValidWorkerToken, customerFromRequest } = options;
  ensureCollections(database.data);

  app.post("/api/public/cases/estimate", { config: { rateLimit: { max: 120, timeWindow: "1 minute", groupId: "case-estimate" } } }, async (request, reply) => {
    const parsed = preliminaryEstimateSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "估價條件格式錯誤", issues: parsed.error.issues });
    const value = parsed.data;
    const materialFactor = { PLA: 1, PETG: 1.18, ABS: 1.2, ASA: 1.35, TPU: 1.65, Resin: 1.8, Nylon: 2.1 }[value.material] || 1.25;
    const qualityFactor = { Draft: 0.85, Standard: 1, Fine: 1.35 }[value.quality];
    const geometryFactor = 1 + value.infill / 180 + Math.max(0, value.walls - 2) * 0.08 + (value.support ? 0.18 : 0);
    const processingAmount = value.postProcessing.length * 120 * value.quantity;
    const modelingAmount = value.hasModel ? 0 : 800;
    const base = 220 * value.quantity * materialFactor * qualityFactor * geometryFactor + processingAmount + modelingAmount;
    const total = Math.max(300, Math.round(base * (value.rush ? 1.25 : 1)));
    return { ok: true, estimate: { currency: "TWD", total, kind: "preliminary", requiresSpecialistApproval: true } };
  });

  app.post("/api/public/cases", { config: { rateLimit: { max: 20, timeWindow: "1 minute", groupId: "case-intake" } } }, async (request, reply) => {
    const workspaceId = DEFAULT_WORKSPACE_ID;
    let parsedIncoming;
    try {
      parsedIncoming = await parseIntake(request, storeCaseFile, workspaceId);
    } catch (error) {
      return reply.code(400).send({ error: "案件檔案或表單內容格式錯誤", detail: error.message });
    }
    const parsed = caseIntakeSchema.safeParse(parsedIncoming.input);
    if (!parsed.success) return reply.code(400).send({ error: "案件資料未完成", issues: parsed.error.issues });
    const created = createCaseFromIntake(database, parsed.data, { workspaceId, uploadResults: parsedIncoming.uploadResults });
    await database.write();
    return reply.code(201).send({ ok: true, case: publicCase(created.caseRecord), accessToken: created.accessToken });
  });

  app.get("/api/public/cases/:id", async (request, reply) => {
    const caseRecord = database.data.cases.find((item) => item.id === request.params.id && inWorkspace(item, DEFAULT_WORKSPACE_ID));
    if (!caseRecord || !safeTokenMatches(caseRecord, request.query?.token)) return reply.code(404).send({ error: "案件不存在" });
    return { ok: true, case: publicCase(caseRecord) };
  });

  app.post("/api/public/cases/:id/decision", async (request, reply) => {
    const parsed = z.object({
      token: z.string().min(20),
      decision: z.enum(["accepted", "revision"]),
      note: z.string().trim().max(1000).optional().default("")
    }).safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "客戶決定格式錯誤", issues: parsed.error.issues });
    const caseRecord = database.data.cases.find((item) => item.id === request.params.id && inWorkspace(item, DEFAULT_WORKSPACE_ID));
    if (!caseRecord || !safeTokenMatches(caseRecord, parsed.data.token)) return reply.code(404).send({ error: "案件不存在" });
    const result = applyCustomerDecision(database, caseRecord, caseRecord.customerSnapshot, parsed.data.decision, parsed.data.note);
    if (!result.allowed) return reply.code(409).send({ error: result.reason });
    await database.write();
    return { ok: true, case: publicCase(caseRecord) };
  });

  if (customerFromRequest) {
    const decisionSchema = z.object({
      decision: z.enum(["accepted", "revision"]),
      note: z.string().trim().max(1000).optional().default("")
    });

    app.get("/api/customer/cases", async (request, reply) => {
      const { customer } = customerFromRequest(database, request);
      if (!customer) return reply.code(401).send({ error: "Authentication required" });
      const cases = database.data.cases
        .filter((item) => inWorkspace(item, customer.workspaceId || DEFAULT_WORKSPACE_ID) && customerOwnsCase(item, customer))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map(publicCase);
      return { cases, total: cases.length };
    });

    app.post("/api/customer/cases/:id/decision", async (request, reply) => {
      const { customer } = customerFromRequest(database, request);
      if (!customer) return reply.code(401).send({ error: "Authentication required" });
      const parsed = decisionSchema.safeParse(request.body || {});
      if (!parsed.success) return reply.code(400).send({ error: "Invalid case decision payload", issues: parsed.error.issues });
      const caseRecord = database.data.cases.find((item) => item.id === request.params.id && inWorkspace(item, customer.workspaceId || DEFAULT_WORKSPACE_ID) && customerOwnsCase(item, customer));
      if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
      const result = applyCustomerDecision(database, caseRecord, customer, parsed.data.decision, parsed.data.note);
      if (!result.allowed) return reply.code(409).send({ error: result.reason });
      await database.write();
      return { ok: true, case: publicCase(caseRecord) };
    });
  }

  app.get("/api/cases", async (request) => {
    const workspaceId = request.user.workspaceId || DEFAULT_WORKSPACE_ID;
    const status = String(request.query?.status || "").trim();
    const search = String(request.query?.search || "").trim().toLowerCase();
    const cases = database.data.cases.filter((item) => inWorkspace(item, workspaceId))
      .filter((item) => !status || item.status === status)
      .filter((item) => !search || [item.caseNo, item.project, item.customerSnapshot?.name, item.customerSnapshot?.email].some((value) => String(value || "").toLowerCase().includes(search)))
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    return { cases, total: cases.length };
  });

  app.get("/api/cases/:id", async (request, reply) => {
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    const sourceFiles = (caseRecord.fileIds || []).map((fileId) => database.data.files.find((file) => file.id === fileId && inWorkspace(file, caseRecord.workspaceId))).filter(Boolean).map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type,
      size: file.size || ""
    }));
    return { case: caseRecord, readiness: evaluateReadyToPrint(caseRecord), sourceFiles };
  });

  app.patch("/api/cases/:id", async (request, reply) => {
    const parsed = z.object({
      mode: z.enum(["estimate", "agent"]).optional(),
      priority: z.enum(["Rush", "High", "Normal", "Low"]).optional(),
      assigneeId: z.string().trim().max(100).optional(),
      printerId: z.string().trim().max(100).optional(),
      notes: z.string().trim().max(4000).optional(),
      parts: z.array(z.object({ id: z.string(), readiness: z.enum(["pending", "ready", "blocked"]).optional() }).passthrough()).max(256).optional()
    }).safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "案件更新格式錯誤", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    for (const key of ["mode", "priority", "assigneeId", "printerId", "notes"]) {
      if (parsed.data[key] !== undefined) caseRecord[key] = parsed.data[key];
    }
    if (parsed.data.parts) {
      const byId = new Map(parsed.data.parts.map((part) => [part.id, part]));
      caseRecord.parts = caseRecord.parts.map((part) => ({ ...part, ...(byId.get(part.id) || {}) }));
    }
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.updated", `${caseRecord.caseNo} updated`, { caseId: caseRecord.id }, request.user, caseRecord.workspaceId);
    await database.write();
    return { case: caseRecord, readiness: evaluateReadyToPrint(caseRecord) };
  });

  app.post("/api/cases/:id/transition", async (request, reply) => {
    const parsed = statusInputSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "案件狀態格式錯誤", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    if (parsed.data.override && !["Owner", "Admin"].includes(request.user.role)) return reply.code(403).send({ error: "管理員覆寫需要 Owner 或 Admin 角色" });
    if (parsed.data.override && !parsed.data.reason) return reply.code(400).send({ error: "管理員覆寫需要填寫原因" });
    if (parsed.data.status === "ready_to_print" && !parsed.data.override) {
      const readiness = evaluateReadyToPrint(caseRecord);
      if (!readiness.allowed) return reply.code(409).send({ error: "案件尚未符合生產條件", readiness });
    }
    const result = transitionCase(database, caseRecord, parsed.data.status, request.user, parsed.data.reason, { override: parsed.data.override });
    if (!result.allowed) return reply.code(409).send({ error: result.reason });
    await database.write();
    return { case: caseRecord, readiness: evaluateReadyToPrint(caseRecord) };
  });

  app.post("/api/cases/:id/quotes", async (request, reply) => {
    const parsed = quoteVersionInputSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "報價版本格式錯誤", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    const version = createQuoteVersion(caseRecord, parsed.data, request.user);
    if (parsed.data.send && ["under_review", "awaiting_customer", "revision_requested"].includes(caseRecord.status)) {
      transitionCase(database, caseRecord, "formal_quote_sent", request.user, `報價 V${version.versionNo}`);
    }
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.quote_version_created", `${caseRecord.caseNo} quote V${version.versionNo} created`, { caseId: caseRecord.id, versionId: version.id, total: version.customerTotal, sent: parsed.data.send }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ quoteVersion: version, case: caseRecord });
  });

  app.post("/api/cases/:id/payments", async (request, reply) => {
    const parsed = paymentInputSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "付款紀錄格式錯誤", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    const payment = { id: `pay-${randomUUID().slice(0, 12)}`, ...parsed.data, recordedBy: request.user.email, recordedAt: nowIso() };
    caseRecord.payments.unshift(payment);
    caseRecord.paymentStatus = parsed.data.status;
    caseRecord.updatedAt = nowIso();
    if (["paid", "monthly_terms", "waived"].includes(parsed.data.status) && caseRecord.status === "awaiting_payment") transitionCase(database, caseRecord, "paid", request.user, parsed.data.note);
    appendEvent(database, "case.payment_recorded", `${caseRecord.caseNo} payment ${parsed.data.status}`, { caseId: caseRecord.id, paymentId: payment.id, amount: payment.amount, method: payment.method }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ payment, case: caseRecord });
  });

  app.post("/api/cases/:id/slicer-jobs", async (request, reply) => {
    const parsed = z.object({
      id: z.string().trim().optional(),
      status: z.enum(["queued", "running", "completed", "failed"]),
      gcodeFileId: z.string().trim().optional().default(""),
      profileId: z.string().trim().optional().default(""),
      estimatedMinutes: z.number().min(0).optional().default(0),
      estimatedGrams: z.number().min(0).optional().default(0),
      warnings: z.array(z.string()).max(100).optional().default([]),
      approve: z.boolean().optional().default(false)
    }).safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "切片工作格式錯誤", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    const job = {
      id: parsed.data.id || `orca-${randomUUID().slice(0, 12)}`,
      engine: "OrcaSlicer",
      engineVersion: process.env.ORCA_SLICER_VERSION || "pinned-by-image",
      status: parsed.data.status,
      gcodeFileId: parsed.data.gcodeFileId,
      profileId: parsed.data.profileId,
      estimatedMinutes: parsed.data.estimatedMinutes,
      estimatedGrams: parsed.data.estimatedGrams,
      warnings: parsed.data.warnings,
      createdAt: nowIso(),
      approvedAt: parsed.data.approve ? nowIso() : "",
      approvedBy: parsed.data.approve ? request.user.email : ""
    };
    caseRecord.slicerJobs.unshift(job);
    if (parsed.data.approve) caseRecord.approvedSlicerJobId = job.id;
    caseRecord.updatedAt = nowIso();
    await database.write();
    return reply.code(201).send({ slicerJob: job, readiness: evaluateReadyToPrint(caseRecord) });
  });

  app.post("/api/cases/:id/orca-slice", async (request, reply) => {
    const parsed = z.object({
      sourceFileId: z.string().trim().min(1),
      profileId: z.string().trim().min(1),
      printerId: z.string().trim().optional().default(""),
      settingsPath: z.string().trim().max(500).optional().default(""),
      filamentPath: z.string().trim().max(500).optional().default("")
    }).safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "OrcaSlicer 工作格式錯誤", issues: parsed.error.issues });
    const profilePaths = [parsed.data.settingsPath, parsed.data.filamentPath].filter(Boolean).flatMap((value) => value.split(";"));
    if (profilePaths.some((value) => !value.startsWith("/profiles/") || value.includes(".."))) {
      return reply.code(400).send({ error: "OrcaSlicer 設定檔必須位於 /profiles 目錄內" });
    }
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    if (!caseRecord.fileIds.includes(parsed.data.sourceFileId)) return reply.code(409).send({ error: "切片來源檔案不屬於此案件" });
    const sourceFile = database.data.files.find((item) => item.id === parsed.data.sourceFileId && inWorkspace(item, caseRecord.workspaceId));
    if (!sourceFile) return reply.code(404).send({ error: "切片來源檔案不存在" });
    const job = {
      id: `orca-${randomUUID().slice(0, 12)}`,
      engine: "OrcaSlicer",
      engineVersion: process.env.ORCA_SLICER_VERSION || "2.4.2",
      status: "queued",
      sourceFileId: sourceFile.id,
      profileId: parsed.data.profileId,
      printerId: parsed.data.printerId || caseRecord.printerId || "",
      settingsPath: parsed.data.settingsPath,
      filamentPath: parsed.data.filamentPath,
      gcodeFileId: "",
      warnings: [],
      createdAt: nowIso(),
      queuedBy: request.user.email,
      approvedAt: "",
      approvedBy: ""
    };
    caseRecord.slicerJobs.unshift(job);
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.orca_slice_queued", `${caseRecord.caseNo} queued OrcaSlicer job`, { caseId: caseRecord.id, slicerJobId: job.id, sourceFileId: sourceFile.id, profileId: job.profileId }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ slicerJob: job });
  });

  app.post("/api/cases/:id/slicer-jobs/:jobId/approve", async (request, reply) => {
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    const job = caseRecord.slicerJobs.find((item) => item.id === request.params.jobId && item.engine === "OrcaSlicer");
    if (!job || job.status !== "completed" || !job.gcodeFileId) return reply.code(409).send({ error: "只有已完成且具備 G-code 的 OrcaSlicer 工作可核准" });
    job.approvedAt = nowIso();
    job.approvedBy = request.user.email;
    caseRecord.approvedSlicerJobId = job.id;
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.orca_gcode_approved", `${caseRecord.caseNo} approved OrcaSlicer G-code`, { caseId: caseRecord.id, slicerJobId: job.id, gcodeFileId: job.gcodeFileId }, request.user, caseRecord.workspaceId);
    await database.write();
    return { slicerJob: job, readiness: evaluateReadyToPrint(caseRecord) };
  });

  const workerAllowed = (request, reply) => {
    if (hasValidWorkerToken?.(request)) return true;
    reply.code(403).send({ error: "Invalid worker token" });
    return false;
  };

  app.post("/api/internal/orca/jobs/claim", async (request, reply) => {
    if (!workerAllowed(request, reply)) return;
    const claimedBy = String(request.body?.workerId || "orca-worker").slice(0, 120);
    for (const caseRecord of database.data.cases) {
      const job = (caseRecord.slicerJobs || []).find((item) => item.engine === "OrcaSlicer" && item.status === "queued");
      if (!job) continue;
      const sourceFile = database.data.files.find((item) => item.id === job.sourceFileId && inWorkspace(item, caseRecord.workspaceId));
      if (!sourceFile) {
        job.status = "failed";
        job.error = "切片來源檔案不存在";
        job.completedAt = nowIso();
        continue;
      }
      job.status = "running";
      job.claimedBy = claimedBy;
      job.claimedAt = nowIso();
      caseRecord.updatedAt = job.claimedAt;
      await database.write();
      return { job: { ...job, caseId: caseRecord.id, caseNo: caseRecord.caseNo, workspaceId: caseRecord.workspaceId, sourceFile: { id: sourceFile.id, name: sourceFile.name, type: sourceFile.type } } };
    }
    await database.write();
    return { job: null };
  });

  app.get("/api/internal/orca/files/:id", async (request, reply) => {
    if (!workerAllowed(request, reply)) return;
    const file = database.data.files.find((item) => item.id === request.params.id);
    if (!file) return reply.code(404).send({ error: "檔案不存在" });
    const bytes = await readCaseFile(file);
    reply.type("application/octet-stream");
    reply.header("content-disposition", `attachment; filename="${String(file.name || "input").replace(/[^\w.()-]/g, "_")}"`);
    return bytes;
  });

  app.post("/api/internal/orca/jobs/:id/result", async (request, reply) => {
    if (!workerAllowed(request, reply)) return;
    if (!request.isMultipart?.()) return reply.code(400).send({ error: "Expected G-code multipart upload" });
    const part = await request.file();
    if (!part) return reply.code(400).send({ error: "G-code file missing" });
    const jobId = request.params.id;
    const caseRecord = database.data.cases.find((item) => (item.slicerJobs || []).some((job) => job.id === jobId));
    const job = caseRecord?.slicerJobs.find((item) => item.id === jobId);
    if (!caseRecord || !job || job.status !== "running") return reply.code(409).send({ error: "OrcaSlicer job is not running" });
    const buffer = await part.toBuffer();
    if (!buffer.length) return reply.code(400).send({ error: "Generated G-code is empty" });
    const fields = part.fields || {};
    const field = (name, fallback = "") => typeof fields[name]?.value === "string" ? fields[name].value : fallback;
    const gcode = await storeGcodeFile({ filename: part.filename || `${caseRecord.caseNo}.gcode`, buffer, workspaceId: caseRecord.workspaceId, caseId: caseRecord.id, slicerJobId: job.id });
    job.status = "completed";
    job.gcodeFileId = gcode.file.id;
    job.estimatedMinutes = Number(field("estimatedMinutes", "0")) || 0;
    job.estimatedGrams = Number(field("estimatedGrams", "0")) || 0;
    job.warnings = field("warnings", "").split("\n").map((item) => item.trim()).filter(Boolean);
    job.completedAt = nowIso();
    job.workerVersion = field("workerVersion", "");
    caseRecord.updatedAt = job.completedAt;
    appendEvent(database, "case.orca_slice_completed", `${caseRecord.caseNo} OrcaSlicer job completed`, { caseId: caseRecord.id, slicerJobId: job.id, gcodeFileId: gcode.file.id, estimatedMinutes: job.estimatedMinutes, estimatedGrams: job.estimatedGrams }, { email: job.claimedBy || "orca-worker" }, caseRecord.workspaceId);
    await database.write();
    return { slicerJob: job };
  });

  app.post("/api/internal/orca/jobs/:id/fail", async (request, reply) => {
    if (!workerAllowed(request, reply)) return;
    const jobId = request.params.id;
    const caseRecord = database.data.cases.find((item) => (item.slicerJobs || []).some((job) => job.id === jobId));
    const job = caseRecord?.slicerJobs.find((item) => item.id === jobId);
    if (!caseRecord || !job) return reply.code(404).send({ error: "OrcaSlicer job is not found" });
    job.status = "failed";
    job.error = String(request.body?.error || "OrcaSlicer failed").slice(0, 4000);
    job.completedAt = nowIso();
    caseRecord.updatedAt = job.completedAt;
    appendEvent(database, "case.orca_slice_failed", `${caseRecord.caseNo} OrcaSlicer job failed`, { caseId: caseRecord.id, slicerJobId: job.id, error: job.error }, { email: job.claimedBy || "orca-worker" }, caseRecord.workspaceId);
    await database.write();
    return { ok: true };
  });

  app.post("/api/cases/:id/production-jobs", async (request, reply) => {
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "案件不存在" });
    const readiness = evaluateReadyToPrint(caseRecord);
    if (!readiness.allowed) return reply.code(409).send({ error: "案件尚未符合生產條件", readiness });
    const approvedSlice = caseRecord.slicerJobs.find((job) => job.id === caseRecord.approvedSlicerJobId);
    const createdAt = nowIso();
    const jobs = caseRecord.parts.map((part) => ({
      id: `job-${randomUUID().slice(0, 12)}`,
      workspaceId: caseRecord.workspaceId,
      source: "3DRFM",
      sourceCaseId: caseRecord.id,
      sourceCaseNo: caseRecord.caseNo,
      sourcePartId: part.id,
      fileId: approvedSlice.gcodeFileId,
      file: `${caseRecord.caseNo}-${part.name}.gcode`,
      printerId: caseRecord.printerId,
      material: part.material,
      color: part.color,
      quantity: part.quantity,
      status: "queued",
      stage: "needs scheduling",
      priority: caseRecord.priority,
      added: createdAt,
      createdAt,
      updatedAt: createdAt
    }));
    database.data.queue.push(...jobs);
    caseRecord.productionJobIds ||= [];
    caseRecord.productionJobIds.push(...jobs.map((job) => job.id));
    if (caseRecord.status === "production_pending") transitionCase(database, caseRecord, "ready_to_print", request.user, "生產條件已通過");
    appendEvent(database, "case.production_jobs_created", `${caseRecord.caseNo} created ${jobs.length} production jobs`, { caseId: caseRecord.id, jobIds: jobs.map((job) => job.id) }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ jobs, case: caseRecord });
  });

  app.post("/api/cases/:id/scheduling-suggestion", async (request, reply) => {
    const parsed = schedulingSuggestionSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid scheduling suggestion", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    caseRecord.scheduleSuggestion = { ...parsed.data, suggestedBy: request.user.email, suggestedAt: nowIso(), confirmedAt: "", confirmedBy: "" };
    caseRecord.updatedAt = caseRecord.scheduleSuggestion.suggestedAt;
    appendEvent(database, "case.schedule_suggested", `${caseRecord.caseNo} received a scheduling suggestion`, { caseId: caseRecord.id, ...parsed.data }, request.user, caseRecord.workspaceId);
    await database.write();
    return { scheduleSuggestion: caseRecord.scheduleSuggestion };
  });

  app.post("/api/cases/:id/schedule/suggest", async (request, reply) => {
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    if (caseRecord.status !== "ready_to_print") return reply.code(409).send({ error: "Case must be ready to print before scheduling" });
    const materials = new Set(caseRecord.parts.map((part) => String(part.material || "").toLowerCase()).filter(Boolean));
    const candidates = (database.data.printers || [])
      .filter((printer) => inWorkspace(printer, caseRecord.workspaceId))
      .filter((printer) => !["offline", "maintenance", "error"].includes(String(printer.status || "").toLowerCase()))
      .filter((printer) => !materials.size || [...materials].every((material) => (printer.compatibleMaterials || []).map((value) => String(value).toLowerCase()).includes(material)))
      .map((printer) => ({ printer, active: (database.data.queue || []).filter((job) => job.printerId === printer.id && ["queued", "printing", "paused"].includes(job.status)).length }))
      .sort((a, b) => a.active - b.active || String(a.printer.id).localeCompare(String(b.printer.id)));
    const selected = candidates[0];
    if (!selected) return reply.code(409).send({ error: "No compatible available printer found" });
    const estimate = (caseRecord.slicerJobs || []).find((job) => job.id === caseRecord.approvedSlicerJobId)?.estimatedMinutes || 60;
    const suggestedStartAt = new Date(Date.now() + selected.active * Math.max(estimate, 30) * 60000).toISOString();
    caseRecord.scheduleSuggestion = { suggestedStartAt, suggestedPrinterId: selected.printer.id, estimatedMinutes: estimate, reason: `Least-loaded compatible printer (${selected.active} active job(s))`, suggestedBy: "system", suggestedAt: nowIso(), confirmedAt: "", confirmedBy: "" };
    caseRecord.updatedAt = caseRecord.scheduleSuggestion.suggestedAt;
    appendEvent(database, "case.schedule_suggested", `${caseRecord.caseNo} system schedule suggestion created`, { caseId: caseRecord.id, ...caseRecord.scheduleSuggestion }, { email: "scheduler" }, caseRecord.workspaceId);
    await database.write();
    return { scheduleSuggestion: caseRecord.scheduleSuggestion };
  });

  app.post("/api/cases/:id/schedule/confirm", async (request, reply) => {
    const parsed = scheduleConfirmationSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid schedule confirmation", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    if (!["ready_to_print", "printing"].includes(caseRecord.status)) return reply.code(409).send({ error: "Case must be ready to print before confirming its schedule" });
    caseRecord.printerId = parsed.data.printerId;
    caseRecord.schedule = { ...parsed.data, confirmedAt: nowIso(), confirmedBy: request.user.email };
    caseRecord.updatedAt = caseRecord.schedule.confirmedAt;
    appendEvent(database, "case.schedule_confirmed", `${caseRecord.caseNo} schedule was confirmed`, { caseId: caseRecord.id, ...caseRecord.schedule }, request.user, caseRecord.workspaceId);
    await database.write();
    return { schedule: caseRecord.schedule, case: caseRecord };
  });

  app.post("/api/cases/:id/print-attempts", async (request, reply) => {
    const parsed = printAttemptSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid print attempt", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    const partIds = parsed.data.partIds?.length ? parsed.data.partIds : caseRecord.parts.map((part) => part.id);
    if (partIds.some((id) => !caseRecord.parts.some((part) => part.id === id))) return reply.code(400).send({ error: "Print attempt includes an unknown part" });
    const queueJob = parsed.data.queueJobId ? database.data.queue.find((item) => item.id === parsed.data.queueJobId && item.sourceCaseId === caseRecord.id) : null;
    if (parsed.data.queueJobId && !queueJob) return reply.code(404).send({ error: "Production job not found for this case" });

    let attempt = (caseRecord.printAttempts || []).find((item) => item.queueJobId === parsed.data.queueJobId && item.status === "printing");
    if (parsed.data.action === "started") {
      if (caseRecord.status !== "ready_to_print") return reply.code(409).send({ error: "Case is not ready to print" });
      if (!caseRecord.schedule?.confirmedAt) return reply.code(409).send({ error: "A specialist must confirm the schedule before print start" });
      if (attempt) return reply.code(409).send({ error: "A print attempt is already running" });
      attempt = { id: `attempt-${randomUUID().slice(0, 12)}`, queueJobId: parsed.data.queueJobId, partIds, printerId: caseRecord.printerId, status: "printing", startedAt: nowIso(), startedBy: request.user.email, completedAt: "", outcome: "", note: parsed.data.note, telemetry: parsed.data.telemetry };
      caseRecord.printAttempts.unshift(attempt);
      if (queueJob) Object.assign(queueJob, { status: "printing", stage: "printing", startedAt: attempt.startedAt, updatedAt: attempt.startedAt });
      transitionCase(database, caseRecord, "printing", request.user, parsed.data.note || "Print attempt started");
    } else {
      if (!attempt) return reply.code(409).send({ error: "No running print attempt found" });
      attempt.status = parsed.data.action === "completed" ? "completed" : "failed";
      attempt.outcome = attempt.status;
      attempt.completedAt = nowIso();
      attempt.completedBy = request.user.email;
      attempt.note = parsed.data.note || attempt.note;
      attempt.telemetry = { ...attempt.telemetry, ...parsed.data.telemetry };
      if (queueJob) Object.assign(queueJob, { status: attempt.status, stage: attempt.status === "completed" ? "quality check" : "failed", completedAt: attempt.completedAt, updatedAt: attempt.completedAt });
      if (caseRecord.status === "printing") transitionCase(database, caseRecord, "quality_check", request.user, attempt.status === "completed" ? "Print completed; QC required" : "Print failed; QC/reprint decision required");
    }
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.print_attempt_updated", `${caseRecord.caseNo} print attempt ${attempt.status}`, { caseId: caseRecord.id, attemptId: attempt.id, action: parsed.data.action, queueJobId: attempt.queueJobId, partIds }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ printAttempt: attempt, case: caseRecord });
  });

  app.post("/api/cases/:id/quality-checks", async (request, reply) => {
    const parsed = qualityCheckSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid quality check", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    if (caseRecord.status !== "quality_check") return reply.code(409).send({ error: "Case is not awaiting quality check" });
    if (parsed.data.parts.some((check) => !caseRecord.parts.some((part) => part.id === check.partId))) return reply.code(400).send({ error: "Quality check includes an unknown part" });
    const failedPartIds = parsed.data.parts.filter((check) => check.result === "failed").map((check) => check.partId);
    if (parsed.data.reprint && !failedPartIds.length) return reply.code(400).send({ error: "Reprint requires at least one failed part" });
    const qcCheck = { id: `qc-${randomUUID().slice(0, 12)}`, ...parsed.data, failedPartIds, checkedAt: nowIso(), checkedBy: request.user.email };
    caseRecord.qcChecks.unshift(qcCheck);
    for (const check of parsed.data.parts) {
      const part = caseRecord.parts.find((item) => item.id === check.partId);
      part.qcStatus = check.result;
      part.qcNotes = check.notes;
      part.qcPhotoFileIds = check.photoFileIds;
      part.readiness = check.result === "passed" ? "ready" : "blocked";
    }
    if (parsed.data.reprint) {
      for (const partId of failedPartIds) {
        const part = caseRecord.parts.find((item) => item.id === partId);
        database.data.queue.push({ id: `job-${randomUUID().slice(0, 12)}`, workspaceId: caseRecord.workspaceId, source: "3DRFM", sourceCaseId: caseRecord.id, sourceCaseNo: caseRecord.caseNo, sourcePartId: part.id, fileId: (caseRecord.slicerJobs || []).find((job) => job.id === caseRecord.approvedSlicerJobId)?.gcodeFileId || "", file: `${caseRecord.caseNo}-${part.name}-reprint.gcode`, printerId: caseRecord.printerId, material: part.material, color: part.color, quantity: part.quantity, status: "queued", stage: "reprint", priority: caseRecord.priority, reprintOfQcId: qcCheck.id, createdAt: qcCheck.checkedAt, updatedAt: qcCheck.checkedAt });
        part.readiness = "ready";
      }
      transitionCase(database, caseRecord, "ready_to_print", request.user, `QC reprint: ${failedPartIds.length} part(s)`);
    } else if (!failedPartIds.length && caseRecord.parts.every((part) => part.qcStatus === "passed")) {
      transitionCase(database, caseRecord, "ready_for_delivery", request.user, "All parts passed quality check");
    }
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.quality_checked", `${caseRecord.caseNo} quality check recorded`, { caseId: caseRecord.id, qcCheckId: qcCheck.id, failedPartIds, reprint: parsed.data.reprint }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ qualityCheck: qcCheck, case: caseRecord });
  });

  app.post("/api/cases/:id/delivery", async (request, reply) => {
    const parsed = deliverySchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid delivery update", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    if (!["ready_for_delivery", "completed"].includes(caseRecord.status)) return reply.code(409).send({ error: "Case is not ready for delivery" });
    caseRecord.delivery = { ...parsed.data, updatedAt: nowIso(), updatedBy: request.user.email };
    if (parsed.data.status === "delivered" && caseRecord.status === "ready_for_delivery") transitionCase(database, caseRecord, "completed", request.user, parsed.data.note || "Delivery completed");
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.delivery_updated", `${caseRecord.caseNo} delivery ${parsed.data.status}`, { caseId: caseRecord.id, delivery: caseRecord.delivery }, request.user, caseRecord.workspaceId);
    await database.write();
    return { delivery: caseRecord.delivery, case: caseRecord };
  });

  app.post("/api/cases/:id/aftersales", async (request, reply) => {
    const parsed = afterSalesSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid after-sales case", issues: parsed.error.issues });
    const caseRecord = findCase(database, request.params.id, request.user.workspaceId || DEFAULT_WORKSPACE_ID);
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    if (!["ready_for_delivery", "completed", "aftersales"].includes(caseRecord.status)) return reply.code(409).send({ error: "Case is not eligible for after-sales handling" });
    const afterSales = { id: `as-${randomUUID().slice(0, 12)}`, caseId: caseRecord.id, workspaceId: caseRecord.workspaceId, ...parsed.data, status: parsed.data.reopenProduction ? "production_reopened" : "open", createdAt: nowIso(), createdBy: request.user.email };
    database.data.afterSalesCases.unshift(afterSales);
    caseRecord.afterSalesCaseIds ||= [];
    caseRecord.afterSalesCaseIds.unshift(afterSales.id);
    if (parsed.data.reopenProduction) {
      if (caseRecord.status !== "aftersales") transitionCase(database, caseRecord, "aftersales", request.user, `After-sales ${afterSales.type}`);
      transitionCase(database, caseRecord, "production_pending", request.user, `After-sales ${afterSales.type}: production reopened`);
    } else if (caseRecord.status !== "aftersales") transitionCase(database, caseRecord, "aftersales", request.user, `After-sales ${afterSales.type}`);
    caseRecord.updatedAt = nowIso();
    appendEvent(database, "case.aftersales_created", `${caseRecord.caseNo} after-sales case created`, { caseId: caseRecord.id, afterSalesId: afterSales.id, type: afterSales.type, reopenProduction: afterSales.reopenProduction }, request.user, caseRecord.workspaceId);
    await database.write();
    return reply.code(201).send({ afterSales, case: caseRecord });
  });


}
