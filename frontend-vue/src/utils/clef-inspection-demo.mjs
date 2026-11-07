// Verified Clef question types; fixture answers only, no network or image inference.
export function clefQuestionSet(prefix, referenceIndex, photoIndex) {
  const pair = `比較圖片 ${referenceIndex + 1}（模型渲染）與圖片 ${photoIndex + 1}（實拍），只看這一對；忽略正常層紋、材質及光照差異。`
  return {
    [`${prefix}.quality`]: { type: 'choice', instructions: pair + '判定可見外觀；角度不匹配、模糊或遮擋時選 review。不得推斷內部強度或尺寸公差。', criteria: { pass: '可見外觀未見明顯缺陷', defect: '可見缺料、裂縫、分層或明顯形變', review: '資料不足或無法確定，需補拍／人工複核' } },
    [`${prefix}.layer_split`]: { type: 'noul', instructions: pair + '是否有可見的層間裂縫？' },
    [`${prefix}.missing_material`]: { type: 'noul', instructions: pair + '是否有相對模型可見的缺料？' },
    [`${prefix}.recapture`]: { type: 'noul', instructions: pair + '是否因模糊、遮擋或角度不符而需要補拍？' },
  }
}
export function simulateClefInspection(item, angles, threshold = 0.85) {
  if (!Number.isFinite(threshold) || threshold < 0.7 || threshold > 0.99) throw new Error('展示門檻須介於 0.70～0.99。')
  const received = new Set(angles.filter(a => Number.isInteger(a) && a >= 0 && a < 4))
  const comparisons = [0,1,2,3].map(index => {
    const angle = index * 90, available = received.has(index) && !(item.scenario === 'missing' && index > 1)
    const defect = item.scenario === 'defect' && index === 3
    const pass = [0.97,0.96,0.95,0.96][index]
    const probabilities = defect ? { pass: 0.02, defect: 0.94, review: 0.04 } : { pass, defect: 0.02, review: Number((0.98 - pass).toFixed(2)) }
    const choice = defect ? 'defect' : 'pass'
    const answer = available ? { type: 'choice', choice, probabilities, confidence: defect ? 0.94 : pass } : null
    return { angle, referenceId: `${item.id}-model-v1-${angle}`, photoId: available ? `${item.id}-photo-${angle}` : null,
      status: !available ? 'missing' : answer.confidence < threshold ? 'review' : choice,
      answer, checks: available ? { layer_split: { type: 'noul', noul: defect ? 0.96 : 0.02 }, missing_material: { type: 'noul', noul: defect ? 0.18 : 0.03 }, recapture: { type: 'noul', noul: 0.02 } } : null }
  })
  // At most two image pairs (4 embedded images) per request, per official schema.
  const validPairs = comparisons.filter(p => p.photoId), batches = []
  for (let i = 0; i < validPairs.length; i += 2) {
    const pairs = validPairs.slice(i, i + 2), questions = {}, imageRefs = []
    pairs.forEach((p, j) => { imageRefs.push(p.referenceId, p.photoId); Object.assign(questions, clefQuestionSet(`view_${p.angle}`, j * 2, j * 2 + 1)) })
    batches.push({ batch: batches.length + 1, model: 'clef-flash', imageRefs, state: { caseId: item.id, material: '3DSTU_PETG', imageOrder: imageRefs, scope: 'visible_surface_only' }, questions })
  }
  const evidence = { comparisons, batches, threshold, source: 'synthetic-clef-decision-v1', provider: 'simulation', model: null, targetModel: '@cf/cloudflare/clef-flash', usage: null }
  if (comparisons.some(c => c.status === 'missing')) return { ...evidence, result: 'review', summary: '影像不足，請補拍四個角度後再送人工複核。', findings: [] }
  if (comparisons.some(c => c.status === 'defect')) return { ...evidence, result: 'hold', summary: item.summary, findings: item.findings }
  if (comparisons.some(c => c.status === 'review')) return { ...evidence, result: 'review', summary: '部分角度的決策信心低於目前展示門檻，轉人工複核；信心值不是經過驗證的品管準確率。', findings: [] }
  return { ...evidence, result: 'pass', summary: item.summary, findings: [] }
}
