// Official catalog verified 2026-11-07. Overrides remain available for account availability.
export function openAIModels(env = process.env) {
  return {
    chat: env.SITE_AGENT_MODEL || 'gpt-6-luna',
    vision: env.SITE_AGENT_VISION_MODEL || 'gpt-6.1-terra',
    review: env.SITE_AGENT_REVIEW_MODEL || 'gpt-6-luna',
    realtime: env.SITE_AGENT_REALTIME_MODEL || 'gpt-realtime-2.1-mini',
    image: env.SITE_AGENT_IMAGE_MODEL || 'gpt-image-2.6-flare',
    maintenance: env.MAINTENANCE_AI_MODEL || env.SITE_AGENT_VISION_MODEL || 'gpt-6.1-terra',
  };
}
export const economicalReasoning = model => /^gpt-6/.test(model) ? { reasoning: { effort: 'none' } } : {};
