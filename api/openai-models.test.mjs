import { afterEach, describe, it, expect, vi } from 'vitest';
import { openAIModels, economicalReasoning } from './openai-models.mjs';
import { createAiEngine } from './ai-engine.mjs';
afterEach(() => vi.unstubAllEnvs());
describe('OpenAI centralized economical model routing', () => {
  it('uses current separate text, vision, audio and image models with explicit overrides', () => {
    expect(openAIModels({})).toEqual({ chat: 'gpt-6-luna', review: 'gpt-6-luna', vision: 'gpt-6.1-terra', maintenance: 'gpt-6.1-terra', realtime: 'gpt-realtime-2.1-mini', image: 'gpt-image-2.6-flare' });
    expect(openAIModels({ SITE_AGENT_IMAGE_MODEL: 'fixture-image', MAINTENANCE_AI_MODEL: 'fixture-vision' })).toMatchObject({ image: 'fixture-image', maintenance: 'fixture-vision' });
    expect(economicalReasoning('gpt-6-luna')).toEqual({ reasoning: { effort: 'none' } });
    expect(economicalReasoning('custom-model')).toEqual({});
  });
  it('lets the legacy assistant use OPENAI_API_KEY and actually requests valid JSON without another secret', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'fixture-only');
    for (const key of ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_API_BASE_URL']) vi.stubEnv(key, '');
    const transport = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ content: '請先確認實測尺寸', confidence: 0.9, handoff: false }) } }] }) }));
    const engine = createAiEngine({ fetchImpl: transport });
    expect(engine.configured).toBe(true);
    expect((await engine.answer({ messages: [{ role: 'user', content: '需要什麼尺寸？' }] })).content).toContain('尺寸');
    const [url, request] = transport.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.headers.authorization).toBe('Bearer fixture-only');
    expect(JSON.parse(request.body)).toMatchObject({ model: 'gpt-6-luna', reasoning_effort: 'none', response_format: { type: 'json_object' } });
    expect(JSON.parse(request.body).messages[0].content).toContain('JSON');
    expect(request.signal).toBeInstanceOf(AbortSignal);
  });
  it('does not contact OpenAI without a configured key', async () => {
    vi.stubEnv('OPENAI_API_KEY', ''); vi.stubEnv('AI_API_KEY', '');
    const fetchImpl = vi.fn();
    expect((await createAiEngine({ fetchImpl }).answer()).handoff).toBe(true);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
