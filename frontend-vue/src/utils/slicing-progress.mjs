// Only upload exposes a measured percentage. Queue / engine / preview have no percentage API.
export function slicingProgress({ uploading, uploadPercent, job, preview, previewLoading, error, pollError }) {
  if (uploading) {
    const percent = Number.isFinite(uploadPercent) ? Math.max(0, Math.min(100, uploadPercent)) : null
    return {
      phase: 'upload',
      step: 0,
      title: percent === 100 ? '模型已上傳，正在建立工作' : '正在上傳模型',
      detail: '僅代表檔案上傳進度，不是整體切片百分比。',
      percent,
    }
  }
  if (!job) return error ? { phase: 'failed', step: 0, title: '未能建立切片工作', detail: error, percent: null } : null
  const states = {
    queued: { phase: 'queued', step: 1, title: '等待切片服務', detail: '工作已建立，等待運算服務接手；不是現場列印排隊。' },
    processing: {
      phase: 'processing',
      step: 2,
      title: '正在切片',
      detail: 'OrcaSlicer 正在運算。引擎尚未提供百分比，完成後自動載入路徑。',
    },
    failed: { phase: 'failed', step: 2, title: '切片失敗', detail: '請查看下方錯誤，檢查模型與設定後重新切片。' },
    cancelled: { phase: 'cancelled', step: 2, title: '已取消切片', detail: '已停止等待這次工作，不會採用晚到的結果。' },
    completed: preview
      ? { phase: 'completed', step: 4, title: '切片完成，路徑已就緒', detail: '可切換圖層與播放路徑；這不會啟動印表機。', percent: 100 }
      : { phase: 'preview', step: 3, title: '正在讀取切片路徑', detail: '引擎已完成，正在取得實際 G-code 的路徑預覽。' },
  }
  const state = states[job.status]
  if (!state) return null
  if (pollError && !['failed', 'cancelled'].includes(job.status))
    return { ...state, phase: 'paused', title: '進度查詢暫停', detail: pollError, percent: null }
  return { percent: null, ...state, previewLoading: !!previewLoading }
}
