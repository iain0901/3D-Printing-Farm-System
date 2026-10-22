import { prepareStationModel } from '../utils/prepare-station-model'
self.onmessage = async ({ data }) => {
  try {
    const models = data.map((item) => prepareStationModel(item.buffer, item.transform))
    await Promise.all(
      models.map(async (model) => {
        model.triangleCount = new DataView(model.buffer).getUint32(80, true)
        // Bind triangle paint to the exact transformed binary STL sent to future slicing.
        model.geometryHash = crypto.subtle
          ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', model.buffer)), (b) => b.toString(16).padStart(2, '0')).join('')
          : ''
      })
    )
    self.postMessage(
      { models },
      models.map((item) => item.buffer)
    )
  } catch (error) {
    self.postMessage({ error: error.message || '模型處理失敗' })
  }
}
