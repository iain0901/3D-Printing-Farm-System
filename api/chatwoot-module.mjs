import { createChatwootClient, chatwootMessageContext, verifyChatwootWebhook } from "./chatwoot.mjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createCaseFromIntake, publicCase } from "./cases-module.mjs";

const DEFAULT_WORKSPACE_ID = "ws-default";
const inWorkspace = (item, workspaceId) => (item.workspaceId || DEFAULT_WORKSPACE_ID) === workspaceId;

function linkedCase(data, context) {
  const link = (data.chatwootCaseLinks || []).find((item) =>
    item.accountId === context.accountId && item.conversationId === context.conversationId
  );
  return link ? (data.cases || []).find((item) => item.id === link.caseId && inWorkspace(item, link.workspaceId || DEFAULT_WORKSPACE_ID)) : null;
}

function addEvent(database, type, message, data, workspaceId) {
  database.data.events ||= [];
  database.data.events.unshift({ id: `evt-${randomUUID()}`, type, message, data, workspaceId, actor: "chatwoot", at: new Date().toISOString() });
}

function aiModeFor(settings, inboxId) {
  const config = settings?.chatwootAi || {};
  const inbox = config.inboxes?.[inboxId] || {};
  return inbox.mode || config.defaultMode || process.env.AI_DEFAULT_MODE || "hybrid";
}

export async function registerChatwootRoutes(app, options) {
  const { database, aiEngine, chatwootClient, panelSecret, knowledgeFor = () => [], storeQuoteAttachment = null } = options;
  const client = chatwootClient || createChatwootClient();
  const attachmentStore = storeQuoteAttachment;
  const matchAttachmentExtension = (contentType) =>
    ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' })[String(contentType || '').toLowerCase()] || '.bin';
  const engine = aiEngine;
  const panelAllowed = (request) => {
    const expected = String(panelSecret || process.env.CHATWOOT_PANEL_SECRET || "");
    return Boolean(expected) && String(request.headers["x-chatwoot-panel-secret"] || request.query?.panelSecret || "") === expected;
  };

  app.get("/api/integrations/chatwoot/health", async (_request, reply) => {
    try {
      return await client.health();
    } catch {
      return reply.code(502).send({ ok: false, configured: Boolean(client.configured), error: "Chatwoot health check failed" });
    }
  });

  app.get("/api/integrations/chatwoot/status", async () => ({
    chatwoot: { configured: Boolean(client.configured), accountId: client.accountId || "" },
    ai: { configured: Boolean(engine?.configured), provider: engine?.provider || "disabled", defaultMode: aiModeFor(database.data.workspaceSettings, "") },
    knowledgeEntries: (database.data.aiKnowledge || []).filter((item) => item.enabled !== false).length
  }));

  const chatwootCaseSchema = z.object({
    account_id: z.string().trim().min(1),
    conversation_id: z.string().trim().min(1),
    contact_id: z.string().trim().max(80).optional().default(""),
    customer: z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().optional().or(z.literal("")).default(""),
      phone: z.string().trim().max(60).optional().default("")
    }),
    project: z.string().trim().min(1).max(160),
    purpose: z.string().trim().min(1).max(2000),
    material: z.string().trim().max(80).optional().default("PLA"),
    quantity: z.coerce.number().int().min(1).max(10000).optional().default(1)
  });

  app.post("/api/integrations/chatwoot/cases", async (request, reply) => {
    if (!request.user && !panelAllowed(request)) return reply.code(403).send({ error: "Chatwoot panel authentication required" });
    if (request.user && !["Owner", "Admin", "Operator"].includes(request.user.role)) return reply.code(403).send({ error: "Case creation permission required" });
    const parsed = chatwootCaseSchema.safeParse(request.body || {});
    if (!parsed.success) return reply.code(400).send({ error: "Chatwoot case payload is incomplete", issues: parsed.error.issues });
    const context = chatwootMessageContext(parsed.data);
    const existing = linkedCase(database.data, context);
    if (existing) return reply.code(409).send({ error: "Conversation already has a linked case", case: publicCase(existing) });
    const workspaceId = request.user?.workspaceId || DEFAULT_WORKSPACE_ID;
    const created = createCaseFromIntake(database, {
      mode: "agent",
      source: "chatwoot",
      hasModel: false,
      customer: { ...parsed.data.customer, lineUserId: context.contactId || `chatwoot-${context.conversationId}` },
      project: parsed.data.project,
      purpose: parsed.data.purpose,
      defaults: { material: parsed.data.material, color: "", quantity: parsed.data.quantity, quality: "Standard", layerHeight: "", infill: 15, walls: 2, support: "Auto", postProcessing: [] },
      parts: [],
      fileIds: [],
      modeling: { sketches: [], criticalDimensions: "", requirements: parsed.data.purpose },
      chatwoot: { accountId: context.accountId, conversationId: context.conversationId, contactId: context.contactId || `chatwoot-${context.conversationId}`, inboxId: context.inboxId }
    }, { workspaceId, actor: request.user || { name: "Chatwoot" } });
    await database.write();
    return reply.code(201).send({ ok: true, case: publicCase(created.caseRecord) });
  });

  app.post("/api/integrations/chatwoot/context", async (request, reply) => {
    if (!request.user && !panelAllowed(request)) return reply.code(403).send({ error: "Chatwoot panel authentication required" });
    const context = chatwootMessageContext(request.body || {});
    if (!context.accountId || !context.conversationId) return reply.code(400).send({ error: "Chatwoot context is incomplete" });
    const caseRecord = linkedCase(database.data, context);
    return {
      context,
      case: caseRecord ? { id: caseRecord.id, caseNo: caseRecord.caseNo, project: caseRecord.project, status: caseRecord.status, customer: caseRecord.customerSnapshot, quoteTotal: caseRecord.quotedValue || 0, currentQuoteVersionId: caseRecord.currentQuoteVersionId || "" } : null,
      ai: { configured: Boolean(engine?.configured), mode: aiModeFor(database.data.workspaceSettings, context.inboxId) }
    };
  });

  app.post("/api/cases/:id/chatwoot/notify", async (request, reply) => {
    const workspaceId = request.user.workspaceId || DEFAULT_WORKSPACE_ID;
    const caseRecord = (database.data.cases || []).find((item) => item.id === request.params.id && inWorkspace(item, workspaceId));
    if (!caseRecord) return reply.code(404).send({ error: "Case not found" });
    const content = String(request.body?.content || "").trim();
    if (!content || content.length > 4000) return reply.code(400).send({ error: "Notification content is required" });
    const conversationId = caseRecord.chatwoot?.conversationId || (database.data.chatwootCaseLinks || []).find((item) => item.caseId === caseRecord.id)?.conversationId;
    if (!conversationId) return reply.code(409).send({ error: "Case is not linked to a Chatwoot conversation" });
    const result = await client.sendMessage(conversationId, content);
    addEvent(database, "chatwoot.notification_sent", `${caseRecord.caseNo} notification sent via Chatwoot`, { caseId: caseRecord.id, conversationId, messageId: result?.id || "" }, workspaceId);
    await database.write();
    return { ok: true, messageId: result?.id || null };
  });

  app.post("/api/integrations/chatwoot/webhook", async (request, reply) => {
    const secret = String(process.env.CHATWOOT_WEBHOOK_SECRET || "");
    const provided = String(request.headers["x-chatwoot-signature"] || request.headers["x-chatwoot-webhook-secret"] || "");
    const directMatch = secret && provided === secret;
    if (!directMatch && !verifyChatwootWebhook(secret, provided, request.body || {})) return reply.code(403).send({ error: "Invalid Chatwoot webhook signature" });
    const context = chatwootMessageContext(request.body || {});
    // outgoing = 客服在 Chatwoot 後台回覆 → 鏡像寫回 Portal 報價對話串（含附件）。
    // 我方 API 推送的訊息以 pushedIds 比對，避免回環。
    if (context.messageType === "outgoing") {
      const quote = (database.data.quoteRequests || []).find((item) => item.chatwoot?.conversationId === context.conversationId);
      if (!quote) return { ok: true, ignored: "no_linked_quote" };
      if (context.messageId && (quote.chatwoot.pushedIds || []).includes(context.messageId)) return { ok: true, ignored: "self_echo" };
      let attachments = [];
      for (const [index, url] of context.attachments.entries()) {
        try {
          const remote = await client.fetchRemoteFile(url);
          const extension = matchAttachmentExtension(remote.contentType);
          const stored = await attachmentStore( `${context.messageId || Date.now()}-${index}${extension}`, remote);
          attachments.push({ index, name: `attachment-${index + 1}${extension}`, contentType: remote.contentType, size: remote.buffer.length, ...stored });
        } catch {
          // 單一附件下載失敗不阻斷文字鏡像
        }
      }
      const message = {
        id: randomUUID(),
        author: "operator",
        authorName: context.senderName || "客服",
        body: context.content || (attachments.length ? "（傳送了附件）" : ""),
        createdAt: new Date().toISOString()
      };
      if (attachments.length) message.attachments = attachments;
      quote.messages ||= [];
      quote.messages.push(message);
      quote.updatedAt = message.createdAt;
      addEvent(database, "quote_request.message_added", `${message.authorName} replied from Chatwoot on ${quote.id}`, { workspaceId: quote.workspaceId || DEFAULT_WORKSPACE_ID, quoteRequestId: quote.id, author: "operator", via: "chatwoot" }, quote.workspaceId || DEFAULT_WORKSPACE_ID);
      await database.write();
      return { ok: true, action: "mirrored_to_portal" };
    }
    if (context.messageType && context.messageType !== "incoming") return { ok: true, ignored: "unsupported_message_type" };
    if (!context.conversationId || !context.accountId || !context.content) return { ok: true, ignored: "unsupported_payload" };
    const caseRecord = linkedCase(database.data, context);
    const mode = aiModeFor(database.data.workspaceSettings, context.inboxId);
    if (!engine?.configured || mode === "human") {
      addEvent(database, "chatwoot.incoming_routed", "Incoming Chatwoot message routed to human queue", { conversationId: context.conversationId, caseId: caseRecord?.id || "", mode }, caseRecord?.workspaceId || DEFAULT_WORKSPACE_ID);
      await database.write();
      return { ok: true, action: "human" };
    }
    const knowledge = knowledgeFor(database.data, context, caseRecord);
    const answer = await engine.answer({ case: caseRecord ? { caseNo: caseRecord.caseNo, status: caseRecord.status } : {}, knowledge, messages: [{ role: "user", content: context.content }] });
    const action = mode === "draft" || answer.handoff ? "draft" : "auto";
    if (action === "auto" && answer.content) await client.sendMessage(context.conversationId, answer.content);
    addEvent(database, action === "auto" ? "chatwoot.ai_replied" : "chatwoot.ai_drafted", action === "auto" ? "AI sent a Chatwoot reply" : "AI prepared a Chatwoot draft", {
      conversationId: context.conversationId,
      caseId: caseRecord?.id || "",
      mode,
      confidence: answer.confidence,
      handoff: answer.handoff,
      summary: answer.summary,
      intents: answer.intents,
      knowledgeIds: knowledge.map((item) => item.id)
    }, caseRecord?.workspaceId || DEFAULT_WORKSPACE_ID);
    await database.write();
    return { ok: true, action, answer: action === "draft" ? answer : { confidence: answer.confidence, handoff: false } };
  });
}
