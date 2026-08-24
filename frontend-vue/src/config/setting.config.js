/**
 * @description 导出默认通用配置
 */
const setting = {
  // 开发以及部署时的URL
  publicPath: '/',
  // 生产环境构建文件的目录名
  outputDir: 'dist',
  // 放置生成的静态资源 (js、css、img、fonts) 的 (相对于 outputDir 的) 目录。
  assetsDir: 'static',
  // 开发环境每次保存时是否输出为eslint编译警告
  lintOnSave: true,
  // 进行编译的依赖
  transpileDependencies: [],
  //标题 （包括初次加载雪花屏的标题 页面的标题 浏览器的标题）
  title: '3DRFM 三點成型｜3D 列印代工服務',
  //简写
  abbreviation: '3drfm',
  //开发环境端口号
  devPort: '5174',
  //copyright
  copyright: '3DRFM 三點成型',
  //是否显示页面底部自定义版权信息
  footerCopyright: false,
  //是否显示顶部进度条
  progressBar: true,
  //缓存路由的最大数量
  keepAliveMaxNum: 99,
  // 路由模式，可选值为 history 或 hash
  routerMode: 'hash',
  //不经过token校验的路由
  routesWhiteList: ['/login', '/404', '/401'],
  //加载时显示文字
  loadingText: 'Loading...',
  // 后端登录/me 响应中 user 对象携带的 token 字段名（仅用于文档提示，实际 axios 头见 utils/request.js）
  tokenName: 'token',
  //token在localStorage、sessionStorage存储的key的名称
  //与现有 React 前端使用同一个 key，方便迁移期间在同一浏览器内并存
  tokenTableName: 'layerpilot-token',
  //token存储位置localStorage sessionStorage
  storage: 'localStorage',
  //token失效回退到登录页时是否记录本次的路由
  recordRoute: true,
  //是否显示logo，不显示时设置false，显示时请填写remixIcon图标名称，暂时只支持设置remixIcon
  logo: 'building-4-fill',
  //是否显示在页面高亮错误
  errorLog: ['development'],
  //是否开启登录拦截
  loginInterception: true,
  //本项目后端不支持RSA加密登录
  loginRSA: false,
  //本项目路由权限完全由前端 asyncRoutes + 后端 scopes 交叉过滤（intelligence 模式），不使用后端下发路由表
  authentication: 'intelligence',
  //vertical布局时是否只保持一个子菜单的展开
  uniqueOpened: true,
  //vertical布局时默认展开的菜单path，使用逗号隔开建议只展开一个
  defaultOopeneds: [],
  //需要加loading层的请求，防止重复提交
  debounce: [],
  //需要自动注入并加载的模块
  providePlugin: {},
  //代码生成机生成在view下的文件夹名称
  templateFolder: 'project',
  //本项目为自有二次开发，不显示模板作者的终端donation打印
  donation: false,
}
module.exports = setting
