import { prepareStationModel } from '../utils/prepare-station-model'
self.onmessage = ({ data }) => {
  try {
    const models = data.map((item) => prepareStationModel(item.buffer, item.transform))
    self.postMessage(
      { models },
      models.map((item) => item.buffer)
    )
  } catch (error) {
    self.postMessage({ error: error.message || '模型處理失敗' })
  }
}
