// Frontend draft contract. This deliberately does NOT call the legacy slicer.
import { validateSurfacePaint } from './surface-paint.mjs'
export const quoteMaterials = [
  { id: 'PETG', label: 'PETG', note: '優先推薦・兼顧韌性與日常功能件需求', recommended: true },
  { id: 'PLA', label: 'PLA', note: '展示、外觀原型與一般模型' },
  { id: 'ABS', label: 'ABS', note: '功能外殼；須確認耐熱需求與收縮' },
  { id: 'ASA', label: 'ASA', note: '戶外用途可討論；須確認環境條件' },
  { id: 'TPU', label: 'TPU 軟料', note: '柔性保護件；硬度及多色供料另行確認' },
  { id: 'Nylon', label: 'PA 尼龍', note: '工程應用；牌號、乾燥及尺寸穩定性需確認' },
]
export const quotePalette = [
  { label: '暖白', hex: '#f5f3e9' },
  { label: '墨黑', hex: '#25292b' },
  { label: '岩灰', hex: '#929a9d' },
  { label: '海藍', hex: '#386fa4' },
  { label: '森林綠', hex: '#38745a' },
  { label: '朱紅', hex: '#c94c3f' },
  { label: '暖橘', hex: '#e38a36' },
  { label: '芥黃', hex: '#d6b64a' },
]
export const MAX_COLOR_SLOTS = 8 // Editor limit, NOT a machine capability.
export const MAX_HEIGHT_BANDS = 8
export const defaultQuoteSettings = () => ({
  advanced: {},
  material: 'PETG',
  colorMode: 'single',
  layerHeight: 0.2,
  infill: 15,
  walls: 2,
  autoSupports: true,
  autoOrient: false,
  autoArrange: false,
  dueDate: '',
  rush: false,
  notes: '',
})

export function validateQuoteDraft(layout, settings, slots, assignments) {
  const issues = []
  if (!layout.models?.length || !layout.ready || layout.files.length !== layout.models.length)
    issues.push('請先加入有效模型，完成方向與平台布局。')
  if (!quoteMaterials.some((m) => m.id === settings.material)) issues.push('請選擇支援的 FDM 材料。')
  if (!['single', 'multi'].includes(settings.colorMode)) issues.push('請選擇單色或多色。')
  if (
    !Array.isArray(slots) ||
    !slots.length ||
    slots.length > MAX_COLOR_SLOTS ||
    new Set(slots.map((s) => s.id)).size !== slots.length ||
    slots.some((s) => !s.id || !/^#[0-9a-f]{6}$/i.test(s.hex) || !s.label?.trim())
  )
    issues.push('色槽需有不重複的編號、色名及有效色碼。')
  if (![0.12, 0.16, 0.2, 0.28].includes(settings.layerHeight)) issues.push('請選擇有效層高。')
  if (!Number.isInteger(settings.infill) || settings.infill < 0 || settings.infill > 100) issues.push('填充率須為 0–100 的整數。')
  if (!Number.isInteger(settings.walls) || settings.walls < 1 || settings.walls > 12) issues.push('外壁圈數須為 1–12 的整數。')
  for (const model of layout.models || []) {
    const assignment = assignments[model.id]
    if (!assignment || !Number.isInteger(assignment.quantity) || assignment.quantity < 1 || assignment.quantity > 10000) {
      issues.push(`${model.name}：請填寫 1–10000 的整數數量。`)
      continue
    }
    if (settings.colorMode === 'single') continue
    const paintError = validateSurfacePaint(assignment.surfacePaint, model, slots)
    if (paintError) issues.push(`${model.name}：${paintError}`)
    if (!slots.some((s) => s.id === assignment.slotId)) issues.push(`${model.name}：請指定基底色槽。`)
    const bands = assignment.bands || []
    if (bands.length > MAX_HEIGHT_BANDS) issues.push(`${model.name}：最多 ${MAX_HEIGHT_BANDS} 個換色區間。`)
    const sorted = [...bands].sort((a, b) => a.from - b.from)
    for (let i = 0; i < sorted.length; i++) {
      const band = sorted[i]
      if (
        !Number.isFinite(band.from) ||
        !Number.isFinite(band.to) ||
        band.from < 0 ||
        band.to <= band.from ||
        band.to > (model.dimensions?.[2] || 0) + 0.001 ||
        !slots.some((s) => s.id === band.slotId)
      )
        issues.push(`${model.name}：換色區間必須在模型高度內，且指定有效色槽。`)
      if (i && band.from < sorted[i - 1].to) issues.push(`${model.name}：換色區間不可重疊。`)
    }
    if (bands.length && settings.autoOrient) issues.push('高度換色需固定模型方向，請關閉切片器自動定向。')
  }
  return [...new Set(issues)]
}

export function createQuoteDraft(layout, settings, slots, assignments) {
  const issues = validateQuoteDraft(layout, settings, slots, assignments)
  if (issues.length) throw new Error(issues.join('；'))
  const activeSlots = settings.colorMode === 'single' ? slots.slice(0, 1) : slots
  return {
    schemaVersion: '3drfm.quote-workspace.v2',
    purpose: 'paid-quote',
    status: 'awaiting_machine_profile',
    machineProfileId: null,
    materialProfileId: null,
    referenceBed: { width: 260, depth: 260, height: 260, unit: 'mm', isProductionBed: false },
    geometry: {
      bakedScaleAndRotation: true,
      localOrigin: 'xy-centered-z-grounded',
      placements: 'plate-center-mm',
      quantityLayout: 'one-copy-preview-per-model',
    },
    settings: { ...settings },
    colorSlots: activeSlots.map((s) => ({
      id: s.id,
      label: s.label.trim(),
      hex: s.hex,
      material: settings.material,
      filamentProfileId: null,
    })),
    models: layout.models.map((model, index) => ({
      id: model.id,
      name: model.name,
      fileIndex: index,
      dimensions: [...model.dimensions],
      sourceTransform: { ...model.transform },
      hidden: !!model.hidden,
      placement: { ...model.position },
      quantity: assignments[model.id].quantity,
      baseSlotId: settings.colorMode === 'single' ? slots[0].id : assignments[model.id].slotId,
      heightBands:
        settings.colorMode === 'single' ? [] : assignments[model.id].bands.map((b) => ({ from: b.from, to: b.to, slotId: b.slotId })),
      surfacePaint:
        settings.colorMode === 'single' || !Object.keys(assignments[model.id].surfacePaint || {}).length
          ? null
          : {
              encoding: 'stl-triangle-slot-v1',
              geometrySha256: model.geometryHash,
              triangleCount: model.triangleCount,
              priority: 'surface-over-height-over-base',
              faces: Object.entries(assignments[model.id].surfacePaint)
                .map(([face, slotId]) => [Number(face), slotId])
                .sort((a, b) => a[0] - b[0]),
            },
    })),
    estimate: null,
  }
}

export function modelAppearance(models, settings, slots, assignments) {
  const getColor = (id) => slots.find((s) => s.id === id)?.hex || slots[0]?.hex || '#d7e0e8'
  return Object.fromEntries(
    models.map((model) => {
      const a = assignments[model.id]
      return [
        model.id,
        {
          color: getColor(settings.colorMode === 'single' ? slots[0]?.id : a?.slotId),
          faces: settings.colorMode === 'single' ? {} : a?.surfacePaint || {},
          bands:
            settings.colorMode === 'single'
              ? []
              : (a?.bands || [])
                  .filter((b) => Number.isFinite(b.from) && Number.isFinite(b.to) && b.to > b.from)
                  .slice(0, MAX_HEIGHT_BANDS)
                  .map((b) => ({ from: b.from, to: b.to, color: getColor(b.slotId) })),
        },
      ]
    })
  )
}
