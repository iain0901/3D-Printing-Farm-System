import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { it, expect } from "vitest";
import { buildServer, openDatabase } from "./server.mjs";
it("keeps staff and member agent identities separate and excludes private agent data from state", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "3drfm-agent-integration-"));
  const db = await openDatabase(path.join(dir, "state.json"));
  const app = await buildServer({ db, serveStatic: false });
  try {
    const policy = (await app.inject({ method: "GET", url: "/api/health" }))
      .headers["content-security-policy"];
    expect(policy).toContain("https://api.openai.com");
    expect(policy).toContain("media-src 'self' blob:");
    const staff = (
      await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "demo@layerpilot.test", password: "layerpilot" },
      })
    ).json();
    const member = (
      await app.inject({
        method: "POST",
        url: "/api/customer-auth/register",
        payload: {
          name: "Agent會員",
          email: "agent-integration@example.test",
          password: "agent-integration-123",
        },
      })
    ).json();
    const request = (token, method, url, payload) =>
      app.inject({
        method,
        url,
        payload,
        headers: { authorization: `Bearer ${token}` },
      });
    expect(
      (await request(member.token, "GET", "/api/staff-agent/status")).statusCode
    ).toBe(401);
    expect(
      (await request(staff.token, "GET", "/api/customer/agent/status"))
        .statusCode
    ).toBe(401);
    const created = await request(
      staff.token,
      "POST",
      "/api/staff-agent/tokens",
      { name: "Staff agent" }
    );
    expect(created.statusCode, created.body).toBe(200);
    expect(
      (await request(member.token, "GET", "/api/customer/agent/status")).json()
        .tokens
    ).toEqual([]);
    const state = (await request(staff.token, "GET", "/api/state")).json();
    for (const key of [
      "agentTokens",
      "agentContexts",
      "agentCommands",
      "agentUsage",
    ]) {
      expect(state).not.toHaveProperty(key);
      expect(
        (await request(staff.token, "GET", `/api/${key}`)).statusCode
      ).toBe(404);
    }
    const mcp = await request(
      created.json().token,
      "POST",
      "/api/customer/agent/mcp",
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_name_badge", arguments: { name: "清華" } },
      }
    );
    expect(mcp.statusCode).toBe(200);
    expect(mcp.json().result.isError).not.toBe(true);
    expect(mcp.json().result.content[0].text).toContain("清華");
    await request(
      staff.token,
      "DELETE",
      `/api/staff-agent/tokens/${created.json().id}`
    );
    expect(
      (
        await request(created.json().token, "POST", "/api/customer/agent/mcp", {
          jsonrpc: "2.0",
          id: 2,
          method: "ping",
        })
      ).statusCode
    ).toBe(401);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
