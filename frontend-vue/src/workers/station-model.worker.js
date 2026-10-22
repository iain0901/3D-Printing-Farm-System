import { prepareStationModel } from '../utils/prepare-station-model'

self.onmessage = ({ data }) => {
  try {
    const result = prepareStationModel(data.buffer, data.transform)
    self.postMessage(result, [result.buffer])
  } catch (error) {
    self.postMessage({ error: error.message || '無法解析模型' })
  }
}
