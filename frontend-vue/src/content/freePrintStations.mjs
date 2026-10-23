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
  { title: '切片與排隊', detail: '上傳 STL 並完成切片；站點開放時可登入加入排隊，輪到你會寄 Email 通知。' },
  { title: '引導列印與取件', detail: '到場依步驟準備並開始列印。完成後收到 Email，取件並確認平台清空，系統再通知下一位。' },
]
