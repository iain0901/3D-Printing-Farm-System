import { ElMessage } from 'element-plus'
import { messageDuration } from '@/config'

// 取代舊 Vue.prototype.$baseMessage 的全域提示（供非組件模組使用）
export const baseMessage = (message, type) => {
  ElMessage({
    offset: 60,
    showClose: true,
    message,
    type,
    dangerouslyUseHTMLString: true,
    duration: messageDuration,
  })
}

export default baseMessage
