// Public-facing guidance only: not slicer profiles, prices or engineering guarantees.
export const materialGuide = [
  { name: 'PETG', title: '日常功能件，從這裡討論。', uses: '收納配件、機構外殼、反覆使用的零件', description: '需要實用與韌性時的討論起點。', caution: '請提供受力、組裝方式與使用溫度。', heat: '較 PLA 耐熱，仍須核對牌號', strength: '韌性較佳；強度依方向與結構', price: '一般' },
  { name: 'PLA', title: '外觀件，讓想法先成型。', uses: '室內展示、教具、桌面小物', description: '想看造型、不承重且不接近熱源，可先討論 PLA。', caution: '避免高溫與長期負載。', heat: '較低，避免熱源與車內', strength: '剛性佳，不適合反覆彎折', price: '入門' },
  { name: 'ABS', title: '有指定需求，再評估製程。', uses: '既有 ABS 零件配合、功能外殼', description: '適合已有明確材料需求的案件，製作前需確認尺寸與環境。', caution: '需評估收縮與變形。', heat: '較 PLA 高，依牌號確認', strength: '可討論韌性與功能需求', price: '一般至較高' },
  { name: 'ASA', title: '戶外用途，先看日照環境。', uses: '戶外外殼、耐候設備配件', description: '有日曬與耐候需求時可納入討論。', caution: '請提供安裝方式與環境；需評估收縮。', heat: '較 PLA 高，依牌號確認', strength: '適合討論戶外功能件', price: '較高' },
  { name: 'TPU', title: '需要彎折或緩衝的選擇。', uses: '保護套、緩衝墊、柔性配件', description: '需要柔軟、回彈而非硬殼時，可先討論 TPU。', caution: '軟硬感受依牌號、厚度與設定改變。', heat: '依軟硬度與牌號確認', strength: '柔性、回彈；不等於承重保證', price: '較高' },
  { name: '尼龍', title: '摩擦與受力，個別評估。', uses: '摩擦零件、特殊功能原型', description: '有磨耗或特定負載需求，需依供料與製程個別評估。', caution: '需確認吸濕、負載與使用環境。', heat: '依牌號與含水狀態確認', strength: '需依負載與製程驗證', price: '較高，個別報價' },
]

export const materialComparisonRows = materialGuide.map((item) => ({
  material: item.name,
  use: item.uses,
  feature: `耐熱：${item.heat}；強度：${item.strength}；價格等級：${item.price}`,
  check: item.caution,
  recommended: item.name === 'PETG',
}))
