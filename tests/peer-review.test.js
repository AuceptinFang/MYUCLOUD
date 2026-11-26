import assert from 'node:assert/strict'
import test from 'node:test'
import { effectScope, nextTick, ref } from 'vue'
import { usePeerReview } from '../src/composables/usePeerReview.js'
import { getPeerReview, getPeerReviews, submitPeerReview } from '../src/api/peer-review.js'
import { buildPeerReviewUrl, canReview, hasPeerReview, receivedReviews, reviewAttachmentIds, reviewPayload, reviewStatus, reviewWindow } from '../src/utils/peer-review.js'
import { normalizePeerReviewTask } from '../src/utils/peer-review.js'
import { batchReviewCandidates, getAllPeerReviews, loadPeerReviewTasks, submitReviewBatch } from '../src/services/peer-review.js'

const result = (data) => ({ result: { ok: true, status: 200, body: { code: 200, data } } })
const pause = () => new Promise((resolve) => setImmediate(resolve))
async function until(check) { for (let i = 0; i < 50; i++) { if (check()) return; await pause() } assert.fail('state did not settle') }

function setup(t, api) {
  const scope = effectScope()
  t.after(() => scope.stop())
  const token = ref('test-token')
  const assignmentId = ref('1000000000000000001')
  const rules = ref({})
  let expired = 0
  const state = scope.run(() => usePeerReview({ token, assignmentId, rules, api, expired: () => { expired++ } }))
  return { ...state, token, assignmentId, rules, expirations: () => expired }
}

test('互评开关不以标题推断，仅个人作业的学校开关生效', () => {
  assert.equal(hasPeerReview({ raw: { assignmentType: 0, isOpenEvaluation: 1 } }), true)
  assert.equal(hasPeerReview({ raw: { assignmentType: '0', isOpenEvaluation: '1' } }), true)
  assert.equal(hasPeerReview({ raw: { assignmentType: 1, isOpenEvaluation: 1 } }), false)
  assert.equal(hasPeerReview({ title: 'Lab02[互评]' }), false)
  assert.equal(hasPeerReview({ raw: { assignmentType: 0, isOpenEvaluation: 1 } }, { isOpenEvaluation: 0 }), false)
})

test('互评时间按北京时间，权限严格取学校 canEnter，0 和 false 不放行', () => {
  const rules = { evaluateStartTime: '2026-11-25 10:00:00', evaluateEndTime: '2026-11-25 12:00:00' }
  const now = Date.parse('2026-11-25T03:00:00Z')
  assert.equal(reviewWindow(rules, now), 'open')
  assert.equal(reviewWindow(rules, now - 7200000), 'not-started')
  assert.equal(reviewWindow(rules, now + 7200000), 'closed')
  for (const canEnter of [true, '1', 1]) assert.equal(canReview({ canEnter }, rules, now), true)
  for (const canEnter of [undefined, false, '0', 0, 'false']) assert.equal(canReview({ canEnter }, rules, now), false)
  assert.equal(canReview({ canEnter: true }, rules, now + 7200000), false)
  assert.equal(reviewStatus({ isEvaluated: '1' }), '已评')
})

test('评分采用官方五颗星，评语不超过 200 字，编号保持字符串精度', () => {
  assert.deepEqual(reviewPayload('1000000000000000001', '5', '完整'), { id: '1000000000000000001', score: 5, evaluation: '完整' })
  for (const score of [undefined, '', 0, -1, 5.1, 100, NaN]) assert.throws(() => reviewPayload('id', score, ''), /1 至 5/)
  assert.throws(() => reviewPayload('', 4, ''), /编号/)
  assert.throws(() => reviewPayload('id', 4, '字'.repeat(201)), /200/)
  assert.deepEqual(reviewAttachmentIds(['1', '1', null, '2']), ['1', '2'])
  assert.deepEqual(receivedReviews({ evaluationInfos: [{ score: 4, evaluation: '清晰' }] }), [{ score: 4, evaluation: '清晰' }])
  assert.match(buildPeerReviewUrl('1000000000000000001', 'Lab02[互评]'), /activeTabName=fourth&assignmentId=1000000000000000001/)
})

test('互评接口与官方 POST 查询参数和 GET 详情契约一致，评语特殊字符不改义', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => { requests.push({ url: new URL(url, 'https://example.test'), options }); return Response.json({ code: 200, data: {} }) })
  await getPeerReviews('test-token', '1000000000000000001', { current: 2, size: 8 })
  await getPeerReview('test-token', 'review-1')
  await submitPeerReview('test-token', 'review-1', 4, '建议 A&B + 中文?')
  assert.deepEqual(requests.map(({ url, options }) => [url.pathname, options.method, options.body]), [
    ['/ucloud/ykt-site/work/evaluation-list', 'POST', undefined],
    ['/ucloud/ykt-site/work/evaluation-view', 'GET', undefined],
    ['/ucloud/ykt-site/work/evaluation-submit', 'POST', undefined],
  ])
  assert.equal(requests[0].url.searchParams.get('assignmentId'), '1000000000000000001')
  assert.equal(requests[0].url.searchParams.get('current'), '2')
  assert.equal(requests[2].url.searchParams.get('evaluation'), '建议 A&B + 中文?')
  for (const { options } of requests) assert.equal(options.headers['Blade-Auth'], 'test-token')
})

test('分页、读取、显式提交后回读确认，不会在打开页面时自动评分', async (t) => {
  let writes = 0
  let stored = { assignmentContent: '实验报告', attachmentIds: ['f1'], score: 0, evaluation: '' }
  const row = { id: 'r1', isEvaluated: 0, canEnter: true }
  const state = setup(t, {
    getPeerReviews: async (_token, _id, options) => result({ records: [{ ...row, ...stored }], total: 9, current: options.current }),
    getPeerReview: async () => result(stored),
    submitPeerReview: async (_token, id, score, evaluation) => { writes++; stored = { ...stored, score, evaluation }; return result({}) },
  })
  await until(() => !state.loading.value)
  assert.equal(writes, 0)
  await state.loadList(2)
  assert.equal(state.page.value, 2)
  await state.openReview(row)
  state.score.value = 4
  state.evaluation.value = '步骤完整，建议补充验证。'
  await nextTick()
  await state.saveReview()
  assert.equal(writes, 1)
  assert.equal(state.saved.value, true)
  assert.equal(state.selected.value.isEvaluated, 1)
  assert.equal(state.needsCheck.value, false)
})

test('写请求断线先核对，不自动重试；学校确已保存时恢复成功状态', async (t) => {
  let writes = 0
  let stored = { score: 0, evaluation: '' }
  const state = setup(t, {
    getPeerReviews: async () => result({ records: [], total: 0 }),
    getPeerReview: async () => result(stored),
    submitPeerReview: async (_token, _id, score, evaluation) => { writes++; stored = { score, evaluation }; throw new Error('网络中断') },
  })
  await state.openReview({ id: 'r1', canEnter: 1 })
  state.score.value = 5
  state.evaluation.value = '内容清楚'
  await state.saveReview()
  assert.equal(state.saved.value, false)
  assert.equal(state.needsCheck.value, true)
  await state.saveReview()
  assert.equal(writes, 1)
  await state.verifySaved()
  assert.equal(state.saved.value, true)
  assert.equal(state.needsCheck.value, false)
})

test('提交成功回执但学校记录不同不报成功，截止后不再发送评分', async (t) => {
  let writes = 0
  const state = setup(t, {
    getPeerReviews: async () => result({ records: [], total: 0 }),
    getPeerReview: async () => result({ score: 0, evaluation: '' }),
    submitPeerReview: async () => { writes++; return result({}) },
  })
  await state.openReview({ id: 'r1', canEnter: true })
  state.score.value = 4
  await state.saveReview()
  assert.equal(writes, 1)
  assert.equal(state.saved.value, false)
  assert.match(state.saveError.value, /不一致/)
  state.rules.value = { evaluateEndTime: '2000-01-01 00:00:00' }
  await state.saveReview()
  assert.equal(writes, 1)
})

test('切换作业或账号清空互评，迟到的详情和旧账号 401 不能污染新状态', async (t) => {
  let resolveOld
  const state = setup(t, {
    getPeerReviews: async () => result({ records: [], total: 0 }),
    getPeerReview: () => new Promise((resolve) => { resolveOld = resolve }),
    submitPeerReview: async () => result({}),
  })
  const pending = state.openReview({ id: 'old', canEnter: 1 })
  state.token.value = 'new-test-token'
  assert.equal(state.selected.value, null)
  resolveOld({ result: { ok: false, status: 401, body: { code: 401 } } })
  await pending
  assert.equal(state.detail.value, null)
  assert.equal(state.expirations(), 0)
  assert.equal(state.detailError.value, '')
})

test('自己的作业已提交时，未评的互评仍是独立待办；全部评完才完成', () => {
  const assignment = { id: 'a1', title: 'Lab02', isCompleted: true, courseName: '云计算' }
  const detail = { assignmentMutualEvaluation: { evaluateEndTime: '2099-12-01 23:59:00' } }
  const task = normalizePeerReviewTask(assignment, detail, [{ isEvaluated: 0, canEnter: true }, { isEvaluated: 1 }])
  assert.equal(task.kind, 'peer-review')
  assert.equal(task.id, 'peer-review:a1')
  assert.equal(task.isCompleted, false)
  assert.equal(task.pendingCount, 1)
  assert.equal(task.deadline, '2099-12-01 23:59:00')
  assert.equal(normalizePeerReviewTask(assignment, detail, [{ isEvaluated: 1 }]).isCompleted, true)
})

test('完整分页读取；列表不完整时不静默当作全部评完', async () => {
  let pages = 0
  const api = { getPeerReviews: async () => result({ records: [{ id: String(++pages), isEvaluated: 0 }], total: 2 }) }
  assert.equal((await getAllPeerReviews('token', 'a1', { api })).length, 2)
  assert.equal(pages, 2)
  await assert.rejects(getAllPeerReviews('token', 'a1', { api: { getPeerReviews: async () => result({ records: [], total: 1 }) } }), /完整/)
})

test('互评待办读取失败有错误标记并保留该作业的旧结果', async () => {
  const assignment = { id: 'a1', raw: { assignmentType: 0, isOpenEvaluation: 1 } }
  const previous = [{ activityId: 'a1', pendingCount: 2 }]
  const data = await loadPeerReviewTasks('token', [assignment], { previous, api: { getAssignmentDetail: async () => { throw new Error('offline') } } })
  assert.deepEqual(data.tasks, previous)
  assert.deepEqual(data.errors, ['a1'])
})

test('一键互评仅提交未评且可评记录，已有评分不覆盖，逐份核对', async () => {
  const rows = [{ id: 'r1', isEvaluated: 0, canEnter: true }, { id: 'r2', isEvaluated: 1, canEnter: true }, { id: 'r3', isEvaluated: 0, canEnter: false }, { id: 'r4', isEvaluated: 0, canEnter: true }]
  assert.deepEqual(batchReviewCandidates(rows, {}).map((row) => row.id), ['r1', 'r4'])
  const stored = new Map([['r4', { score: 3, evaluation: '先前已评分' }]])
  const writes = []
  const api = {
    getPeerReviews: async () => result({ records: rows, total: rows.length }),
    getPeerReview: async (_token, id) => result(stored.get(id) || { score: 0, evaluation: '' }),
    submitPeerReview: async (_token, id, score, evaluation) => { writes.push(id); stored.set(id, { score, evaluation }); return result({}) },
  }
  const batch = await submitReviewBatch({ token: 'token', assignmentId: 'a1', plannedIds: ['r1', 'r4'], rules: {}, score: 4, evaluation: '统一意见', api })
  assert.deepEqual(batch.completed, ['r1'])
  assert.deepEqual(batch.skipped, ['r4'])
  assert.deepEqual(writes, ['r1'])
  assert.equal(stored.get('r4').score, 3)
})

test('一键互评名单变动必须重新确认；写请求失败不继续后续记录', async () => {
  const rows = [{ id: 'r1', isEvaluated: 0, canEnter: true }, { id: 'r2', isEvaluated: 0, canEnter: true }]
  let writes = 0
  const api = {
    getPeerReviews: async () => result({ records: rows, total: 2 }),
    getPeerReview: async () => result({ score: 0, evaluation: '' }),
    submitPeerReview: async () => { writes++; throw new Error('断线') },
  }
  const options = { token: 'token', assignmentId: 'a1', rules: {}, score: 4, evaluation: '', api }
  await assert.rejects(submitReviewBatch({ ...options, plannedIds: ['r1'] }), /名单已变化/)
  assert.equal(writes, 0)
  const batch = await submitReviewBatch({ ...options, plannedIds: ['r1', 'r2'] })
  assert.equal(writes, 1)
  assert.equal(batch.stopped, 'r1')
  assert.equal(batch.uncertain, true)
  assert.deepEqual(batch.completed, [])
})

test('待评数只算现在可评的记录，无法评阅不等于已评完', () => {
  const rows = [
    { isEvaluated: 1, canEnter: true, score: 5 },
    { isEvaluated: 0, canEnter: false, submitTime: '' },
    { isEvaluated: 0, canEnter: true, submitTime: '' },
    { isEvaluated: 2, canEnter: true, submitTime: '2026-11-21 12:00:00', attachmentCount: 0 },
  ]
  const count = (list, rules = {}) => normalizePeerReviewTask({ id: 'lab' }, { assignmentMutualEvaluation: rules }, list)
  assert.equal(count(rows).pendingCount, 1)
  const blocked = count(rows.slice(0, 3))
  assert.equal(blocked.pendingCount, 0)
  assert.equal(blocked.isCompleted, false)
  assert.equal(blocked.status, '暂无可评作业')
  assert.equal(count(rows, { evaluateStartTime: '2099-01-01' }).pendingCount, 0)
  assert.equal(count(rows, { evaluateEndTime: '2000-01-01' }).pendingCount, 0)
})
