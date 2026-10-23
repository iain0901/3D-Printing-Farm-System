// Original image-model illustrations. No canvas/SVG/CSS-drawn substitutes.
// Each ID has at most two curated placements across canonical pages/states.
export const instructionArtwork = {
  upload: { title: '把模型帶進來', note: '準備檔案、實際尺寸與用途，讓後續討論有依據。', alt: '模型檔案、網格立方體與上傳方向示意' },
  measure: { title: '先確認關鍵尺寸', note: '標出孔位、配合面與預期尺寸，重要公差建議先試件。', alt: '游標卡尺與 L 型零件的尺寸檢查示意' },
  filament: { title: '從 PETG 開始討論', note: '一般功能件優先考慮 PETG，仍需依受力與環境確認。', alt: '線軸、線材與 FDM 層紋試片示意' },
  orientation: {
    title: '換個方向，再看一次',
    note: '方向會影響表面、支撐與層間受力，不只是在畫面上轉一轉。',
    alt: '同一個零件調整方向並放平的示意',
  },
  layers: {
    title: '理解逐層成型',
    note: '層紋、薄壁與小細節都要一起考慮，預覽不等於實際成品保證。',
    alt: '噴嘴沿著水平層紋堆疊模型的示意',
  },
  support: { title: '替懸空處留支撐', note: '支撐接觸面可能留下痕跡，主要展示面請先說明。', alt: '懸空模型與可拆除的暫時支撐示意' },
  layout: { title: '留出平台與間距', note: '確認模型邊界、擺放與彼此間距，再開始切片。', alt: '多個模型分開擺放在列印平台上的示意' },
  color: {
    title: '把想要的配色說清楚',
    note: '用色槽整理需求；實際色材、多色相容性與換料方式仍需確認。',
    alt: '三種顏色線材與配色試片示意',
  },
  account: { title: '讓需求接回你的帳號', note: '登入後保存模型與草稿，從會員中心接續製作計畫。', alt: '會員資料卡與模型連結的示意' },
  review: { title: '把條件一起確認', note: '用途、材料、數量與交付條件確認後，再接續正式報價。', alt: '案件規格夾板、零件與檢查記號示意' },
  pickup: { title: '接著確認交付', note: '依案件或站點通知安排取件，不把送出需求當作已保留名額。', alt: '裝有模型的提袋與取件標籤示意' },
  save: { title: '替每個版本留個位置', note: '保存原始檔、方向與製程設定，避免不同版本混在一起。', alt: '模型專案資料夾與版本檔案示意' },
  library: {
    title: '整理你的模型庫',
    note: '使用能辨識的名稱與專案分類，下次就能更快找到正確版本。',
    alt: '檔案整理盤、模型圖與列印零件示意',
  },
  station: {
    title: '從一個在地站點開始',
    note: '目前僅清華大學水木書苑；資格、時段與安排依站點確認。',
    alt: '書苑櫃台、模型與地點標記的情境示意，非實際建築',
  },
  assembly: {
    title: '一起考慮怎麼組起來',
    note: '卡扣、定位、孔位與接縫先說清楚，必要時用試件確認。',
    alt: '兩片外殼與定位柱拆解組裝示意',
  },
  school: {
    title: '讓研究有個可試的模型',
    note: '從教具、專題到研究治具，把用途與驗證方式一起帶來。',
    alt: '實驗筆記與模組化教學模型示意',
  },
}

export const homeInstructionArtwork = ['upload', 'account', 'review', 'pickup']
export const instructionPlacements = {
  '/': homeInstructionArtwork,
  '/materials': ['filament', 'layers'],
  '/guides/file-prep': ['measure', 'library', 'save'],
  '/guides/fdm-design': ['orientation', 'support', 'assembly'],
  '/process': ['account', 'review', 'layers', 'pickup'],
  '/for/education': ['school'],
  '/for/business': ['assembly'],
  '/for/personal': ['color'],
  '/services/research-lab': ['school'],
  '/services/industrial-parts': ['measure'],
  '/services/personal-print': ['orientation'],
  '/services/rush-print': ['support'],
  '/free-print': ['station'],
  '/free-print/nthu-shuimu': ['station', 'filament'],
  '/portal/workspace?section=models': ['library'],
  '/portal/workspace?section=drafts': ['save'],
  '/cloud-slicer': ['layout'],
  '/free-print/nthu-shuimu/slicer': ['layout'],
  '/quote': ['upload', 'color'],
}

export function instructionItems(placement) {
  return (instructionPlacements[placement] || []).map((id) => ({ id, ...instructionArtwork[id] }))
}
