/**
 * @description 模型/G-code 檔案庫 + 資料夾。被 Files/Slicer/Queue（hot-drop）等多個視圖共用，
 * 且接收 WS/SSE 的 state 帧增量推送。
 */

const state = () => ({
  list: [],
  folders: [],
})
const getters = {
  list: (state) => state.list,
  folders: (state) => state.folders,
}
const mutations = {
  setAll(state, files) {
    state.list = Array.isArray(files) ? files : []
  },
  setFolders(state, folders) {
    state.folders = Array.isArray(folders) ? folders : []
  },
  patchOne(state, file) {
    const index = state.list.findIndex((item) => item.id === file.id)
    if (index === -1) state.list.push(file)
    else state.list.splice(index, 1, { ...state.list[index], ...file })
  },
  removeOne(state, fileId) {
    state.list = state.list.filter((item) => item.id !== fileId)
  },
}
const actions = {
  setAll({ commit }, files) {
    commit('setAll', files)
  },
  setFolders({ commit }, folders) {
    commit('setFolders', folders)
  },
  patchOne({ commit }, file) {
    commit('patchOne', file)
  },
  removeOne({ commit }, fileId) {
    commit('removeOne', fileId)
  },
}
export default { state, getters, mutations, actions }
