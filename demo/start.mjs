import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = process.argv[2] && resolve(process.argv[2]);
if (!directory) throw new Error('用法：npm run demo:start -- /獨立/demo/目錄');
// Check before openDatabase migrations can write anything.
const existing = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
if (existing.demoManifest?.version !== 1) throw new Error('不是本工具建立的隔離展示資料庫，拒絕啟動。');
if (process.env.DEMO_ALLOW_OPENAI !== 'true') delete process.env.OPENAI_API_KEY;
// Do not inherit deployment bootstrap credentials or start background workers.
delete process.env.LAYERPILOT_ADMIN_EMAIL;
delete process.env.LAYERPILOT_ADMIN_PASSWORD;
const { openDatabase, buildServer } = await import('../api/server.mjs');
const { createObjectStorage } = await import('../api/object-storage.mjs');
const db = await openDatabase(join(directory, 'state.json'), { adapter: 'json' });
// Development auth migration may add legacy seed accounts. They are never demo logins.
db.data.users = db.data.users.filter(u => ['demo-owner', 'demo-operator'].includes(u.id));
await db.write();
const app = await buildServer({ db, demoMode: true, serveStatic: fileURLToPath(new URL('../frontend-vue/dist', import.meta.url)),
  objectStorageAdapter: createObjectStorage({ provider: 'local', root: join(directory, 'storage') }),
  emailClient: null, lineClient: null, stripeClient: null, chatwootClient: { configured: false },
});
const address = await app.listen({ host: '127.0.0.1', port: Number(process.env.DEMO_PORT || 3080) });
console.log(`隔離展示已啟動：${address}；帳號清單位於 report.json。沒有啟動 worker 或機台。`);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { await app.close(); process.exit(0); });
