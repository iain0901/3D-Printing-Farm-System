import { createChatwootClient, chatwootMessageContext, verifyChatwootWebhook } from "./chatwoot.mjs";
import { randomUUID } from "node:crypto";

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
  const { database, aiEngine, chatwootClient, panelSecret, knowledgeFor = () => [] } = options;
  const client = chatwootClient || createChatwootClient();
  const engine = aiEngine;
  const panelAllowed = (request) => {
    const expected = String(panelSecret || process.env.CHATWOOT_PANEL_SECRET || "");
    return Boolean(expected) && String(request.headers["x-chatwoot-panel-secret"] || request.query?.panelSecret || "") === expected;
  };

  app.get("/api/integrations/chatwoot/health", async () => client.health());

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
    if (context.messageType && context.messageType !== "incoming") return { ok: true, ignored: "outgoing" };
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
