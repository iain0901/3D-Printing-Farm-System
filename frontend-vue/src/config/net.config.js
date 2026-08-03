/**
 * @description 导出默认网路配置
 * 本项目后端 (api/server.mjs) 不使用 {code,msg,data} 信封格式：
 * 成功时直接返回原始 JSON，失败时返回 { error, ...extra } 并以 HTTP 状态码表达语义。
 * 与 src/App.tsx 中 VITE_LAYERPILOT_API_URL 的约定保持一致：开发环境默认指向本机后端，
 * 生产环境默认空字符串（同源，由 Fastify 静态托管前端产物）。
 **/
const network = {
  baseURL: process.env.VUE_APP_API_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:8797'),
  //后端固定接受 application/json
  contentType: 'application/json;charset=UTF-8',
  //消息框消失时间
  messageDuration: 3000,
  //最长请求时间
  requestTimeout: 15000,
  //登录失效对应的 HTTP 状态码
  invalidCode: 401,
  //无权限对应的 HTTP 状态码
  noPermissionCode: 403,
  //账户临时锁定对应的 HTTP 状态码
  lockedCode: 423,
}
module.exports = network
