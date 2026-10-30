import assert from 'node:assert/strict'
import test from 'node:test'
import { allowsLateSubmission, isRecordCompleted, normalizeAssignment, normalizeQuiz, normalizeSurvey, sortAssignments } from '../src/utils/deadline.js'

// 字段组合取自真实账号的作业列表：status 2 进行中 / 3 已截止，assignmentStatus 99 未提交 / 0 已提交 / 1 已批改，
// isOverTime 1 表示截止后补交。
const daysFromNow = (days) => {
  const date = new Date(Date.now() + days * 86400000)
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
const record = (fields) => ({
  id: fields.id ?? '1',
  assignmentTitle: fields.title ?? '作业',
  assignmentEndTime: fields.end,
  submitTime: fields.submitTime ?? null,
  status: fields.status,
  assignmentStatus: fields.assignmentStatus,
  isOverTime: fields.isOverTime ?? 0,
  siteId: fields.siteId,
})

test('已截止（status 3）但 assignmentStatus 99 的作业不算已提交', () => {
  const missed = record({ end: daysFromNow(-2), status: 3, assignmentStatus: 99, siteId: 'c1' })
  assert.equal(isRecordCompleted(missed), false)
  const assignment = normalizeAssignment(missed)
  assert.equal(assignment.level, 'overdue')
  assert.equal(assignment.isOverdue, true)
  assert.equal(assignment.status, '已截止未交')
})

test('assignmentStatus 0 / 1 或有提交时间都算已提交，与 status 无关', () => {
  assert.equal(isRecordCompleted(record({ end: daysFromNow(3), status: 2, assignmentStatus: 0 })), true)
  assert.equal(isRecordCompleted(record({ end: daysFromNow(-30), status: 3, assignmentStatus: 1, submitTime: '2026-06-24 20:13' })), true)
  assert.equal(isRecordCompleted(record({ end: daysFromNow(3), status: 2, assignmentStatus: 99 })), false)
  assert.equal(normalizeAssignment(record({ end: daysFromNow(-90), status: 3, assignmentStatus: 1, submitTime: 'x', isOverTime: 1 })).isLateSubmission, true)
})

test('没有归到本学期课程且截止很久的未交作业算往期未交，不进已逾期', () => {
  const old = normalizeAssignment(record({ end: daysFromNow(-400), status: 3, assignmentStatus: 99 }))
  assert.equal(old.level, 'missed')
  assert.equal(old.status, '往期未交')
  // 刚截止的即使没对上课程也仍算逾期
  assert.equal(normalizeAssignment(record({ end: daysFromNow(-2), status: 3, assignmentStatus: 99 })).level, 'overdue')
  // 本学期课程里的老作业仍算逾期
  assert.equal(normalizeAssignment(record({ end: daysFromNow(-400), status: 3, assignmentStatus: 99, siteId: 'c1' })).level, 'overdue')
})

test('截止未交按刚过截止的在前排序，往期未交排在已提交之后', () => {
  const sorted = sortAssignments([
    normalizeAssignment(record({ id: 'old', end: daysFromNow(-400), status: 3, assignmentStatus: 99 })),
    normalizeAssignment(record({ id: 'long', end: daysFromNow(-20), status: 3, assignmentStatus: 99, siteId: 'c' })),
    normalizeAssignment(record({ id: 'done', end: daysFromNow(-5), status: 3, assignmentStatus: 0, submitTime: 'x' })),
    normalizeAssignment(record({ id: 'recent', end: daysFromNow(-1), status: 3, assignmentStatus: 99, siteId: 'c' })),
    normalizeAssignment(record({ id: 'soon', end: daysFromNow(2), status: 2, assignmentStatus: 99, siteId: 'c' })),
  ])
  assert.deepEqual(sorted.map((item) => item.id), ['recent', 'long', 'soon', 'done', 'old'])
})

test('isOvertimeCommit 决定能否补交，缺失时未知', () => {
  assert.equal(allowsLateSubmission({ data: { isOvertimeCommit: 0 } }), false)
  assert.equal(allowsLateSubmission({ isOvertimeCommit: 1 }), true)
  assert.equal(allowsLateSubmission({ data: {} }), null)
  assert.equal(allowsLateSubmission(null), null)
})

// 字段取自真实账号的问卷待办（survey/page/todo）和测验列表（examination/list-stu）
test('问卷和测验归一成待办条目，id 加前缀，课程取自课程列表', () => {
  const survey = normalizeSurvey(
    { id: '2115715436616708098', siteId: '2091774261643038721', theme: '学期中调查问卷', startTime: daysFromNow(-1), endTime: daysFromNow(10), siteName: '' },
    '编译原理与技术',
  )
  assert.equal(survey.id, 'survey-2115715436616708098')
  assert.equal(survey.activityId, '2115715436616708098')
  assert.equal(survey.kindLabel, '问卷')
  assert.equal(survey.title, '学期中调查问卷')
  assert.equal(survey.courseId, '2091774261643038721')
  assert.equal(survey.courseName, '编译原理与技术')
  assert.equal(survey.level, 'normal')
  assert.equal(survey.isCompleted, false)

  assert.equal(normalizeSurvey({ id: '1', siteId: -1, theme: '平台问卷', endTime: daysFromNow(3) }).courseId, '')

  const quiz = normalizeQuiz(
    { id: '2115665119386898433', title: '语法分析单元测试', statusSelf: '未提交', startAt: daysFromNow(0), endAt: daysFromNow(-1), siteId: -1 },
    { courseId: 'c1', courseName: '编译原理与技术' },
  )
  assert.equal(quiz.id, 'quiz-2115665119386898433')
  assert.equal(quiz.courseId, 'c1')
  assert.equal(quiz.isOverdue, true)
})

test('问卷和测验的时间去掉秒，和作业列表一致', () => {
  const survey = normalizeSurvey({ id: '1', siteId: -1, theme: '问卷', startTime: '2026-10-29 00:00:00', endTime: '2099-11-15 00:00:00' })
  assert.equal(survey.beginTime, '2026-10-29 00:00')
  assert.equal(survey.deadline, '2099-11-15 00:00')
})
