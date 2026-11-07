import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, buildServer, optimizeScheduleQueue } from '../api/server.mjs';
import { createObjectStorage } from '../api/object-storage.mjs';
import { inspectMemberStl } from '../api/member-workspace.mjs';
import { caseIntakeSchema, createQuoteVersion } from '../api/case-domain.mjs';
import { createCaseFromIntake } from '../api/cases-module.mjs';
import { assets, sourceHashes } from './assets.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const ws = 'ws-default';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const note = '展示情境：虛構人物與交易；重量／工時為規劃假設，未實際切片、付款或列印。';
export const personas = [
  ['school', '林同學（展示）', '校園成果展組', '組裝船模型教學展示，不作承重用途'],
  ['studio', '陳設計師（展示）', '文創工作室', '組裝船頂配件，展示表面與顏色'],
  ['lab', '吳助教（展示）', '教學實驗室', '列印料架底座；需要先確認負載、方向與壁厚'],
  ['company', '王工程師（展示）', '小量製造公司', '設備旋鈕備件，需確認軸孔尺寸及裝配公差'],
  ['personal', '黃同學（展示）', '個人修繕', '風扇墊片，急件但仍須核對尺寸與工作溫度'],
  ['research', '李研究員（展示）', '機構研究小組', '皮帶固定件，需確認張力及層向，不憑填充率保證強度'],
];
const stages = [
  ['new', 'supplement_requested', 'formal_quote_sent'],
  ['accepted', 'revision_requested', 'awaiting_payment'],
  ['production_pending', 'printing', 'completed'],
  ['production_pending', 'quality_check', 'ready_for_delivery'],
  ['production_pending', 'awaiting_payment', 'aftersales'],
  ['production_pending', 'ready_to_print', 'completed'],
];
export function multipart(payload, files) {
  const boundary = 'demo-' + randomBytes(12).toString('hex');
  const chunks = [Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${JSON.stringify(payload)}\r\n`)];
  for (const f of files) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${f.field || 'files'}"; filename="${f.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), f.bytes, Buffer.from('\r\n'));
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}
function grounded(bytes) {
  const result = Buffer.from(bytes), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const count = result.readUInt32LE(80);
  for (let face = 0; face < count; face++) for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
    const value = result.readFloatLE(84 + face * 50 + 12 + v * 12 + a * 4);
    min[a] = Math.min(min[a], value); max[a] = Math.max(max[a], value);
  }
  const offset = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  for (let face = 0; face < count; face++) for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
    const at = 84 + face * 50 + 12 + v * 12 + a * 4;
    result.writeFloatLE(result.readFloatLE(at) - offset[a], at);
  }
  return result;
}
export async function verifiedAssets() {
  const result = [];
  for (const asset of assets) {
    const bytes = await readFile(join(root, 'models', asset.file));
    if (hash(bytes) !== asset.sha256) throw new Error(`模型雜湊不符：${asset.file}`);
    result.push({ ...asset, bytes, inspection: inspectMemberStl(bytes) });
  }
  for (const [file, expected] of Object.entries(sourceHashes))
    if (hash(await readFile(join(root, 'sources', file))) !== expected) throw new Error(`編輯來源雜湊不符：${file}`);
  return result;
}

export async function prepareDemo(directory, password) {
  if (!directory || !password || password.length < 14) throw new Error('指定全新目錄與至少 14 字元的 DEMO_PASSWORD；不接受既有資料庫。');
  const models = await verifiedAssets();
  const target = resolve(directory);
  // Atomic exclusive creation: never overwrite, merge, reset or clear an existing directory.
  await mkdir(target, { recursive: false, mode: 0o700 });
  const db = await openDatabase(join(target, 'state.json'), { adapter: 'json' });
  const retain = new Set(['roles', 'permissions', 'workspaces']);
  for (const key of Object.keys(db.data)) if (Array.isArray(db.data[key]) && !retain.has(key)) db.data[key] = [];
  const salt = randomBytes(16).toString('hex');
  const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
  db.data.users = [
    { id: 'demo-operator', workspaceId: ws, name: '展示操作員', email: 'operator@demo.invalid', role: 'Operator', passwordHash, location: '展示工作區' },
    { id: 'demo-owner', workspaceId: ws, name: '展示管理員', email: 'admin@demo.invalid', role: 'Owner', passwordHash, location: '展示工作區' },
  ];
  db.data.demoManifest = { version: 1, label: '3DRFM 完整流程展示', createdAt: new Date().toISOString(), estimateBasis: note };
  db.data.profileDefaults = { Machine: '', Process: '', Filament: '' };
  db.data.freePrintStations = []; // Existing module creates the real named station, disabled without bridge.
  const storage = createObjectStorage({ provider: 'local', root: join(target, 'storage') });
  const app = await buildServer({ db, demoMode: true, serveStatic: false, objectStorageAdapter: storage,
    emailClient: null, lineClient: null, stripeClient: null, chatwootClient: { configured: false } });
  const now = new Date();
  const iso = days => new Date(now.getTime() + days * 86400000).toISOString();
  const call = async (url, payload, headers = {}) => {
    const response = await app.inject({ method: 'POST', url, payload, headers });
    if (response.statusCode >= 400) throw new Error(`${url}: ${response.statusCode} ${response.body}`);
    return response.json();
  };
  try {
    const colors = [['Black', '#222222'], ['White', '#eeeeee'], ['Orange', '#f97316']];
    db.data.printers = ['idle', 'idle', 'idle', 'maintenance', 'offline'].map((status, i) => ({
      id: `demo-hi-${i + 1}`, workspaceId: ws, name: `展示 Hi ${i + 1}`, model: 'Creality Hi', nozzleDiameter: 0.4,
      status, location: i < 3 ? '展示生產區' : '展示維護區', connection: '展示，未連實機', filament: `PETG ${colors[i % 3][0]}`,
      compatibleMaterials: ['PETG'], buildVolume: [260, 260, 300], progress: 0, nozzle: 0, bed: 0, utilization: 0, uptime: 0, queue: 0,
    }));
    db.data.spools = colors.map(([name, color], i) => ({ id: `demo-spool-${i}`, workspaceId: ws, brand: '3DSTU_PETG', material: 'PETG', color, colorName: name, remaining: i === 2 ? 120 : 2800, location: `展示料架 ${i + 1}` }));
    db.data.maintenance = [{ id: 'demo-maintenance', workspaceId: ws, title: '噴嘴與進料輪人工檢查（展示）', printer: '展示 Hi 4', status: 'in progress', due: 'Today', severity: 'High', progress: '1/3' }];
    db.data.purchaseRequests = [{ id: 'demo-purchase', workspaceId: ws, spoolId: 'demo-spool-2', material: 'PETG', brand: '3DSTU_PETG', color: '#f97316', quantity: 2, targetGrams: 1000, priority: 'High', status: 'open', supplier: '展示供應商', due: 'This week', note: '橘色庫存偏低；展示需求，不會下採購單。' }];
    const accounts = [];
    for (let i = 0; i < personas.length; i++) {
      const [slug, name, company, purpose] = personas[i], model = models[i];
      const email = `${slug}@demo.invalid`;
      const account = await call('/api/customer-auth/register', { name, email, password, phone: '' });
      const headers = { authorization: `Bearer ${account.token}` };
      const customer = db.data.customers.find(c => c.id === account.customer.id);
      Object.assign(customer, { company, tags: ['展示資料', slug], notes: note });
      accounts.push({ email, name });
      const { project } = await call('/api/customer/workspace/projects', { name: `${company}｜展示專案`, type: ['school', 'business', 'lab', 'business', 'personal', 'lab'][i], reference: `DEMO-${slug}` }, headers);
      const body = multipart({ projectId: project.id }, [{ name: model.file, bytes: model.bytes }]);
      const uploaded = await call('/api/customer/workspace/models', body.payload, { ...headers, ...body.headers });
      const savedModel = db.data.memberModels.find(m => m.id === uploaded.model.id);
      const file = db.data.files.find(f => f.id === savedModel.fileId);
      Object.assign(file, { material: 'PETG', tags: ['展示資料', model.license], demoSource: model.file });
      const baked = grounded(model.bytes), info = inspectMemberStl(baked);
      const settings = { material: 'PETG', colorMode: 'single', layerHeight: 0.2, infill: i === 2 ? 5 : 20, walls: i === 2 ? 2 : 3, autoSupports: false, autoOrient: false, autoArrange: false, dueDate: iso(2).slice(0, 10), rush: i === 4, notes: purpose };
      const draftBody = multipart({ name: `${model.title}｜可繼續編輯`, projectId: project.id, manifest: {
        schemaVersion: '3drfm.quote-workspace.v2', settings,
        colorSlots: [{ id: 'slot-1', label: colors[i % 3][0], hex: colors[i % 3][1] }],
        models: [{ id: 'model-1', name: model.file, fileIndex: 0, dimensions: info.dimensions,
          sourceTransform: { scale: 100, x: 0, y: 0, z: 0, layFlat: false }, placement: { x: 130, y: 130 }, quantity: 1, baseSlotId: 'slot-1', heightBands: [], surfacePaint: null }],
      } }, [{ name: model.file, bytes: baked }, { name: model.file, bytes: model.bytes, field: 'sources' }]);
      const { draft } = await call('/api/customer/workspace/drafts', draftBody.payload, { ...headers, ...draftBody.headers });
      for (let j = 0; j < 3; j++) {
        const status = stages[i][j], quantity = j === 0 ? [1, 4, 12, 20, 2, 6][i] : 1;
        const grams = [45, 8, 60, 6, 4, 12][i] * quantity;
        const intake = caseIntakeSchema.parse({ customer, mode: 'estimate', source: 'website', hasModel: true,
          project: `${model.title}｜${j + 1} 號展示案件`, purpose, dueDate: iso(i === 4 ? 0 : 2 + j).slice(0, 10), budget: grams * 2,
          notes: note, defaults: { material: 'PETG', color: colors[i % 3][0], quantity, layerHeight: '0.20 mm', infill: settings.infill, walls: settings.walls, support: 'None' }, fileIds: [file.id],
        });
        const { caseRecord: c } = createCaseFromIntake(db, intake, { actor: { name: '展示資料建立器' } });
        Object.assign(c, { status, createdAt: iso(-8 + j), demo: true, demoEstimate: { grams, minutes: [120, 35, 360, 180, 20, 100][i], basis: note },
          deliveryPreference: { method: 'pickup', note: '展示取件安排，無真實地址' },
          statusHistory: [{ id: `demo-history-${i}-${j}`, workspaceId: ws, caseId: c.id, from: '', to: status, at: iso(0), reason: `展示初始狀態，非真實處理紀錄。${note}`, actorName: '展示資料建立器' }],
          memberProjectId: project.id, workspaceDraft: structuredClone(draft.manifest), workspaceModelIds: [...draft.modelIds] });
        db.data.caseStatusHistory = db.data.caseStatusHistory.filter(h => h.caseId !== c.id).concat(c.statusHistory);
        if (j === 0) db.data.memberMessages.push({ id: `demo-message-${i}`, workspaceId: ws, customerId: customer.id, caseId: c.id, author: 'customer', authorName: name,
          body: `展示留言：${purpose}。請確認孔徑與交期後再安排製作。`, createdAt: iso(-1) });
        if (!['new', 'supplement_requested'].includes(status)) {
          const version = createQuoteVersion(c, { breakdown: { material: grams * 2 }, send: true, scope: `3DSTU_PETG，單價 NT$2/g。${note}` }, { name: '展示管理員' }, new Date(iso(-6 + j)));
          if (!['formal_quote_sent', 'revision_requested'].includes(status)) version.status = 'accepted';
        }
        if (['accepted', 'awaiting_payment', 'production_pending', 'ready_to_print', 'printing', 'quality_check', 'ready_for_delivery', 'completed', 'aftersales'].includes(status)) {
          const order = { id: `demo-order-${i}-${j}`, workspaceId: ws, customerId: customer.id, caseId: c.id, customer: name,
            source: 'Website', items: [`${model.title} × ${quantity}`], status: ['accepted', 'awaiting_payment'].includes(status) ? 'received' : status === 'completed' ? 'completed' : status === 'printing' ? 'printing' : 'queued',
            due: c.dueDate, value: grams * 2, currency: 'TWD', paymentStatus: ['accepted', 'awaiting_payment'].includes(status) ? 'unpaid' : 'paid', createdAt: c.createdAt, updatedAt: iso(0), notes: note, demo: true };
          order.quoteVersionId = c.currentQuoteVersionId;
          order.payment = { provider: 'demo', status: order.paymentStatus, amount: order.value, currency: 'TWD',
            transactionId: `DEMO-NOT-A-TRANSACTION-${i}-${j}`, paidAt: order.paymentStatus === 'paid' ? iso(-2) : '', note };
          if (['ready_for_delivery', 'completed'].includes(status)) {
            c.delivery = { method: 'pickup', carrier: '現場取件（展示）', trackingNumber: '', status: status === 'completed' ? 'delivered' : 'ready', note };
            order.delivery = c.delivery;
          }
          db.data.orders.push(order); c.orderId = order.id; c.memberOrderId = order.id; c.paymentStatus = order.paymentStatus;
          if (status === 'completed') {
            order.pointsEarned = 5; order.completedAt = iso(-1);
            customer.loyaltyPoints = (customer.loyaltyPoints || 0) + 5;
          }
          if (['production_pending', 'ready_to_print', 'printing', 'quality_check', 'ready_for_delivery', 'completed', 'aftersales'].includes(status)) {
            const id = `demo-job-${i}-${j}`;
            const queued = ['production_pending', 'ready_to_print'].includes(status);
            db.data.queue.push({ id, workspaceId: ws, sourceOrderId: order.id, sourceCaseId: c.id, fileId: file.id, file: model.file,
              status: queued ? 'queued' : status === 'printing' ? 'printing' : 'complete', stage: queued ? 'needs scheduling' : status === 'printing' ? 'printing' : 'post processing', priority: i === 4 ? 'Rush' : 'Normal', due: i === 4 ? 'Today 10:00' : 'Tomorrow 17:00',
              material: 'PETG', color: colors[i % 3][0], dimensions: model.inspection.dimensions, quantity,
              time: i === 2 ? '6h 00m' : i === 4 ? '0h 20m' : i === 3 ? '3h 00m' : '1h 40m', difficulty: i === 5 ? 5 : 1,
              cost: grams * 2, estimateGrams: grams, settings, assignee: '展示管理員', printerId: status === 'printing' ? 'demo-hi-3' : '', printer: status === 'printing' ? '展示 Hi 3' : '', scheduledStart: status === 'printing' ? '08:00' : '', demo: true, notes: note });
            if (status === 'printing') Object.assign(db.data.printers[2], { status: 'printing', job: model.file, progress: 38 });
            c.productionJobIds.push(id);
          }
        }
        if (status === 'aftersales') db.data.memberRequests.push({ id: 'demo-support', workspaceId: ws, customerId: customer.id, type: 'reprint', caseId: c.id, orderId: c.orderId, status: 'pending', note: '展示：裝配孔徑需要複測，請先聯絡確認後再安排重印。', createdAt: iso(-1), updatedAt: iso(0), replies: [], attachments: [] });
      }
      if (i < 3) db.data.freePrintReservations.push({ id: `demo-free-${i}`, stationId: 'nthu-shuimu', workspaceId: ws, customerId: customer.id,
        status: i === 2 ? 'completed' : 'queued', sequence: i + 1, modelNames: [model.file], profileName: 'Creality Hi / 0.4 / 3DSTU_PETG（展示，未切片）',
        gcodeFileId: '', filename: '尚未產生 G-code（展示）', estimatedMinutes: [120, 35, 90][i], checks: {},
        createdAt: iso(-1), updatedAt: iso(0), finishedAt: i === 2 ? iso(0) : undefined,
        history: [{ at: iso(0), status: i === 2 ? 'completed' : 'queued', note: '虛構排隊／完成情境，無機台控制權，無真實切片檔。' }], demo: true });
    }
    // One controlled oversized case: a scale change is explicit, never falsify the source mesh dimensions.
    const base = db.data.queue[0];
    db.data.queue.push({ ...structuredClone(base), id: 'demo-oversized', file: `${base.file}（放大至 400 mm 寬，展示待拆件）`, dimensions: [400, 180, 150], sourceOrderId: '', sourceCaseId: '', difficulty: 3, notes: '放大規劃情境；原檔未改動，需回編輯拆件，不應派到 260 mm 機台。' });
    const observations = [];
    for (let p = 1; p <= 3; p++) for (let n = 0; n < 4; n++) observations.push({ printerId: `demo-hi-${p}`, observedAt: iso(-90 + n * 25), totalPrintHours: n * (p === 1 ? 25 : 90 + p * 15), abnormalEvents: n * p, serviced: p === 1 ? n === 0 : true });
    db.data.maintenanceAdvisorRecords = [{ id: 'demo-observations', workspaceId: ws, advisorType: 'observations', createdBy: 'demo-owner', createdAt: iso(0), observations, demo: true }];
    const comparison = optimizeScheduleQueue(structuredClone(db.data), { strategy: 'multi-factor' });
    const report = { version: 1, createdAt: iso(0), accounts: [{ email: 'operator@demo.invalid', name: '展示操作員' }, { email: 'admin@demo.invalid', name: '展示管理員，首次登入需兩步驗證' }, ...accounts],
      counts: Object.fromEntries(['customers', 'memberModels', 'memberDrafts', 'cases', 'orders', 'queue', 'printers'].map(k => [k, db.data[k].length])),
      models: models.map(({ bytes, ...a }) => a), queueBeforeOptimization: db.data.queue.filter(j => j.status === 'queued').map(j => ({ id: j.id, time: j.time, due: j.due, difficulty: j.difficulty, color: j.color })), scheduling: comparison,
      limitations: [note, '沒有偽造已成功切片的 G-code；免費站點控制待實機，不偽造控制權。', 'AI 需設定自己的 OpenAI key；沒有預填假的模型回答。'] };
    db.data.sessions = []; db.data.customerSessions = [];
    await db.write();
    await writeFile(join(target, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    await chmod(join(target, 'state.json'), 0o600);
    return report;
  } finally { await app.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await prepareDemo(process.argv[2], process.env.DEMO_PASSWORD);
    console.log(JSON.stringify({ ready: true, counts: report.counts, accounts: report.accounts, credentials: '密碼採 DEMO_PASSWORD，不列印、不寫入報告。' }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
