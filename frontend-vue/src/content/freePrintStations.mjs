// Public station directory. Do not infer machine availability or eligibility from this list.
export const freePrintStations = [
  {
    id: 'nthu-shuimu',
    name: '水木書苑',
    institution: '國立清華大學',
    category: '校園站點',
    description: '從校園裡的一個想法開始，讓你的模型有機會成為實體。',
    path: '/free-print/nthu-shuimu',
  },
]

export function getFreePrintStation(id) {
  return typeof id === 'string' ? freePrintStations.find((station) => station.id === id) || null : null
}

export const freePrintSteps = [
  { title: '選擇站點', detail: '先確認你要前往的地點，再查看該站的使用說明。' },
  { title: '準備模型', detail: '準備 3D 模型，確認尺寸、單位與列印方向。' },
  { title: '線上切片', detail: '上傳 STL、調整模型與設定，查看切片時間、用料與逐層路徑；尚不會自動排隊送印。' },
  { title: '到場確認與取件', detail: '依現場指引確認平台與操作方式，完成後取件並整理工作區。' },
]
