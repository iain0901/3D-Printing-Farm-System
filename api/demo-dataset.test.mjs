import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareDemo } from '../demo/prepare.mjs';
import { buildServer, openDatabase } from './server.mjs';
import { createObjectStorage } from './object-storage.mjs';
import { forecastFleetMaintenance } from './maintenance-advisor.mjs';
import { demoRequestAllowed } from './demo-safety.mjs';

let directory, app, db, report;
const password = 'isolated-fixture-password-only';
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), '3drfm-demo-test-'));
  report = await prepareDemo(join(directory, 'bundle'), password);
  db = await openDatabase(join(directory, 'bundle/state.json'), { adapter: 'json' });
  app = await buildServer({ db, demoMode: true, serveStatic: false,
    objectStorageAdapter: createObjectStorage({ provider: 'local', root: join(directory, 'bundle/storage') }),
    emailClient: { sendMail: vi.fn(() => { throw new Error('must not email'); }) },
    lineClient: { configured: true, push: vi.fn(() => { throw new Error('must not push'); }) },
    stripeClient: null, chatwootClient: { configured: false } });
}, 60000);
afterAll(async () => { await app?.close(); if (directory) await rm(directory, { recursive: true }); });

describe('isolated demonstration: genuine assets and coherent workflow', () => {
  it('has 6 registered people, 18 cases, real models/drafts and no fake sliced file', () => {
    expect(report.counts).toMatchObject({ customers: 6, cases: 18, memberDrafts: 6, printers: 5 });
    expect(db.data.files.every(f => f.type === 'STL' && !f.sliced)).toBe(true);
    expect(db.data.customers.every(c => c.email.endsWith('@demo.invalid') && c.passwordHash)).toBe(true);
    expect(db.data.slicerJobs).toEqual([]);
    for (const c of db.data.cases) {
      expect(db.data.customers.some(u => u.id === c.customerId)).toBe(true);
      expect(c.fileIds.every(id => db.data.files.some(f => f.id === id))).toBe(true);
      if (c.orderId) expect(db.data.orders.find(o => o.id === c.orderId)?.caseId).toBe(c.id);
    }
  });
  it('keeps real bytes available through member download and isolates other members', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/customer-auth/login', payload: { email: 'school@demo.invalid', password } });
    expect(response.statusCode).toBe(200);
    const headers = { authorization: `Bearer ${response.json().token}` };
    const customer = db.data.customers.find(c => c.email === 'school@demo.invalid');
    const model = db.data.memberModels.find(m => m.customerId === customer.id);
    const download = await app.inject({ url: `/api/customer/workspace/models/${model.id}/file`, headers });
    expect(download.statusCode).toBe(200);
    expect(download.rawPayload.length).toBeGreaterThan(1000000);
    const other = db.data.memberModels.find(m => m.customerId !== customer.id);
    expect((await app.inject({ url: `/api/customer/workspace/models/${other.id}/file`, headers })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/customer/workspace', headers })).statusCode).toBe(200);
    const quoted = db.data.cases.find(c => c.customerId === customer.id && c.status === 'formal_quote_sent');
    const accept = await app.inject({ method: 'POST', url: `/api/customer/cases/${quoted.id}/decision`, headers, payload: { decision: 'accepted', note: '展示接受報價' } });
    expect(accept.statusCode, accept.body).toBe(200);
    const order = await app.inject({ method: 'POST', url: `/api/customer/workspace/cases/${quoted.id}/checkout-order`, headers, payload: {} });
    expect(order.statusCode, order.body).toBe(201);
    expect(order.json().order.caseId).toBe(quoted.id);
  });
  it('gives the real optimizer linked jobs, honors the urgent one, skips oversize and unavailable machines', () => {
    expect(report.scheduling.scheduled[0].jobId).toBe('demo-job-4-0');
    expect(report.scheduling.skipped.some(j => j.jobId === 'demo-oversized')).toBe(true);
    expect(report.scheduling.scheduled.every(j => !['demo-hi-4', 'demo-hi-5'].includes(j.printerId))).toBe(true);
    expect(db.data.queue.find(j => j.id === 'demo-job-4-0').stage).toBe('needs scheduling');
    expect(report.scheduling.scheduled.some(j => j.difficulty?.bufferMinutes > 0)).toBe(true);
  });
  it('provides enough peer observations for a real statistical calculation, not fabricated AI answers', () => {
    const forecast = forecastFleetMaintenance(db.data.maintenanceAdvisorRecords[0].observations, 'demo-hi-1');
    expect(forecast.status).toBe('estimate'); expect(forecast.peerCount).toBe(2);
    expect(db.data.agentReviews).toEqual([]);
  });
  it('blocks real effects, cannot masquerade as normal database, and cannot overwrite existing data', async () => {
    for (const url of ['/api/actions', '/api/bridges/x/test', '/api/internal/worker-cycle', '/api/customer/workspace/orders/x/checkout', '/api/notificationChannels', '/api/customer/free-print/commands']) {
      const result = await app.inject({ method: 'POST', url, payload: {} });
      expect(result.statusCode).toBe(403);
      expect(result.json().code).toBe('DEMO_SIDE_EFFECT_DISABLED');
    }
    expect(demoRequestAllowed('POST', '/api/schedule/optimize')).toBe(true);
    expect(demoRequestAllowed('GET', '/api/customer/agent/commands')).toBe(true);
    expect(demoRequestAllowed('POST', '/api/customer/agent/commands/fixture/claim')).toBe(true);
    expect(demoRequestAllowed('POST', '/api/staff-agent/mcp')).toBe(true);
    expect(demoRequestAllowed('GET', '/api/customer/workspace/billing')).toBe(true);
    expect(demoRequestAllowed('POST', '/api/slicer/jobs')).toBe(false);
    const before = await readFile(join(directory, 'bundle/state.json'));
    await expect(prepareDemo(join(directory, 'bundle'), password)).rejects.toThrow();
    expect(await readFile(join(directory, 'bundle/state.json'))).toEqual(before);
    await expect(buildServer({ db, serveStatic: false })).rejects.toThrow('展示資料');
    expect((await app.inject('/api/demo/status')).json().active).toBe(true);
  });
});
