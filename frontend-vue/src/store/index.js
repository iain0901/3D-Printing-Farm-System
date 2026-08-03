/**
 * @author https://github.com/zxwk1998/vue-admin-better （不想保留author可删除）
 * @description 导入所有 vuex 模块，自动加入namespaced:true，用于解决vuex命名冲突，请勿修改。
 */

import Vue from 'vue'
import Vuex from 'vuex'

Vue.use(Vuex)
const files = require.context('./modules', false, /\.js$/)
const modules = {}

files.keys().forEach((key) => {
  modules[key.replace(/(\.\/|\.js)/g, '')] = files(key).default
})
Object.keys(modules).forEach((key) => {
  modules[key]['namespaced'] = true
})

// 自动加载 store/plugins/*.js（例如 realtime.js），与 modules 一样自动发现，无需手动注册
const pluginFiles = require.context('./plugins', false, /\.js$/)
const plugins = pluginFiles.keys().map((key) => pluginFiles(key).default)

const store = new Vuex.Store({
  modules,
  plugins,
})
export default store
