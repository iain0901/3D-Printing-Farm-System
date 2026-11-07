// Opt-in isolated demonstrations. No payment, notification, worker or hardware dispatch.
export function demoRequestAllowed(method, rawUrl) {
  const url = rawUrl.split('?')[0];
  // Agent "commands" are confirmed UI proposals, not printer commands. Keep normal auth checks.
  if (/^\/api\/(?:customer\/agent|staff-agent)(\/|$)/.test(url)) return true;
  if (method === 'GET' && ['/api/customer/workspace/billing', '/api/events/stream'].includes(url)) return true;
  if (method === 'GET' && /^\/api\/(?:bridges|webhooks|notificationChannels|commerceConnectors)$/.test(url)) return true;
  if (method === 'POST' && url === '/api/events/token') return true;
  if (/\/(bridges|integrations|internal|billing|webhooks|notificationChannels|commerceConnectors)(\/|$)/.test(url)) return false;
  if (/\/(camera|stream|sync|checkout|confirm-payment|commands|actions)(\/|$)/.test(url)) return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return true;
  if (method === 'POST' && /^\/api\/auth\/(?:2fa\/(?:setup|enable)|change-password)$/.test(url)) return true;
  if (method === 'POST' && /^\/api\/customer\/cases\/[^/]+\/decision$/.test(url)) return true;
  if (method === 'POST' && /^\/api\/customer\/workspace\/cases\/[^/]+\/(?:messages|reorder-draft|checkout-order)$/.test(url)) return true;
  if (method === 'PATCH' && /^\/api\/(?:cases\/[^/]+|member-service\/requests\/[^/]+)$/.test(url)) return true;
  if (method === 'POST' && /^\/api\/(?:cases\/[^/]+\/(?:quotes|transition|quality-checks|delivery|aftersales)|member-service\/cases\/[^/]+\/messages)$/.test(url)) return true;
  return /^(?:\/api\/(?:auth|customer-auth)\/(?:login|logout|register)|\/api\/customer\/workspace\/(?:models|drafts|projects|preferences|notifications|requests|messages)|\/api\/(?:customer\/agent|staff-agent)|\/api\/maintenance\/advisor|\/api\/schedule\/(?:optimize|auto|constraint))($|\/)/.test(url);
}

export function registerDemoSafety(app, database, enabled) {
  if (Boolean(database.data.demoManifest) !== Boolean(enabled))
    throw new Error('展示資料必須透過獨立 demo:start 啟動；不可混用正式資料庫。');
  if (!enabled) return;
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-3DRFM-Demo', 'isolated').header('X-Robots-Tag', 'noindex, nofollow');
    if (!demoRequestAllowed(request.method, request.url))
      return reply.code(403).send({ error: '展示環境停用此操作：不付款、不寄信、不派工到實機。請使用獨立測試環境驗證外部串接。', code: 'DEMO_SIDE_EFFECT_DISABLED' });
  });
}
