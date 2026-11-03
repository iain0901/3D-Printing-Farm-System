import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { memberReturnPath } from '../frontend-vue/src/utils/member-return.mjs';

const root = '/api/customer-auth/google';
const cookieName = 'rfm_google_flow';
const random = () => randomBytes(32).toString('base64url');
const digest = (text) => createHash('sha256').update(text).digest('base64url');

export function googleConfig(env = process.env) {
  const clientId = env.GOOGLE_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_CLIENT_SECRET || '';
  try {
    const redirect = new URL(env.GOOGLE_REDIRECT_URI);
    const local = ['localhost', '127.0.0.1'].includes(redirect.hostname);
    if (redirect.username || redirect.password || redirect.search || redirect.hash ||
        redirect.pathname !== `${root}/callback` ||
        !(redirect.protocol === 'https:' || redirect.protocol === 'http:' && local && env.NODE_ENV !== 'production')) return null;
    if (!clientId || !clientSecret) return null;
    return { clientId, clientSecret, redirectUri: redirect.href, origin: redirect.origin,
      secure: redirect.protocol === 'https:', loginPath: env.GOOGLE_PORTAL_LOGIN_PATH === '/portal/login' ? '/portal/login' : '/#/portal/login' };
  } catch { return null; }
}

// Fixed Google endpoints; the browser never receives the client secret or provider tokens.
export function createGoogleVerifier(config, { fetcher = fetch, jwks = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 8000 }) } = {}) {
  return async ({ code, verifier, nonce }) => {
    const response = await fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
    });
    if (!response.ok) throw new Error('Google token exchange failed');
    const tokens = await response.json();
    if (typeof tokens.id_token !== 'string' || tokens.id_token.length > 16000) throw new Error('Missing ID token');
    const { payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: config.clientId,
      algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub', 'nonce'], maxTokenAge: '10m',
    });
    if (payload.nonce !== nonce || payload.email_verified !== true ||
        typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
        typeof payload.email !== 'string' || payload.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ||
        (payload.azp && payload.azp !== config.clientId) || (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId)) throw new Error('Invalid Google identity');
    return { sub: payload.sub, email: payload.email.toLowerCase(), name: String(payload.name || payload.email.split('@')[0]).slice(0, 120) };
  };
}

export async function registerGoogleAuth(app, {
  database, customerFromRequest, createCustomerSession, sanitizeCustomer, workspaceId,
  rateLimit, config = googleConfig(), verifyIdentity = config && createGoogleVerifier(config), now = Date.now,
  audit = async () => {},
}) {
  // Deliberately ephemeral. Restarting expires unfinished sign-ins, never existing member sessions.
  // Multiple API replicas require sticky routing for these four endpoints (see deployment guide).
  const flows = new Map();
  const prune = () => { for (const [key, flow] of flows) if (flow.expires <= now()) flows.delete(key); };
  const options = { config: { rateLimit } };
  const setCookie = (reply, value, age) => reply.header('set-cookie', `${cookieName}=${value}; Path=${root}; HttpOnly; SameSite=Lax; Max-Age=${age}${config?.secure ? '; Secure' : ''}`);
  const cookie = (req) => {
    const values = String(req.headers.cookie || '').split(';').map((part) => part.trim()).filter((part) => part.startsWith(`${cookieName}=`));
    return values.length === 1 ? values[0].slice(cookieName.length + 1) : '';
  };
  const sameOrigin = (req) => !req.headers.origin || req.headers.origin === config?.origin;
  const finishUrl = (status, returnTo) => `${config.origin}${config.loginPath}?google=${status}${returnTo ? `&redirect=${encodeURIComponent(returnTo)}` : ''}`;
  app.addHook('onClose', async () => flows.clear());
  app.get(`${root}/config`, async (_, reply) => {
    reply.header('cache-control', 'no-store');
    return { enabled: Boolean(config) };
  });
  app.post(`${root}/start`, options, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!config) return reply.code(503).send({ error: 'Google 登入尚未設定，請先使用 Email 登入。' });
    if (!sameOrigin(req)) return reply.code(403).send({ error: '請從本網站開始登入。' });
    const mode = req.body?.mode || 'login';
    if (!['login', 'link'].includes(mode)) return reply.code(400).send({ error: '無效的登入方式。' });
    const auth = mode === 'link' ? customerFromRequest(database, req) : null;
    if (mode === 'link' && (!auth?.customer || (auth.customer.workspaceId || workspaceId) !== workspaceId))
      return reply.code(401).send({ error: '請先登入會員，再連結 Google。' });
    prune();
    if (flows.size >= 2000) return reply.code(503).send({ error: '登入服務忙碌，請稍後再試。' });
    const state = random(), browser = random(), nonce = random(), verifier = random();
    flows.set(state, { browserHash: digest(browser), nonce, verifier, mode,
      customerId: auth?.customer.id, sessionId: auth?.session?.id,
      returnTo: memberReturnPath(req.body?.returnTo), expires: now() + 600000, phase: 'authorize' });
    setCookie(reply, browser, 600);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: digest(verifier),
      code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return { url: url.href };
  });
  app.get(`${root}/callback`, options, async (req, reply) => {
    reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');
    if (!config) return reply.code(503).send({ error: 'Google 登入尚未設定。' });
    prune();
    const state = req.query?.state;
    const flow = typeof state === 'string' ? flows.get(state) : null;
    // A foreign browser must not consume another browser's state.
    if (!flow || flow.phase !== 'authorize' || flow.browserHash !== digest(cookie(req))) return reply.redirect(finishUrl('expired'));
    flows.delete(state); // Consume before any network await; a callback cannot be replayed.
    if (req.query.error) { setCookie(reply, '', 0); return reply.redirect(finishUrl('cancelled', flow.returnTo)); }
    try {
      if (typeof req.query.code !== 'string' || req.query.code.length > 4096) throw new Error('Missing code');
      const identity = await verifyIdentity({ code: req.query.code, verifier: flow.verifier, nonce: flow.nonce });
      if (flow.expires <= now()) throw new Error('Expired flow');
      prune();
      if (flows.size >= 2000) throw new Error('Login capacity reached');
      const ticket = random();
      flows.set(digest(ticket), { ...flow, identity, phase: 'complete', expires: now() + 60000, verifier: undefined, nonce: undefined });
      setCookie(reply, ticket, 60);
      return reply.redirect(finishUrl('complete'));
    } catch {
      setCookie(reply, '', 0);
      return reply.redirect(finishUrl('failed', flow.returnTo));
    }
  });
  app.post(`${root}/complete`, options, async (req, reply) => {
    reply.header('cache-control', 'no-store');
    if (!config || !sameOrigin(req)) return reply.code(403).send({ error: '請從本網站完成登入。' });
    prune();
    const key = digest(cookie(req)), flow = flows.get(key);
    setCookie(reply, '', 0);
    if (!flow || flow.phase !== 'complete') return reply.code(400).send({ error: '登入已逾時或已使用，請重新登入。' });
    flows.delete(key);
    const { sub, email, name } = flow.identity;
    const customers = database.data.customers ||= [];
    const inWorkspace = (c) => (c.workspaceId || workspaceId) === workspaceId;
    let customer = customers.find((c) => inWorkspace(c) && c.googleSubject === sub);
    if (flow.mode === 'link') {
      const auth = customerFromRequest(database, req);
      if (!auth.customer || !inWorkspace(auth.customer) || auth.customer.id !== flow.customerId || auth.session?.id !== flow.sessionId)
        return reply.code(401).send({ error: '原登入已結束，請重新登入後再連結。' });
      if ((customer && customer.id !== auth.customer.id) ||
          (auth.customer.googleSubject && auth.customer.googleSubject !== sub) ||
          String(auth.customer.email || '').toLowerCase() !== email)
        return reply.code(409).send({ error: '無法連結，請選擇與會員 Email 相同且未連結其他會員的 Google 帳戶。' });
      customer = auth.customer;
    } else if (!customer) {
      if (customers.some((c) => inWorkspace(c) && String(c.email || '').toLowerCase() === email))
        return reply.code(409).send({ error: '此 Email 已有會員資料。請先使用原方式登入，再到帳號設定連結 Google；忘記密碼可先重設。' });
      customer = { id: `cus-${randomUUID()}`, workspaceId, name, email, company: '', phone: '', line: '',
        tags: [], notes: '', source: 'Google signup', createdAt: new Date(now()).toISOString() };
      customers.push(customer);
    }
    customer.googleSubject = sub;
    customer.googleLinkedAt ||= new Date(now()).toISOString();
    customer.lastLoginAt = customer.updatedAt = new Date(now()).toISOString();
    const token = random();
    (database.data.customerSessions ||= []).push(createCustomerSession({ token, customer, workspaceId, now: new Date(now()), request: req }));
    await audit({ customerId: customer.id, workspaceId, mode: flow.mode });
    await database.write();
    return { token, customer: sanitizeCustomer(customer), returnTo: flow.returnTo };
  });
}
