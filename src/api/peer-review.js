import { fetchBackend } from './http.js'
import { businessHeaders, readResponse } from './ucloud.js'
import { reviewPayload } from '../utils/peer-review.js'

// 官方 course.3b66a1e759c394024404 → 49.82497c0523bf44da63d7 / 55.f06acec32b69a933cc2a。
// evaluation-list 与 evaluation-submit 是 POST + 查询参数，不是 JSON 请求体。
async function requestReview(token, path, method, params, signal) {
  const request = { url: `/ucloud/ykt-site/work/${path}?${new URLSearchParams(params)}`, method, headers: businessHeaders(token) }
  const response = await fetchBackend(request.url, { ...request, signal })
  return { request, result: await readResponse(response) }
}

export function getPeerReviews(token, assignmentId, { current = 1, size = 8, signal } = {}) {
  return requestReview(token, 'evaluation-list', 'POST', { assignmentId, current: String(current), size: String(size) }, signal)
}

export function getPeerReview(token, id, { signal } = {}) {
  return requestReview(token, 'evaluation-view', 'GET', { id }, signal)
}

export function submitPeerReview(token, id, score, evaluation, { signal } = {}) {
  return requestReview(token, 'evaluation-submit', 'POST', reviewPayload(id, score, evaluation), signal)
}
