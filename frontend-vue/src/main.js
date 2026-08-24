import { createApp } from 'vue'
import App from './App'
import store from './store'
import router from './router'
import setupPlugins from './plugins'
import '@/layouts/export'

// 本项目始终对接真实后端 (api/server.mjs)，不使用模板自带的 mock XHR 拦截，
// 也不打印模板作者的控制台推广信息（原 printLayoutsInfo/donationConsole）。
const app = createApp(App)
app.use(store)
app.use(router)
setupPlugins(app)
app.mount('#vue-admin-better')
