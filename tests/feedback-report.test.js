import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAssignment } from '../src/utils/deadline.js'
import {
  assignmentRef, buildFeedbackReport, collectKnownSecrets, describeBrowser, describeShape, redactText,
} from '../src/utils/feedback-report.js'

const day = 86400000
// 学校接口的时间是北京时间
const at = (days) => new Date(Date.now() + days * day + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ')
const token = 'eyJhbGciOiJIUzUxMiJ9.eyJ1c2VyX2lkIjoiMjAyNDIxMTM1NSJ9.c2lnbmF0dXJlLXNpZ25hdHVyZS1zaWduYXR1cmU'
const userInfo = { id: '1858293410123456789', account: '2024211355', realName: '张三', phone: '13812345678', tenantId: '000000' }

const assignments = [
  { id: '2110291185096462338', assignmentTitle: '第一次大作业 · 手机采样与步行数据特征分析', assignmentEndTime: at(-2), status: 3, assignmentStatus: 99, isOverTime: 0, siteId: 'c1', siteName: '多元感知融合' },
  { id: '2112773733922738177', assignmentTitle: '系统运行展示', assignmentEndTime: at(7), status: 2, assignmentStatus: 99, isOverTime: 0, siteId: 'c2', siteName: '操作系统原理课程设计' },
  { id: '1852918094104788993', assignmentTitle: 'Unit 3 Project', assignmentEndTime: at(-700), status: 3, assignmentStatus: 99, isOverTime: 0 },
  { id: '1000', assignmentTitle: '很久以前交过的', assignmentEndTime: at(-300), status: 3, assignmentStatus: 1, submitTime: at(-301) },
].map(normalizeAssignment)

const detail = { assignmentTitle: '第一次大作业 · 手机采样与步行数据特征分析', assignmentContent: '<p>要求：张三同学……</p>', status: 3, assignmentStatus: 99, isOvertimeCommit: 0, assignmentResource: [{ name: '数据.zip' }] }
const submitView = { attachmentIds: [], assignmentId: -1, assignmentContent: '', status: 3, isOvertimeCommit: 0, assignmentStatus: 99 }
const logs = [
  { time: '2026-10-23T01:00:00.000Z', label: 'study:assignment-submit:error', data: { name: 'Error', message: `张三 2024211355 提交失败 Blade-Auth: ${token}` } },
  { time: '2026-10-23T00:59:00.000Z', label: 'study:assignments:response', data: { body: { records: [{ assignmentTitle: '第一次大作业' }] }, headers: { 'Blade-Auth': token } } },
]

test('the report keeps status codes and shapes but no personal or course data', async () => {
  const report = await buildFeedbackReport({
    app: { commit: 'abc123', mode: 'pages', backend: 'myu.aucept.in' },
    view: 'assignment',
    environment: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', language: 'zh-CN', timezoneOffsetMinutes: -480, viewport: { width: 1440, height: 900 } },
    session: { ucloud: true, jwgl: false },
    courses: [{ siteName: '多元感知融合' }, { siteName: '操作系统原理课程设计' }],
    assignments,
    selected: assignments[0],
    detail,
    submitView,
    submitResult: { confirmed: false },
    logs,
    known: collectKnownSecrets({ userInfo, username: '2024211355', token }),
  })
  const text = JSON.stringify(report)
  for (const secret of ['张三', '2024211355', '13812345678', token.slice(0, 20), '2110291185096462338', '1858293410123456789',
    '第一次大作业', '系统运行展示', 'Unit 3', '多元感知融合', '操作系统原理', '数据.zip', '要求', 'Mozilla']) {
    assert.ok(!text.includes(secret), `report leaks ${secret}`)
  }
  assert.equal(report.environment.browser, 'Chrome 141')
  assert.equal(report.environment.system, 'macOS')
  assert.deepEqual(report.overview.byLevel, { overdue: 1, warning: 1, missed: 1, submitted: 1 })
  // 很久以前交过的不列，其余带状态码
  assert.equal(report.assignments.length, 3)
  const overdue = report.assignments.find((row) => row.level === 'overdue')
  assert.deepEqual({ status: overdue.status, assignmentStatus: overdue.assignmentStatus, submitted: overdue.submitted, hasCourse: overdue.hasCourse },
    { status: 3, assignmentStatus: 99, submitted: false, hasCourse: true })
  assert.equal(overdue.ref, await assignmentRef('2110291185096462338'))
  assert.match(overdue.ref, /^[0-9a-f]{8}$/)
  assert.equal(report.selected.detail.isOvertimeCommit, 0)
  assert.equal(report.selected.detail.shape.fields.assignmentTitle, 'string')
  assert.equal(report.selected.detail.shape.fields['assignmentResource[].name'], 'string')
  assert.equal(report.selected.submitView.attachments, 0)
  assert.equal(report.selected.submitView.hasContent, false)
  assert.deepEqual(report.events.map((item) => item.event), ['study:assignment-submit:error', 'study:assignments:response'])
  assert.equal(report.errors.length, 1)
  assert.match(report.errors[0].message, /<个人信息> <个人信息> 提交失败/)
})

test('redaction helpers', () => {
  assert.equal(redactText('还剩 7 天，2026-10-30 23:59'), '还剩 7 天，2026-10-30 23:59')
  assert.equal(redactText('学号2024211355'), '学号<数字>')
  assert.equal(redactText('王小明的作业', ['王小明']), '<个人信息>的作业')
  assert.deepEqual(describeShape({ a: 'secret', b: [{ c: 1 }, { c: null }], d: { e: true } }).fields,
    { a: 'string', b: 'array(2)', 'b[]': 'object', 'b[].c': 'null|number', d: 'object', 'd.e': 'boolean' })
  assert.deepEqual(describeBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.50'),
    { browser: 'WeChat 8', system: 'iOS', mobile: true })
})
