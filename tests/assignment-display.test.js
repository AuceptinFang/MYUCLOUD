import assert from 'node:assert/strict'
import test from 'node:test'
import { formatRelativeDeadline, groupAssignments } from '../src/utils/assignment-display.js'
import { normalizeReportCoverUrl } from '../src/utils/report-cover-url.js'

test('作业按展示顺序分组，保留组内顺序，不修改原始记录', () => {
  const assignments = [
    { id: 'later', level: 'normal' },
    { id: 'warning', level: 'warning' },
    { id: 'overdue', level: 'overdue' },
    { id: 'danger', level: 'danger' },
    { id: 'missed', level: 'missed' },
    { id: 'completed', level: 'submitted', isCompleted: true },
  ].map(Object.freeze)
  const groups = groupAssignments(Object.freeze(assignments))
  assert.deepEqual(
    groups.map((group) => group.key),
    ['overdue', 'upcoming', 'later', 'missed', 'completed'],
  )
  assert.deepEqual(
    groups[1].assignments.map((assignment) => assignment.id),
    ['warning', 'danger'],
  )
  assert.equal(groups[0].assignments[0], assignments[2])
  assert.deepEqual(groupAssignments([]), [])
})

test('已提交但仍带旧截止状态的记录只出现在已完成组', () => {
  for (const level of ['danger', 'warning', 'overdue', 'missed']) {
    const groups = groupAssignments([{ id: level, level, isCompleted: true }])
    assert.equal(groups.length, 1)
    assert.equal(groups[0].key, 'completed')
    assert.equal(groups[0].assignments.length, 1)
  }
})

test('截止提示覆盖缺失时间、今天、明天、逾期与完成状态', () => {
  for (const value of [null, undefined, NaN, Infinity]) {
    assert.equal(formatRelativeDeadline({ daysLeft: value }), '未设置时间')
  }
  assert.equal(formatRelativeDeadline({ daysLeft: -2 }), '已截止 2 天')
  assert.equal(formatRelativeDeadline({ daysLeft: 0 }), '今天截止')
  assert.equal(formatRelativeDeadline({ daysLeft: 1 }), '明天截止')
  assert.equal(formatRelativeDeadline({ daysLeft: 8 }), '还剩 8 天')
  assert.equal(formatRelativeDeadline({ daysLeft: -1, isCompleted: true }), '已完成')
})

test('报告入口默认隐藏，只接受明确的站内路径或 HTTP(S) 地址', () => {
  assert.equal(normalizeReportCoverUrl(), '')
  assert.equal(normalizeReportCoverUrl('  '), '')
  assert.equal(normalizeReportCoverUrl('/geport/'), '/geport/')
  assert.equal(
    normalizeReportCoverUrl(' https://example.com/geport/ '),
    'https://example.com/geport/',
  )
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,test',
    '//example.com/',
    '/\\example.com',
    'https://user:password@example.com/',
    'not a url',
  ]) {
    assert.equal(normalizeReportCoverUrl(value), '')
  }
})
