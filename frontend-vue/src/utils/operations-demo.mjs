// Explicit synthetic presentation data. Never merged into API state or machine commands.
import { simulateClefInspection } from './clef-inspection-demo.mjs'
export const DEMO_VERSION = 1
export const isoDay = (date) => new Date(date).toISOString().slice(0, 10)
export const addDays = (date, days) => isoDay(Date.parse(date.slice(0, 10) + 'T12:00:00Z') + days * 86400000)
export function makeOperationsDemo(today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })) {
  const machines = [
    { id: 'DEMO-HI-01', name: '01 號・水木', status: 'printing', progress: 63, hours: 1284, job: '展示訂單 021 · 花盆支架', image: 0, events: 6, lastService: -82, intervals: [88, 94, 89] },
    { id: 'DEMO-HI-02', name: '02 號・工坊', status: 'printing', progress: 28, hours: 962, job: '展示訂單 022 · 間隔柱 × 3', image: 1, events: 1, lastService: -28, intervals: [91, 87, 93] },
    { id: 'DEMO-HI-03', name: '03 號・實驗室', status: 'error', progress: 41, hours: 1720, job: '展示訂單 023 · 支架重印', image: 2, events: 9, lastService: -90, intervals: [85, 92, 90] },
    { id: 'DEMO-HI-04', name: '04 號・備援', status: 'maintenance', progress: 0, hours: 660, job: '已預留保養時段', image: 3, events: 0, lastService: -89, intervals: [89, 95, 91] },
    { id: 'DEMO-HI-05', name: '05 號・新機', status: 'offline', progress: 0, hours: 18, job: '等待連線與初次建檔', image: null, events: 0, lastService: -3, intervals: [] },
  ].map(p => ({ ...p, model: 'Creality Hi', material: '3DSTU_PETG', lastService: addDays(today, p.lastService),
    history: p.intervals.map((interval, i) => ({ id: `${p.id}-H${i + 1}`, date: addDays(today, p.lastService - p.intervals.slice(0, i).reduce((a, b) => a + b, 0)), interval, action: i % 2 ? '清理擠出輪並調整張力' : '清潔噴嘴與檢查送料路徑', hours: 290 + i * 24 })),
  }))
  return { version: DEMO_VERSION, today, tick: 0, machines, tasks: [{ id: 'DEMO-M04', printerId: 'DEMO-HI-04', title: '送料輪清理與潤滑', date: addDays(today, 1), time: '10:00', duration: 60, status: 'scheduled', owner: '展示工程師', evidence: ['DEMO-HI-04-H1'] }],
    reviews: [], logs: [
      { id: 'L301', printerId: 'DEMO-HI-03', time: '09:42:18', severity: 'error', code: 'DEMO_EXTRUSION_INTERRUPTED', text: '送料異常累計 9 次；工作已暫停，等待人工檢查。' },
      { id: 'L101', printerId: 'DEMO-HI-01', time: '09:40:03', severity: 'warning', code: 'DEMO_FEED_RETRY', text: '近七日送料重試由 2 次增加至 6 次。' },
      { id: 'L201', printerId: 'DEMO-HI-02', time: '09:38:51', severity: 'info', code: 'DEMO_LAYER_COMPLETE', text: '第 84 層完成，溫度落在展示目標範圍內。' },
    ] }
}
export function forecastMachine(machine, today) {
  if (machine.intervals.length < 3 || machine.status === 'offline') return { status: 'insufficient', reason: '缺少三個完整保養間隔或最新連線資料，先安排人工巡檢。', evidence: [] }
  const sorted = [...machine.intervals].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const elapsed = Math.max(0, Math.floor((Date.parse(today) - Date.parse(machine.lastService)) / 86400000))
  const advance = machine.events >= 5 ? 7 : 0
  const remaining = Math.max(0, median - elapsed - advance)
  return { status: machine.status === 'error' || remaining <= 3 ? 'urgent' : 'planned', median, elapsed, remaining,
    earliest: addDays(today, Math.max(0, sorted[0] - elapsed - advance)), latest: addDays(today, Math.max(0, sorted.at(-1) - elapsed - advance)),
    date: addDays(today, remaining), evidence: machine.history.map(h => h.id),
    reason: `最近 ${sorted.length} 次間隔為 ${machine.intervals.join('、')} 天，中位數 ${median} 天；距上次保養 ${elapsed} 天。${advance ? '七日異常達 5 次，展示規則將檢查提前 7 天。' : '目前沒有觸發提前檢查門檻。'}` }
}
export function scheduleMaintenance(state, input) {
  const machine = state.machines.find(p => p.id === input.printerId)
  if (!machine || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time) || !input.owner?.trim()) throw new Error('請填寫有效機台、日期、時間及負責人。')
  const parsedDay = Date.parse(input.date + 'T12:00:00Z')
  if (!Number.isFinite(parsedDay) || isoDay(parsedDay) !== input.date) throw new Error('請選擇有效日期。')
  if (input.date < state.today) throw new Error('請選擇今天或之後的日期。')
  const duration = Number(input.duration)
  if (!Number.isFinite(duration) || duration < 15 || duration > 240) throw new Error('保養時間須為 15～240 分鐘。')
  const start = Date.parse(`${input.date}T${input.time}:00+08:00`), end = start + duration * 60000
  if (state.tasks.some(t => t.status !== 'done' && (t.printerId === machine.id || t.owner === input.owner.trim()) && (() => {
    const s = Date.parse(`${t.date}T${t.time}:00+08:00`); return start < s + t.duration * 60000 && end > s
  })())) throw new Error('機台或負責人的保養時段重疊，請換一個時間。')
  if (machine.status === 'printing' && input.date === state.today) throw new Error('今天仍有列印工作；展示排程請選明天以後，或先由人員確認生產時段。')
  const task = { id: `DEMO-M${state.tasks.length + 100}`, ...input, duration, owner: input.owner.trim(), status: 'scheduled', title: '送料與噴嘴預防檢查', evidence: forecastMachine(machine, state.today).evidence }
  state.tasks.push(task); return task
}
export const inspectionCases = [
  { id: 'QC-023', order: '展示訂單 023', printerId: 'DEMO-HI-03', title: '支架・疑似層間裂縫', scenario: 'defect', result: 'hold', summary: '270° 示意影像的底部接合處出現裂縫，退回人工檢查。', findings: [{ angle: 3, label: '底部層間裂縫', x: 31, y: 76, action: '確認是否分層；檢查送料與材料乾燥狀態。' }] },
  { id: 'QC-021', order: '展示訂單 021', printerId: 'DEMO-HI-01', title: '支架・可見外觀檢查', scenario: 'clear', result: 'pass', summary: '四個可見角度未標註明顯外觀缺陷；底面未拍攝，仍需人工確認。', findings: [] },
  { id: 'QC-024', order: '展示訂單 024', printerId: 'DEMO-HI-02', title: '支架・影像不足', scenario: 'missing', result: 'review', summary: '缺少背面與底部影像，無法判定；請補拍。', findings: [] },
]
export function inspectionResult(item, angles, threshold = 0.85) {
  return simulateClefInspection(item, angles, threshold)
}
export function replayEvent(state) {
  state.tick += 1
  const printer = state.machines[state.tick % 3]
  if (printer.status === 'printing') printer.progress = Math.min(99, printer.progress + 1)
  const log = { id: `REPLAY-${state.tick}`, printerId: printer.id, time: `+${state.tick * 5} 秒`, severity: printer.status === 'error' ? 'error' : 'info', code: 'DEMO_REPLAY', text: printer.status === 'error' ? '異常仍待人工確認，未送出任何機台命令。' : `展示進度更新至 ${printer.progress}%。` }
  state.logs.unshift(log); state.logs = state.logs.slice(0, 40)
}
