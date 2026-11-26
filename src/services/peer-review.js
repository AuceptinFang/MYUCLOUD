import { getAssignmentDetail, assertUcloudOk } from '../api/ucloud.js'
import { getPeerReviews, getPeerReview, submitPeerReview } from '../api/peer-review.js'
import { canReview, hasPeerReview, normalizePeerReviewTask, actionableReviewRows, reviewPayload } from '../utils/peer-review.js'

const defaultApi = { getPeerReviews, getPeerReview, submitPeerReview, getAssignmentDetail }
function dataOf(call, label) { assertUcloudOk(call.result, label); return call.result.body?.data }

export async function getAllPeerReviews(token, assignmentId, { signal, api = defaultApi } = {}) {
  const rows = []
  const seen = new Set()
  for (let current = 1; ; current++) {
    const data = dataOf(await api.getPeerReviews(token, assignmentId, { current, size: 100, signal }), '读取互评列表')
    if (!Array.isArray(data?.records) || !Number.isInteger(Number(data.total)) || Number(data.total) < 0) throw new Error('互评列表格式异常，请到原站核对。')
    for (const row of data.records) {
      if (!row.id || seen.has(String(row.id)) || ![0, 1, 2, 3].includes(Number(row.isEvaluated))) throw new Error('互评列表不完整，请刷新重试。')
      seen.add(String(row.id))
      rows.push(row)
    }
    if (rows.length >= Number(data.total)) return rows
    if (!data.records.length) throw new Error('互评列表未读取完整，请刷新重试。')
  }
}

export async function loadPeerReviewTasks(token, assignments, { previous = [], api = defaultApi } = {}) {
  const errors = []
  const tasks = []
  const queue = assignments.filter((assignment) => hasPeerReview(assignment))
  let cursor = 0
  async function worker() {
    while (cursor < queue.length) {
      const assignment = queue[cursor++]
      try {
        const detail = dataOf(await api.getAssignmentDetail(token, String(assignment.id)), '读取互评信息')
        if (!hasPeerReview(assignment, detail)) continue
        const rows = await getAllPeerReviews(token, String(assignment.id), { api })
        if (rows.length) tasks.push(normalizePeerReviewTask(assignment, detail, rows))
      } catch {
        errors.push(String(assignment.id))
        const old = previous.find((task) => task.activityId === String(assignment.id))
        if (old) tasks.push(old)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker))
  return { tasks, errors }
}

export function batchReviewCandidates(rows, rules, now = Date.now()) {
  return actionableReviewRows(rows, rules, now)
}

// 只提交用户明确选定的统一评分；逐份回读确认，失败即停，不自动重试写请求。
export async function submitReviewBatch({ token, assignmentId, plannedIds, rules, score, evaluation, signal, onProgress = () => {}, api = defaultApi }) {
  reviewPayload('validation', score, evaluation)
  if (!plannedIds.length) throw new Error('没有可提交的未评作业。')
  const rows = batchReviewCandidates(await getAllPeerReviews(token, assignmentId, { signal, api }), rules)
  const ids = rows.map((row) => String(row.id)).sort()
  const expected = [...plannedIds].map(String).sort()
  if (JSON.stringify(ids) !== JSON.stringify(expected)) throw new Error('待评名单已变化，请刷新名单后重新确认。')
  const completed = []
  const skipped = []
  for (const row of rows) {
    if (signal?.aborted) break
    let attempted = false
    try {
      if (!canReview(row, rules)) throw new Error('互评已不在开放时间内。')
      const existing = dataOf(await api.getPeerReview(token, String(row.id), { signal }), '核对当前评分')
      if (!existing || !Number.isFinite(Number(existing.score))) throw new Error('未能核对当前评分，请刷新后重试。')
      // 已被其他页面评分的记录不覆盖。
      if (Number(existing?.score) > 0) { skipped.push(String(row.id)); onProgress({ completed: completed.length, skipped: skipped.length, total: rows.length }); continue }
      attempted = true
      dataOf(await api.submitPeerReview(token, String(row.id), score, evaluation, { signal }), '提交互评')
      const saved = dataOf(await api.getPeerReview(token, String(row.id), { signal }), '核对互评结果')
      if (Number(saved?.score) !== Number(score) || String(saved?.evaluation ?? '') !== evaluation) throw new Error('学校记录与本次评分不一致。')
      completed.push(String(row.id))
      onProgress({ completed: completed.length, skipped: skipped.length, total: rows.length })
    } catch (cause) {
      return { completed, skipped, stopped: String(row.id), uncertain: attempted, error: cause.message }
    }
  }
  return { completed, skipped, cancelled: !!signal?.aborted }
}
