// Provider contracts only: all transport is injected; no real OpenAI calls.
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSiteAgent } from "./site-agent.mjs";

const apps = [];
afterEach(async () => {
  while (apps.length) await apps.pop().close();
});
const reviewInput = {
  purpose: "室內展示用支架，受力未知",
  models: [{ name: "fixture.stl", dimensions: [30, 40, 50] }],
  settings: { infill: 5, walls: 2, material: "PETG" },
};
async function fixture(result, env = {}) {
  const app = Fastify();
  apps.push(app);
  const database = { data: {}, write: vi.fn(async () => {}) };
  const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => result }));
  await registerSiteAgent(app, {
    database,
    customerFromRequest: (_, req) => ({
      customer: req.headers["x-test-member"] === "fixture"
        ? { id: "fixture", workspaceId: "test-workspace" }
        : null,
    }),
    fetchImpl,
    env: { OPENAI_API_KEY: "synthetic-not-a-real-key", ...env },
  });
  return {
    app,
    fetchImpl,
    database,
    request: (path, payload, authenticated = true) => app.inject({
      method: "POST",
      url: "/api/customer/agent" + path,
      headers: authenticated ? { "x-test-member": "fixture" } : {},
      payload,
    }),
  };
}
const textOutput = (value) => ({
  output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }],
});
describe("site Agent provider contracts (synthetic transport)", () => {
  it('provides verified station geography and shared conversation history for follow-up navigation', async () => {
    const f = await fixture(textOutput({ message: '帶你到水木書苑上傳模型。', actions: [{ target: 'go:free-upload', operation: 'click', value: '' }] }));
    const response = await f.request('/chat', { message: '確定', history: [{ role: 'user', text: '新竹哪裡有免費列印？' }, { role: 'assistant', text: '清華大學水木書苑，需要帶你過去嗎？' }], context: { page: '#/portal/dashboard', controls: [{ id: 'go:free-upload', label: '前往上傳', type: 'navigation' }] } });
    expect(response.statusCode).toBe(200);
    const request = JSON.parse(f.fetchImpl.mock.calls[0][1].body);
    const input = JSON.parse(request.input[0].content[0].text);
    expect(input.stationDirectory[0]).toMatchObject({ city: '新竹市', name: '水木書苑', institution: '國立清華大學' });
    expect(input.history[0].text).toContain('新竹');
    expect(input.navigation['go:free-upload'].path).toBe('/portal/free-slicer');
    expect(request.instructions).toContain('不要再要求重複確認');
  });
  it('transcribes audio through OpenAI without using a separate reasoning agent', async () => {
    const f = await fixture({ text: '我要免費列印' });
    const response = await f.request('/transcribe', { audio: 'ZmFrZQ==', mime: 'audio/webm' });
    expect(response.json().text).toBe('我要免費列印');
    const [url, request] = f.fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(request.body.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(request.body.get('file').type).toBe('audio/webm');
    expect((await f.request('/transcribe', { audio: 'ZmFrZQ==', mime: 'application/javascript' })).statusCode).toBe(400);
    expect((await f.request('/transcribe', { audio: 'ZmFrZQ==', mime: 'audio/webm' }, false)).statusCode).toBe(401);
  });
  it('speaks the shared answer as binary audio and refuses unconfigured speech requests', async () => {
    const f = await fixture({});
    f.fetchImpl.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from('synthetic-audio') });
    const response = await f.request('/speak', { text: '已到模型上傳區' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('audio/mpeg');
    expect(response.body).toBe('synthetic-audio');
    expect(f.fetchImpl.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/speech');
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body)).toMatchObject({ input: '已到模型上傳區', model: 'gpt-4o-mini-tts' });
    const missing = await fixture({}, { OPENAI_API_KEY: '' });
    expect((await missing.request('/speak', { text: '測試' })).statusCode).toBe(503);
    expect(missing.fetchImpl).not.toHaveBeenCalled();
  });
  it('routes text to the economical model and attached images to the vision model', async () => {
    const f = await fixture(textOutput({ message: '請先選擇模型', actions: [] }));
    const input = { message: '這個模型可以怎麼改？', context: { page: '#/portal/print', controls: [] } };
    expect((await f.request('/chat', input)).statusCode).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[0][1].body).model).toBe('gpt-6-luna');
    expect((await f.request('/chat', { ...input, image: 'data:image/png;base64,ZmFrZQ==' })).statusCode).toBe(200);
    expect(JSON.parse(f.fetchImpl.mock.calls[1][1].body).model).toBe('gpt-6.1-terra');
    expect(JSON.parse(f.fetchImpl.mock.calls[1][1].body).reasoning).toEqual({ effort: 'none' });
  });
  it("sends purpose, dimensions and settings to the configured review model, without claiming mechanical safety", async () => {
    const answer = {
      verdict: "insufficient_information",
      message: "缺少受力資訊，無法確認強度。",
      suggestedInfill: null,
      suggestedWalls: null,
    };
    const f = await fixture(textOutput(answer), { SITE_AGENT_REVIEW_MODEL: "fixture-review" });
    const response = await f.request("/review", reviewInput);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(answer);
    const [url, init] = f.fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(body).toMatchObject({ model: "fixture-review", store: false });
    expect(JSON.parse(body.input)).toMatchObject(reviewInput);
    expect(JSON.parse(body.input).modelEvidence[0].measured.dimensions).toEqual([30, 40, 50]);
    expect(f.database.data.agentReviews[0].answer).toEqual(answer);
    expect(f.database.data.agentReviews[0].inputDigest).toMatch(/^[a-f0-9]{64}$/);
    const reloaded = await f.app.inject({ method: 'GET', url: '/api/customer/agent/reviews', headers: { 'x-test-member': 'fixture' } });
    expect(reloaded.statusCode).toBe(200);
    expect(reloaded.json()[0].answer).toEqual(answer);
    expect(body.instructions).toContain("無法保證強度");
    expect(body.text.format.strict).toBe(true);
  });

  it("exchanges only an ephemeral voice credential and never returns the long-lived provider key", async () => {
    const f = await fixture({ value: "synthetic-ephemeral", expires_at: 12345 }, {
      SITE_AGENT_REALTIME_MODEL: "fixture-realtime",
    });
    const response = await f.request("/realtime-session", {});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ value: "synthetic-ephemeral", expires_at: 12345 });
    expect(response.body).not.toContain("synthetic-not-a-real-key");
    const [url, init] = f.fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/realtime/client_secrets");
    expect(JSON.parse(init.body).session.model).toBe("fixture-realtime");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("passes the supplied model capture to image generation, preserves illustration limitations and enforces image quota", async () => {
    const f = await fixture({ data: [{ b64_json: "ZmFrZQ==" }] });
    const input = { image: "data:image/png;base64,ZmFrZQ==", material: "PETG" };
    for (let index = 0; index < 3; index++) {
      const response = await f.request("/illustration", input);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ image: "data:image/png;base64,ZmFrZQ==" });
    }
    expect((await f.request("/illustration", input)).statusCode).toBe(429);
    expect(f.fetchImpl).toHaveBeenCalledTimes(3);
    const [url, init] = f.fetchImpl.mock.calls[0];
    const body = init.body;
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(init.headers['content-type']).toBeUndefined();
    expect(body.get('model')).toBe('gpt-image-2.6-flare');
    expect(body.get('complexity')).toBe('low');
    expect(body.get('safety_identifier')).toMatch(/^[a-f0-9]{64}$/);
    expect(Buffer.from(await body.get('image').arrayBuffer()).toString('base64')).toBe(input.image.split(',')[1]);
    expect(body.get('prompt')).toContain("not a dimensional or strength prediction");
  });

  it("does not call a provider when unauthenticated, unconfigured or when review input is outside bounds", async () => {
    const f = await fixture(textOutput({}), { OPENAI_API_KEY: "" });
    expect((await f.request("/review", reviewInput, false)).statusCode).toBe(401);
    expect((await f.request("/review", reviewInput)).statusCode).toBe(503);
    expect((await f.request("/review", { ...reviewInput, settings: { ...reviewInput.settings, infill: 101 } })).statusCode).toBe(400);
    expect(f.fetchImpl).not.toHaveBeenCalled();
  });
});
