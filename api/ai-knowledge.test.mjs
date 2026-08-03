import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRelevantAiKnowledge } from "./ai-knowledge.mjs";
import { buildAiSystemPrompt } from "./ai-engine.mjs";
import { buildServer, openDatabase } from "./server.mjs";

const cleanups = [];
afterEach(async () => { while (cleanups.length) await rm(cleanups.pop(), { recursive: true, force: true }); });

async function createApp() {
  const directory = await mkdtemp(path.join(tmpdir(), "farmflow-ai-knowledge-"));
  cleanups.push(directory);
  const db = await openDatabase(path.join(directory, "state.json"));
  return { app: await buildServer({ db, serveStatic: false }), db };
}

async function login(app) {
  const response = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "demo@layerpilot.test", password: "layerpilot" } });
  expect(response.statusCode).toBe(200);
  return { authorization: `Bearer ${response.json().token}` };
}

describe("team AI knowledge base", () => {
  it("ranks enabled material knowledge and injects only matching internal guidance into the prompt", () => {
    const matches = findRelevantAiKnowledge([
      { id: "petg", title: "PETG 耐熱與交期", content: "PETG 適合耐熱與戶外用途；特殊色需由專員確認交期。", category: "materials", tags: ["petg", "耐熱"] },
      { id: "resin", title: "樹脂後處理", content: "樹脂件需清洗與二次固化。", category: "materials", tags: ["resin"] },
      { id: "off", title: "停用條目", content: "不應被回傳。", enabled: false }
    ], "PETG 耐熱嗎？");
    expect(matches.map((item) => item.id)).toEqual(["petg"]);
    expect(buildAiSystemPrompt({ caseNo: "Q-1", knowledge: matches })).toContain("PETG 適合耐熱");
    expect(buildAiSystemPrompt({ caseNo: "Q-1", knowledge: matches })).not.toContain("樹脂件");
  });

  it("lets an Operator maintain scoped knowledge entries with an audit trail", async () => {
    const { app, db } = await createApp();
    try {
      const headers = await login(app);
      const created = await app.inject({ method: "POST", url: "/api/ai-knowledge", headers, payload: { title: "PLA 基本說明", content: "PLA 適合一般展示與原型。", category: "materials", tags: ["PLA", "prototype"] } });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ enabled: true, tags: ["pla", "prototype"] });
      const updated = await app.inject({ method: "PATCH", url: `/api/ai-knowledge/${created.json().id}`, headers, payload: { enabled: false } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).toMatchObject({ enabled: false });
      const listed = await app.inject({ method: "GET", url: "/api/ai-knowledge", headers });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toHaveLength(1);
      expect(db.data.events.map((event) => event.type)).toEqual(expect.arrayContaining(["ai.knowledge_created", "ai.knowledge_updated"]));
    } finally { await app.close(); }
  });
});
