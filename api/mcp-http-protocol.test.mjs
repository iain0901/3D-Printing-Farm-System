import Fastify from "fastify";
import { it, expect } from "vitest";
import { registerSiteAgent } from "./site-agent.mjs";
it("initializes and calls scoped MCP tools over a real local HTTP JSON-RPC transport", async () => {
  const app = Fastify();
  const db = { data: { customers: [{ id: "member", workspaceId: "fixture" }] }, write: async () => {} };
  await registerSiteAgent(app, { database: db, env: {},
    customerFromRequest: (_, req) => ({ customer: req.headers["x-fixture"] ? { id: "member", workspaceId: "fixture" } : null }),
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  try {
    const base = `http://127.0.0.1:${app.server.address().port}/api/customer/agent`;
    const created = await fetch(base + "/tokens", { method: "POST", headers: { "content-type": "application/json", "x-fixture": "1" }, body: JSON.stringify({ name: "local-protocol-test" }) });
    const { token } = await created.json();
    let id = 0;
    const rpc = async (method, params = {}) => {
      const response = await fetch(base + "/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
      expect(response.status).toBe(200);
      const result = await response.json(); expect(result.jsonrpc).toBe("2.0"); expect(result.id).toBe(id); return result;
    };
    const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "local-fixture", version: "1" } });
    expect(init.result.protocolVersion).toBe("2025-03-26");
    expect((await rpc("tools/list")).result.tools.map((t) => t.name)).toEqual(expect.arrayContaining(["get_workspace", "propose_ui_action", "get_action_status"]));
    const context = { page: "#/cloud-slicer", controls: [{ id: "infill", label: "切片填充密度", type: "number", value: "15" }] };
    expect((await fetch(base + "/context", { method: "PUT", headers: { "content-type": "application/json", "x-fixture": "1" }, body: JSON.stringify(context) })).status).toBe(200);
    expect(JSON.parse((await rpc("tools/call", { name: "get_workspace", arguments: {} })).result.content[0].text).controls).toEqual(context.controls);
    const proposal = await rpc("tools/call", { name: "propose_ui_action", arguments: { target: "infill", operation: "fill", value: "20" } });
    const command = JSON.parse(proposal.result.content[0].text);
    expect(command.state).toBe("pending");
    const update = (path, payload) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-fixture': '1' }, body: JSON.stringify(payload) });
    expect((await update(`/commands/${command.id}/claim`, {})).status).toBe(200);
    expect((await update(`/commands/${command.id}/claim`, {})).status).toBe(409);
    expect((await update(`/commands/${command.id}/result`, { state: 'completed', message: 'local fixture only, not a business operation' })).status).toBe(200);
    const status = JSON.parse((await rpc('tools/call', { name: 'get_action_status', arguments: { id: command.id } })).result.content[0].text);
    expect(status.state).toBe('completed');
    expect((await rpc("tools/call", { name: "propose_ui_action", arguments: { target: "missing", operation: "click" } })).result.isError).toBe(true);
    expect((await rpc("unknown/method")).error.code).toBe(-32601);
  } finally { await app.close(); }
});
