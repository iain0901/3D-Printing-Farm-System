// Transparent planning heuristic, not learned failure probability or machine control.
export function scheduleDifficulty(job) {
  if (Number.isInteger(job.difficulty) && job.difficulty >= 1 && job.difficulty <= 5)
    return { level: job.difficulty, source: "operator", reasons: ["員工指定難度"] };
  let level = 1;
  const reasons = [];
  const support = job.settings?.support ?? job.settings?.supports;
  if (support === true || /^(on|auto|yes|enabled|開啟|自動)$/i.test(String(support || ""))) { level++; reasons.push("需求包含支撐，保留人工確認時間"); }
  const dims = job.dimensions;
  if (Array.isArray(dims) && dims.length === 3 && dims.every((n) => Number.isFinite(n) && n > 0) && dims[2] / Math.min(dims[0], dims[1]) > 4) { level++; reasons.push("目前外框細高，需確認固定"); }
  if (Number(job.settings?.inserts) > 0 || job.postProcessing?.length) { level++; reasons.push("嵌件或後處理需求"); }
  return { level, source: "explicit-planning-rules", reasons, limitation: "難度為排程啟發式，非強度驗證或已學習的失敗率。" };
}
export function difficultyDuration(job, minutes) {
  const difficulty = scheduleDifficulty(job);
  const bufferMinutes = Math.ceil(Math.max(0, minutes) * (difficulty.level - 1) * 0.05);
  return { ...difficulty, printMinutes: minutes, bufferMinutes, reservedMinutes: minutes + bufferMinutes };
}
