import Fastify from "fastify";
import { describe, it, expect, afterEach, vi } from "vitest";
import { registerSiteAgent } from "./site-agent.mjs";
import { nameBadgeSource } from "./name-badge.mjs";
const apps = [];
afterEach(async () => {
  while (apps.length) await apps.pop().close();
});
async function fixture(configured = false) {
  const app = Fastify();
  apps.push(app);
  const db = {
    data: {
      customers: [
        { id: "a", workspaceId: "w" },
        { id: "b", workspaceId: "w" },
        { id: "c", workspaceId: "other" },
      ],
    },
    write: vi.fn(async () => {}),
  };
  let answer = { message: "建議確認模型", actions: [] };
  const fetchImpl = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      output: [
        { content: [{ type: "output_text", text: JSON.stringify(answer) }] },
      ],
    }),
  }));
  await registerSiteAgent(app, {
    database: db,
    customerFromRequest: (_, req) => ({
      customer: db.data.customers.find((c) => c.id === req.headers["x-user"]),
    }),
    fetchImpl,
    env: configured
      ? { OPENAI_API_KEY: "test-only", SITE_AGENT_DAILY_REQUESTS: "2" }
      : {},
  });
  const api = (user, method, path, payload) =>
    app.inject({
      method,
      url: "/api/customer/agent" + path,
      headers: { "x-user": user },
      payload,
    });
  const mcp = (token, method, params = {}) =>
    app.inject({
      method: "POST",
      url: "/api/customer/agent/mcp",
      headers: { authorization: `Bearer ${token}` },
      payload: { jsonrpc: "2.0", id: 1, method, params },
    });
  return {
    app,
    db,
    api,
    mcp,
    fetchImpl,
    answer: (value) => {
      answer = value;
    },
  };
}
const context = {
  page: "#/cloud-slicer",
  controls: [
    { id: "infill", label: "切片填充密度", type: "input", value: "15" },
  ],
};
describe("member website agent", () => {
  it("requires member authentication and reports missing provider without spending requests", async () => {
    const f = await fixture();
    expect((await f.api("missing", "GET", "/status")).statusCode).toBe(401);
    expect((await f.api("a", "GET", "/status")).json().configured).toBe(false);
    expect(
      (await f.api("a", "POST", "/chat", { message: "修改填充", context }))
        .statusCode
    ).toBe(503);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
  it("hashes MCP credentials, isolates members and revokes access", async () => {
    const f = await fixture();
    const created = (
      await f.api("a", "POST", "/tokens", { name: "我的 Agent" })
    ).json();
    expect(f.db.data.agentTokens[0].hash).not.toBe(created.token);
    expect(
      JSON.stringify((await f.api("a", "GET", "/status")).json())
    ).not.toContain(created.token);
    expect(
      (await f.api("b", "DELETE", `/tokens/${created.id}`)).statusCode
    ).toBe(404);
    expect((await f.mcp("bad", "initialize")).statusCode).toBe(401);
    expect(
      (await f.mcp(created.token, "initialize")).json().result.capabilities
        .tools
    ).toEqual({});
    expect(
      (await f.mcp(created.token, "tools/list"))
        .json()
        .result.tools.map((t) => t.name)
    ).toContain("get_workspace");
    await f.api("a", "DELETE", `/tokens/${created.id}`);
    expect((await f.mcp(created.token, "tools/list")).statusCode).toBe(401);
  });
  it("queues scoped MCP operations instead of claiming execution", async () => {
    const f = await fixture();
    const { token } = (
      await f.api("a", "POST", "/tokens", { name: "agent" })
    ).json();
    await f.api("a", "PUT", "/context", context);
    expect(
      (await f.api("a", "PUT", "/context", { ...context, page: "#/dashboard" }))
        .statusCode
    ).toBe(403);
    const response = (
      await f.mcp(token, "tools/call", {
        name: "propose_ui_action",
        arguments: { target: "infill", operation: "fill", value: "20" },
      })
    ).json();
    const command = JSON.parse(response.result.content[0].text);
    expect(command.state).toBe("pending");
    expect((await f.api("b", "GET", "/commands")).json().commands).toEqual([]);
    expect(
      (
        await f.api("c", "POST", `/commands/${command.id}/result`, {
          state: "completed",
          message: "done",
        })
      ).statusCode
    ).toBe(404);
    const invalid = (
      await f.mcp(token, "tools/call", {
        name: "propose_ui_action",
        arguments: { target: "secret", operation: "click" },
      })
    ).json();
    expect(invalid.result.isError).toBe(true);
    expect((await f.api("a", "GET", "/commands")).json().commands).toHaveLength(
      1
    );
    expect(
      (await f.api("a", "POST", `/commands/${command.id}/claim`, {})).statusCode
    ).toBe(200);
    expect(
      (await f.api("a", "POST", `/commands/${command.id}/claim`, {})).statusCode
    ).toBe(409);
  });
  it("enforces provider quotas and rejects invented targets", async () => {
    const f = await fixture(true);
    f.answer({
      message: "提出修改",
      actions: [{ target: "infill", operation: "fill", value: "20" }],
    });
    const result = await f.api("a", "POST", "/chat", {
      message: "填充20",
      context,
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().actions[0].value).toBe("20");
    const body = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    expect(body.store).toBe(false);
    f.answer({
      message: "其他",
      actions: [{ target: "not-a-control", operation: "click" }],
    });
    expect(
      (await f.api("a", "POST", "/chat", { message: "修改", context }))
        .statusCode
    ).toBe(502);
    expect(
      (await f.api("a", "POST", "/chat", { message: "修改", context }))
        .statusCode
    ).toBe(429);
    expect(f.fetchImpl).toHaveBeenCalledTimes(2);
  });
  it("bounds and escapes editable nameplate input", () => {
    expect(nameBadgeSource({ name: "清華同學" })).toContain("清華同學");
    expect(nameBadgeSource({ name: 'x";cube(999);' })).toContain(
      'x\\";cube(999);'
    );
    expect(() => nameBadgeSource({ name: "a", width: 999 })).toThrow();
  });
});
