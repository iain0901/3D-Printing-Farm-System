/**
 * @description 队列相关的纯函数，从 src/App.tsx 逐行移植，保持"临近到期"判定口径一致：
 * Rush 优先级永远算临近到期；到期日包含 "Today" 且优先级为 High，或到期时间 <=18 点也算。
 * 已完成/已取消的任务不算。Phase 3（Queue/Scheduler 视图）会复用同一份逻辑。
 */
export function isDueRisk(job) {
  const hour = Number((job.due || '').match(/\b(\d{1,2}):\d{2}\b/)?.[1])
  return job.status !== 'complete' && job.status !== 'cancelled' && (job.priority === 'Rush' || ((job.due || '').includes('Today') && (job.priority === 'High' || (Number.isFinite(hour) && hour <= 18))))
}
