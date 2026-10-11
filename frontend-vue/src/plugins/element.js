import ElementPlus from 'element-plus'
import zhTw from 'element-plus/es/locale/lang/zh-tw'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const setupElement = (app) => {
  // 全局注册所有 Element Plus 图标组件，模板内可直接使用 <el-icon><Search /></el-icon>，
  // 也让 el-button icon="Search" / el-input prefix-icon="Search" 的字符串形式可用。
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }
  // 統一採用繁體中文元件文案。
  app.use(ElementPlus, { locale: zhTw, size: 'small' })
}

export default setupElement
