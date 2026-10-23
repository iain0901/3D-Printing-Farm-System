import JSZip from 'jszip'

export function checkpointWorkspace(key, snapshot) {
  const metadata = snapshot ? { ...snapshot, models: snapshot.models.map(({ file, ...model }) => model) } : { cleared: true }
  try {
    const serialized = JSON.stringify(metadata)
    if (serialized.length > 4 * 1024 * 1024) return false
    localStorage.setItem(`3drfm-checkpoint:${key}`, serialized)
    return true
  } catch {
    return false
  }
}

function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('3drfm-model-workspaces', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('workspaces')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('此瀏覽器無法保存本機工作，請下載完整專案。'))
  })
}
export async function localWorkspace(key, value) {
  const db = await database()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('workspaces', value === undefined ? 'readonly' : 'readwrite')
      const store = tx.objectStore('workspaces')
      const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key)
      tx.oncomplete = () => {
        let result = request.result
        if (value === undefined) {
          try {
            const checkpoint = JSON.parse(localStorage.getItem(`3drfm-checkpoint:${key}`) || 'null')
            if (checkpoint?.cleared) result = null
            else if (
              result?.models &&
              checkpoint?.models &&
              Date.parse(checkpoint.savedAt) >= Date.parse(result.savedAt) &&
              result.models.length === checkpoint.models.length &&
              result.models.every((m, i) => m.sourceFingerprint === checkpoint.models[i].sourceFingerprint)
            )
              result = { ...checkpoint, models: checkpoint.models.map((m, i) => ({ ...m, file: result.models[i].file })) }
          } catch {}
        } else if (value === null) localStorage.removeItem(`3drfm-checkpoint:${key}`)
        resolve(result)
      }
      tx.onerror = () => reject(new Error('本機保存失敗，請下載完整專案。'))
      tx.onabort = tx.onerror
    })
  } finally {
    db.close()
  }
}
export function captureWorkspace(layout, settings, extra = {}) {
  return {
    schemaVersion: '3drfm.local-workspace.v1',
    savedAt: new Date().toISOString(),
    settings: JSON.parse(JSON.stringify(settings)),
    ...JSON.parse(JSON.stringify(extra)),
    models: layout.models.map((model, index) => ({
      id: model.id,
      name: model.name,
      file: layout.sources[index],
      transform: { ...model.transform },
      position: { ...model.position },
      hidden: !!model.hidden,
      sourceFingerprint: `${model.id}:${model.name}:${layout.sources[index]?.size}:${layout.sources[index]?.lastModified || 0}`,
    })),
  }
}
export async function exportWorkspace(snapshot) {
  const zip = new JSZip()
  const manifest = { ...snapshot, models: snapshot.models.map(({ file, ...model }, i) => ({ ...model, source: `sources/${i}.stl` })) }
  zip.file('workspace.json', JSON.stringify(manifest))
  for (let i = 0; i < snapshot.models.length; i++) zip.file(`sources/${i}.stl`, await snapshot.models[i].file.arrayBuffer())
  return new Blob([await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })], { type: 'application/zip' })
}
export async function importWorkspace(file) {
  if (file.size > 30 * 1024 * 1024) throw new Error('完整專案上限 30 MB。')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files)
  if (entries.length > 14 || entries.reduce((n, e) => n + (e._data?.uncompressedSize || 0), 0) > 30 * 1024 * 1024)
    throw new Error('專案解壓縮內容過大。')
  const entry = zip.file('workspace.json')
  if (!entry) throw new Error('請選擇 3DRFM 完整專案 ZIP。')
  const result = JSON.parse(await entry.async('string'))
  if (
    result.schemaVersion !== '3drfm.local-workspace.v1' ||
    !Array.isArray(result.models) ||
    !result.models.length ||
    result.models.length > 5
  )
    throw new Error('專案格式無效。')
  let size = 0
  for (const [i, model] of result.models.entries()) {
    if (!/\.stl$/i.test(model.name)) throw new Error('專案模型必須為 STL。')
    const source = zip.file(`sources/${i}.stl`)
    if (!source) throw new Error('專案缺少原始模型。')
    const bytes = await source.async('uint8array')
    size += bytes.length
    if (size > 10 * 1024 * 1024) throw new Error('原始模型合計上限 10 MB。')
    model.file = new File([bytes], model.name)
  }
  return result
}
