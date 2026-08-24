/**
 * @description 公共布局组件注册与主题样式引入
 */

const requireComponents = require.context('./components', true, /\.vue$/)

export const registerLayoutComponents = (app) => {
  requireComponents.keys().forEach((fileName) => {
    const componentConfig = requireComponents(fileName)
    const componentName = componentConfig.default.name
    app.component(componentName, componentConfig.default || componentConfig)
  })
}

// 使用 require.context 安全地导出主题样式
const requireThemes = require.context('@/styles/themes', true, /\.scss$/)
requireThemes.keys().forEach((fileName) => {
  // 使用 require.context 直接引入，避免动态字符串拼接
  requireThemes(fileName)
})
