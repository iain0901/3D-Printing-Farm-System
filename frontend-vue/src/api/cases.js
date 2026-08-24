import axios from 'axios'
import request from '@/utils/request'
import { baseURL, requestTimeout } from '@/config'

const publicRequest = axios.create({ baseURL, timeout: Math.max(requestTimeout, 120000) })

export function estimateCase(payload) {
  return publicRequest.post('/api/public/cases/estimate', payload).then((response) => response.data.estimate)
}

export function createPublicCase(payload, files = []) {
  if (!files.length) return publicRequest.post('/api/public/cases', payload).then((response) => response.data)
  const body = new FormData()
  body.append('payload', JSON.stringify(payload))
  files.forEach((file) => body.append('files', file, file.name))
  return publicRequest
    .post('/api/public/cases', body, {
      headers: { 'Content-Type': undefined },
      timeout: 10 * 60 * 1000,
    })
    .then((response) => response.data)
}

export function fetchPublicCase(id, token) {
  return publicRequest.get(`/api/public/cases/${id}`, { params: { token } }).then((response) => response.data.case)
}

export function decidePublicCase(id, token, decision, note = '') {
  return publicRequest.post(`/api/public/cases/${id}/decision`, { token, decision, note }).then((response) => response.data)
}

export function fetchCases(params) {
  return request({ url: '/api/cases', method: 'get', params })
}

export function fetchCase(id) {
  return request({ url: `/api/cases/${id}`, method: 'get' })
}

export function updateCase(id, data) {
  return request({ url: `/api/cases/${id}`, method: 'patch', data })
}

export function transitionCase(id, status, reason = '', override = false) {
  return request({ url: `/api/cases/${id}/transition`, method: 'post', data: { status, reason, override } })
}

export function createCaseQuote(id, data) {
  return request({ url: `/api/cases/${id}/quotes`, method: 'post', data })
}

export function autoQuote(data) {
  return request({ url: '/api/quotes/auto', method: 'post', data })
}

export function recordCasePayment(id, data) {
  return request({ url: `/api/cases/${id}/payments`, method: 'post', data })
}

export function createCaseOrcaSlice(id, data) {
  return request({ url: `/api/cases/${id}/orca-slice`, method: 'post', data })
}

export function approveCaseSlicerJob(id, jobId) {
  return request({ url: `/api/cases/${id}/slicer-jobs/${jobId}/approve`, method: 'post', data: {} })
}

export function createCaseProductionJobs(id) {
  return request({ url: `/api/cases/${id}/production-jobs`, method: 'post', data: {} })
}

export function suggestCaseSchedule(id, data) {
  return request({ url: `/api/cases/${id}/scheduling-suggestion`, method: 'post', data })
}

export function confirmCaseSchedule(id, data) {
  return request({ url: `/api/cases/${id}/schedule/confirm`, method: 'post', data })
}

export function suggestCaseScheduleAutomatically(id) {
  return request({ url: `/api/cases/${id}/schedule/suggest`, method: 'post', data: {} })
}

export function recordPrintAttempt(id, data) {
  return request({ url: `/api/cases/${id}/print-attempts`, method: 'post', data })
}

export function recordQualityCheck(id, data) {
  return request({ url: `/api/cases/${id}/quality-checks`, method: 'post', data })
}

export function updateCaseDelivery(id, data) {
  return request({ url: `/api/cases/${id}/delivery`, method: 'post', data })
}

export function createCaseAfterSales(id, data) {
  return request({ url: `/api/cases/${id}/aftersales`, method: 'post', data })
}
