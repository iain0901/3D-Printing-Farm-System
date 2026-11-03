import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignJWT, generateKeyPair, createLocalJWKSet, exportJWK } from 'jose';
import { googleConfig, createGoogleVerifier } from './google-auth.mjs';
import { buildServer, openDatabase } from './server.mjs';

const config = googleConfig({ GOOGLE_CLIENT_ID: 'fixture-client', GOOGLE_CLIENT_SECRET: 'fixture-only-secret',
  GOOGLE_REDIRECT_URI: 'https://members.example.test/api/customer-auth/google/callback' });
const root = '/api/customer-auth/google';
const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); vi.restoreAllMocks(); });
const cookie = (response) => response.headers['set-cookie'].split(';')[0];
const headers = (token) => ({ authorization: `Bearer ${token}` });

async function fixture(options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'rfm-google-'));
  const db = await openDatabase(path.join(directory, 'db.json'));
  let clock = Date.now();
  let identity = { sub: 'google-fixture-subject', email: 'google@example.test', name: 'Google 會員' };
  const verifyIdentity = vi.fn(async () => identity);
  const emailClient = { send: vi.fn(async () => ({ sent: true })) };
  const app = await buildServer({ db, serveStatic: false, emailClient, googleAuth: { config, verifyIdentity, now: () => clock, ...options } });
  cleanups.push(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  const start = async (body = {}, token) => {
    const res = await app.inject({ method: 'POST', url: `${root}/start`, payload: body, headers: headers(token || '') });
    expect(res.statusCode).toBe(200);
    return { res, state: new URL(res.json().url).searchParams.get('state'), cookie: cookie(res) };
  };
  const callback = (flow, query = 'code=fixture-code') => app.inject({ method: 'GET',
    url: `${root}/callback?state=${flow.state}&${query}`, headers: { cookie: flow.cookie } });
  const complete = (callbackResponse, token) => app.inject({ method: 'POST', url: `${root}/complete`, payload: {},
    headers: { cookie: cookie(callbackResponse), ...headers(token || '') } });
  const register = async (email = identity.email) => {
    const res = await app.inject({ method: 'POST', url: '/api/customer-auth/register', payload: { name: '原會員', email, password: 'fixture-password-123' } });
    expect(res.statusCode).toBe(201);
    return res.json();
  };
  return { app, db, start, callback, complete, register, verifyIdentity, emailClient,
    advance: (ms) => { clock += ms; }, identity: (value) => { identity = value; } };
}

describe('Google OAuth configuration and ID token validation', () => {
  it('disables incomplete, unsafe and malformed configuration, with explicit local development support', () => {
    expect(googleConfig({})).toBeNull();
    for (const uri of ['http://members.test/api/customer-auth/google/callback', 'https://members.test/wrong',
      'https://user:pass@members.test/api/customer-auth/google/callback', `${config.redirectUri}?next=evil`, `${config.redirectUri}#evil`]) {
      expect(googleConfig({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_REDIRECT_URI: uri })).toBeNull();
    }
    const local = { GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b', GOOGLE_REDIRECT_URI: `http://127.0.0.1:8797${root}/callback` };
    expect(googleConfig(local).secure).toBe(false);
    expect(googleConfig({ ...local, NODE_ENV: 'production' })).toBeNull();
  });

  it('exchanges an authorization code using PKCE and validates signed Google claims', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwks = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'fixture-key', alg: 'RS256' }] });
    const claims = { nonce: 'fixture-nonce', email: 'Google@Example.test', email_verified: true, name: '測試' };
    const sign = (payload, issuer = 'https://accounts.google.com', audience = config.clientId, expires = '5m') => new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' }).setSubject('subject').setIssuer(issuer)
      .setAudience(audience).setIssuedAt().setExpirationTime(expires).sign(privateKey);
    let idToken = await sign(claims);
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ id_token: idToken }) }));
    const verify = createGoogleVerifier(config, { jwks, fetcher });
    const request = { code: 'fixture-code', verifier: 'fixture-verifier', nonce: 'fixture-nonce' };
    expect(await verify(request)).toMatchObject({ sub: 'subject', email: 'google@example.test' });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect(init.body.get('code_verifier')).toBe('fixture-verifier');
    expect(init.body.get('redirect_uri')).toBe(config.redirectUri);
    expect(init.redirect).toBe('error');
    for (const payload of [{ ...claims, nonce: 'wrong' }, { ...claims, email_verified: false },
      { ...claims, azp: 'foreign-client' }, { ...claims, email: 'invalid' }]) {
      idToken = await sign(payload);
      await expect(verify(request)).rejects.toThrow();
    }
    idToken = await sign(claims, 'https://attacker.test'); await expect(verify(request)).rejects.toThrow();
    idToken = await sign(claims, undefined, 'foreign-client'); await expect(verify(request)).rejects.toThrow();
    idToken = await sign(claims, undefined, undefined, '-1s'); await expect(verify(request)).rejects.toThrow();
    const other = await generateKeyPair('RS256');
    idToken = await new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
      .setSubject('subject').setIssuer('https://accounts.google.com').setAudience(config.clientId)
      .setIssuedAt().setExpirationTime('5m').sign(other.privateKey);
    await expect(verify(request)).rejects.toThrow();
  });

  it('does not accept provider failures or missing tokens', async () => {
    for (const result of [{ ok: false }, { ok: true, json: async () => ({ access_token: 'not-an-id-token' }) }]) {
      const verify = createGoogleVerifier(config, { fetcher: async () => result });
      await expect(verify({ code: 'x', verifier: 'y', nonce: 'z' })).rejects.toThrow();
    }
  });
});

describe('member Google login through the real API', () => {
  it('stays disabled without credentials and does not expose configuration secrets', async () => {
    const f = await fixture({ config: null });
    const response = await f.app.inject(`${root}/config`);
    expect(response.json()).toEqual({ enabled: false });
    expect((await f.app.inject({ method: 'POST', url: `${root}/start`, payload: {} })).statusCode).toBe(503);
    expect((await f.app.inject({ method: 'POST', url: `${root}/complete`, payload: {} })).statusCode).toBe(403);
  });

  it('creates a persistent member and hashed customer session, without tokens in redirects or staff authority', async () => {
    const f = await fixture();
    const flow = await f.start({ returnTo: '/portal/workspace?section=models' });
    expect(flow.res.headers['set-cookie']).toContain('HttpOnly; SameSite=Lax; Max-Age=600; Secure');
    const authUrl = new URL(flow.res.json().url);
    expect(authUrl.searchParams.get('scope')).toBe('openid email profile');
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const cb = await f.callback(flow);
    expect(cb.headers.location).toBe('https://members.example.test/#/portal/login?google=complete');
    const params = f.verifyIdentity.mock.calls[0][0];
    expect(params.nonce).toBe(authUrl.searchParams.get('nonce'));
    expect(createHash('sha256').update(params.verifier).digest('base64url')).toBe(authUrl.searchParams.get('code_challenge'));
    const done = await f.complete(cb);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ customer: { hasGoogle: true, hasPassword: false, hasPortalAccount: true }, returnTo: '/portal/workspace?section=models' });
    expect(done.json().customer.googleSubject).toBeUndefined();
    expect(f.db.data.customerSessions.at(-1).token).toBeUndefined();
    const token = done.json().token;
    expect((await f.app.inject({ url: '/api/customer-auth/me', headers: headers(token) })).statusCode).toBe(200);
    expect((await f.app.inject({ url: '/api/state', headers: headers(token) })).statusCode).toBe(401);
    const staff = await f.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'demo@layerpilot.test', password: 'layerpilot' } });
    const publicState = await f.app.inject({ url: '/api/state', headers: headers(staff.json().token) });
    expect(JSON.stringify(publicState.json())).not.toContain('google-fixture-subject');
    await f.db.read();
    expect(f.db.data.customers.find((c) => c.id === done.json().customer.id).googleSubject).toBe('google-fixture-subject');
    expect((await f.complete(cb)).statusCode).toBe(400);
    expect((await f.callback(flow)).headers.location).toContain('google=expired');
  });

  it('reuses the immutable provider subject without creating duplicate members', async () => {
    const f = await fixture();
    const a = await f.complete(await f.callback(await f.start()));
    f.identity({ sub: 'google-fixture-subject', email: 'renamed@example.test', name: '改名' });
    const b = await f.complete(await f.callback(await f.start()));
    expect(b.json().customer.id).toBe(a.json().customer.id);
    expect(b.json().customer.email).toBe('google@example.test'); // Account email is not silently replaced.
  });

  it('rejects email collisions until the member explicitly links Google from a live session', async () => {
    const f = await fixture();
    const member = await f.register();
    expect((await f.complete(await f.callback(await f.start()))).statusCode).toBe(409);
    const link = await f.start({ mode: 'link', returnTo: '/portal/workspace?section=settings' }, member.token);
    const done = await f.complete(await f.callback(link), member.token);
    expect(done.json().customer).toMatchObject({ id: member.customer.id, hasGoogle: true, hasPassword: true });
    const login = await f.complete(await f.callback(await f.start()));
    expect(login.json().customer.id).toBe(member.customer.id);
    const passwordLogin = await f.app.inject({ method: 'POST', url: '/api/customer-auth/login', payload: { email: member.customer.email, password: 'fixture-password-123' } });
    expect(passwordLogin.statusCode).toBe(200);
  });

  it('does not link a foreign identity, another member session or a revoked session', async () => {
    const f = await fixture();
    const member = await f.register('local@example.test');
    let cb = await f.callback(await f.start({ mode: 'link' }, member.token));
    expect((await f.complete(cb, member.token)).statusCode).toBe(409);
    f.identity({ sub: 's', email: member.customer.email, name: '測試' });
    cb = await f.callback(await f.start({ mode: 'link' }, member.token));
    const other = await f.register('other@example.test');
    expect((await f.complete(cb, other.token)).statusCode).toBe(401);
    cb = await f.callback(await f.start({ mode: 'link' }, member.token));
    await f.app.inject({ method: 'POST', url: '/api/customer-auth/logout', headers: headers(member.token) });
    expect((await f.complete(cb, member.token)).statusCode).toBe(401);
    expect(f.db.data.customers.find((c) => c.id === member.customer.id).googleSubject).toBeUndefined();
  });

  it('rejects invalid state and a foreign browser without consuming the legitimate flow', async () => {
    const f = await fixture();
    const flow = await f.start();
    expect((await f.callback({ ...flow, cookie: 'rfm_google_flow=foreign' })).headers.location).toContain('google=expired');
    expect(f.verifyIdentity).not.toHaveBeenCalled();
    expect((await f.callback(flow)).headers.location).toContain('google=complete');
  });

  it('handles cancellation and provider errors without leaking error details or writing accounts', async () => {
    const f = await fixture();
    expect((await f.callback(await f.start(), 'error=access_denied')).headers.location).toContain('google=cancelled');
    f.verifyIdentity.mockRejectedValueOnce(new Error('sensitive-provider-payload'));
    const failure = await f.callback(await f.start());
    expect(failure.headers.location).toContain('google=failed');
    expect(failure.body).not.toContain('sensitive-provider');
    expect(f.db.data.customers.some((c) => c.googleSubject)).toBe(false);
  });

  it('expires unfinished authorization and completion tickets', async () => {
    const f = await fixture();
    const flow = await f.start(); f.advance(600001);
    expect((await f.callback(flow)).headers.location).toContain('google=expired');
    const cb = await f.callback(await f.start()); f.advance(60001);
    expect((await f.complete(cb)).statusCode).toBe(400);
  });

  it('rejects cross-origin requests, unauthenticated linking and arbitrary return URLs', async () => {
    const f = await fixture();
    expect((await f.app.inject({ method: 'POST', url: `${root}/start`, payload: {}, headers: { origin: 'https://foreign.test' } })).statusCode).toBe(403);
    expect((await f.app.inject({ method: 'POST', url: `${root}/start`, payload: { mode: 'link' } })).statusCode).toBe(401);
    const cb = await f.callback(await f.start({ returnTo: 'https://foreign.test' }));
    expect((await f.complete(cb)).json().returnTo).toBe('/portal/dashboard');
  });

  it('blocks password registration and quote-claim takeover of Google-only accounts; permits email reset', async () => {
    const f = await fixture();
    const done = await f.complete(await f.callback(await f.start()));
    const duplicate = await f.app.inject({ method: 'POST', url: '/api/customer-auth/register', payload: { name: 'attacker', email: done.json().customer.email, password: 'attacker-password-123' } });
    expect(duplicate.statusCode).toBe(409);
    const quote = await f.app.inject({ method: 'POST', url: '/api/public/quoteRequests', payload: {
      customer: 'Google 會員', email: done.json().customer.email, project: '測試模型', material: 'PETG', quantity: 1,
    } });
    expect(quote.statusCode).toBe(201);
    const claimed = await f.app.inject({ method: 'POST', url: '/api/customer-auth/claim', payload: {
      quoteId: quote.json().quoteRequest.id, token: quote.json().quoteRequest.accessToken, password: 'attacker-password-123',
    } });
    expect(claimed.statusCode).toBe(409);
    // Google-only members must remain eligible for the existing email-verified reset route.
    const reset = await f.app.inject({ method: 'POST', url: '/api/customer-auth/request-reset', payload: { email: done.json().customer.email } });
    expect(reset.statusCode).toBe(200);
    expect(f.db.data.customers.find((c) => c.id === done.json().customer.id).resetTokenHash).toBeTruthy();
    expect(f.emailClient.send).toHaveBeenCalledOnce();
    const resetUrl = f.emailClient.send.mock.calls[0][0].text.match(/https?:\/\/\S+/)[0];
    const resetToken = new URLSearchParams(new URL(resetUrl).hash.split('?')[1]).get('resetToken');
    expect(resetToken).toBeTruthy();
    const confirm = await f.app.inject({ method: 'POST', url: '/api/customer-auth/reset', payload: { token: resetToken, password: 'new-password-123' } });
    expect(confirm.statusCode).toBe(200);
    const passwordLogin = await f.app.inject({ method: 'POST', url: '/api/customer-auth/login', payload: { email: done.json().customer.email, password: 'new-password-123' } });
    expect(passwordLogin.statusCode).toBe(200);
    expect(passwordLogin.json().customer).toMatchObject({ hasGoogle: true, hasPassword: true });
    expect((await f.app.inject({ url: '/api/customer-auth/me', headers: headers(done.json().token) })).statusCode).toBe(401);
  });

  it('consumes a completion ticket exactly once under concurrent requests', async () => {
    const f = await fixture();
    const cb = await f.callback(await f.start());
    const results = await Promise.all([f.complete(cb), f.complete(cb)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect(f.db.data.customers.filter((c) => c.googleSubject)).toHaveLength(1);
  });
});
