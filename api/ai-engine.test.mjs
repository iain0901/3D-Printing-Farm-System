import { describe, expect, it } from "vitest";
import { buildAiSystemPrompt, createAiEngine, normalizeAiAnswer } from "./ai-engine.mjs";
import { chatwootMessageContext, createChatwootClient, verifyChatwootWebhook } from "./chatwoot.mjs";

describe("modular AI and Chatwoot integration", () => {
  it("uses a disabled engine as a deliberate human handoff", async () => {
    const answer = await createAiEngine({ provider: "disabled" }).answer({});
    expect(answer).toMatchObject({ handoff: true, confidence: 0 });
    expect(buildAiSystemPrompt({ caseNo: "Q-20260804-001", status: "under_review" })).toContain("Q-20260804-001");
  });

  it("normalizes provider answers and routes low confidence to a human", () => {
    expect(normalizeAiAnswer({ content: "可以協助確認", confidence: 0.4 })).toMatchObject({ handoff: true, confidence: 0.4 });
  });

  it("calls Chatwoot with the account-scoped API endpoint and verifies signed hooks", async () => {
    const requests = [];
    const client = createChatwootClient({ baseUrl: "https://chat.example/", accountId: "7", apiToken: "token", fetchImpl: async (url, init) => { requests.push({ url, init }); return { ok: true, status: 200, json: async () => ({ id: 1 }) }; } });
    await client.sendMessage("55", "案件已更新");
    expect(requests[0].url).toBe("https://chat.example/api/v1/accounts/7/conversations/55/messages");
    const payload = { event: "message_created", content: "請問材料", conversation: { id: 55, account_id: 7, inbox_id: 4 }, sender: { id: 9, name: "客戶" } };
    const signature = (await import("node:crypto")).createHmac("sha256", "secret").update(JSON.stringify(payload)).digest("hex");
    expect(verifyChatwootWebhook("secret", signature, payload)).toBe(true);
    expect(chatwootMessageContext(payload)).toMatchObject({ conversationId: "55", accountId: "7", contactId: "9" });
  });
});
