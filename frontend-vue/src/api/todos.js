import request from '@/utils/request'

// action: 'claim' | 'snooze' | 'complete'
export function actOnTodo(todoId, action, payload = {}) {
  return request({ url: `/api/todos/${todoId}/action`, method: 'post', data: { action, ...payload } })
}
