import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const setupElement = (app) => {
  // 全局注册所有 Element Plus 图标组件，模板内可直接使用 <el-icon><Search /></el-icon>，
  // 也让 el-button icon="Search" / el-input prefix-icon="Search" 的字符串形式可用。
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }
  // size 与语言保持原 Element UI 行为（默认 small、zh-CN 文案）
  app.use(ElementPlus, { locale: zhCn, size: 'small' })
}

export default setupElement
