import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerChatwootRoutes } from "./chatwoot-module.mjs";

async function makePanelApp() {
  const app = Fastify();
  const database = {
    data: {
      cases: [{
        id: "case-1",
        workspaceId: "ws-default",
        caseNo: "3DRFM-20260804-001",
        project: "齒輪外殼",
        status: "quoted",
        quotedValue: 860,
        currentQuoteVersionId: "quote-v1",
        customerSnapshot: { name: "王小明" }
      }],
      chatwootCaseLinks: [{ accountId: "9", conversationId: "77", caseId: "case-1", workspaceId: "ws-default" }],
      workspaceSettings: { chatwootAi: { defaultMode: "draft" } },
      events: []
    },
    write: async () => {}
  };
  await registerChatwootRoutes(app, {
    database,
    panelSecret: "panel-secret",
    aiEngine: { configured: true },
    chatwootClient: { health: async () => ({ ok: true }) }
  });
  await app.ready();
  return app;
}

describe("Chatwoot panel contract", () => {
  it("returns linked case and configured AI mode through the signed POST context endpoint", async () => {
    const app = await makePanelApp();
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/integrations/chatwoot/context",
        headers: { "x-chatwoot-panel-secret": "panel-secret" },
        payload: { account_id: "9", conversation_id: "77" }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        case: { id: "case-1", caseNo: "3DRFM-20260804-001", quoteTotal: 860 },
        ai: { configured: true, mode: "draft" }
      });
    } finally {
      await app.close();
    }
  });

  it("ships a panel that uses the signed POST contract and reads the AI object returned by the API", async () => {
    const panel = await readFile(new URL("../deploy/chatwoot-panel/index.html", import.meta.url), "utf8");
    const guide = await readFile(new URL("../deploy/chatwoot-panel/README.md", import.meta.url), "utf8");
    expect(panel).toContain('method: "POST"');
    expect(panel).toContain('account_id: config.accountId');
    expect(panel).toContain('conversation_id: config.conversationId');
    expect(panel).toContain('({ case: record, ai })');
    expect(panel).toContain('ai?.mode || "human"');
    expect(guide).toContain("CHATWOOT_PANEL_SECRET");
    expect(guide).toContain("CHATWOOT_BASE_URL");
    expect(guide).toContain("POST /api/integrations/chatwoot/context");
  });
});
