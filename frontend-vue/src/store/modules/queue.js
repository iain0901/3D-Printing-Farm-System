/**
 * @description 打印队列（含后端已按 todoActions 处理过的 todos 派生结果）。被 Dashboard/Queue/
 * Scheduler/Todos 等多个视图共用，且接收 WS/SSE 的 state 帧增量推送。
 */

const state = () => ({
  list: [],
  // 后端 deriveTodos() 的结果：已合并 claim/snooze/complete 等 todoActions，比前端重新派生更可靠
  todos: [],
})
const getters = {
  list: (state) => state.list,
  todos: (state) => state.todos,
}
const mutations = {
  setAll(state, queue) {
    state.list = Array.isArray(queue) ? queue : []
  },
  setTodos(state, todos) {
    state.todos = Array.isArray(todos) ? todos : []
  },
  patchOne(state, job) {
    const index = state.list.findIndex((item) => item.id === job.id)
    if (index === -1) state.list.push(job)
    else state.list.splice(index, 1, { ...state.list[index], ...job })
  },
}
const actions = {
  setAll({ commit }, queue) {
    commit('setAll', queue)
  },
  setTodos({ commit }, todos) {
    commit('setTodos', todos)
  },
  patchOne({ commit }, job) {
    commit('patchOne', job)
  },
}
export default { state, getters, mutations, actions }
