import request from '@/utils/request'

export function fetchAiKnowledge() {
  return request({ url: '/api/ai-knowledge', method: 'get' })
}

export function createAiKnowledge(data) {
  return request({ url: '/api/ai-knowledge', method: 'post', data })
}

export function updateAiKnowledge(id, data) {
  return request({ url: `/api/ai-knowledge/${id}`, method: 'patch', data })
}

export function deleteAiKnowledge(id) {
  return request({ url: `/api/ai-knowledge/${id}`, method: 'delete' })
}
