import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parseTimetable } from '../server/parsers/timetable.js'
import { mergeTimetableWeek, readTimetableCache, TIMETABLE_KEY, validateTimetableCache } from '../src/utils/timetable.js'

const firstWeek = parseTimetable(readFileSync(new URL('./fixtures/timetable.html', import.meta.url), 'utf8'))
const secondWeek = { ...firstWeek, week: 2, date: '2026-09-17' }

test('首次只同步成功一周也能落盘并在无登录状态下读取', () => {
  const data = new Map()
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
  assert.equal(readTimetableCache(storage), null)
  const cached = mergeTimetableWeek(null, 'student', firstWeek)
  storage.setItem(TIMETABLE_KEY, JSON.stringify(cached))
  const restored = readTimetableCache(storage)
  assert.deepEqual(restored.weeks, [firstWeek])
  assert.equal(restored.weeks[0].courses[0].name, '测试课程 & 实验')
})

test('逐周刷新保留尚未重新获取的周次，不修改原缓存', () => {
  const previous = mergeTimetableWeek(mergeTimetableWeek(null, 'student', firstWeek), 'student', secondWeek)
  const changed = { ...firstWeek, courses: [{ ...firstWeek.courses[0], location: '新教室' }] }
  const updated = mergeTimetableWeek(previous, 'student', changed)
  assert.equal(updated.weeks.length, 2)
  assert.equal(updated.weeks[0].courses[0].location, '新教室')
  assert.deepEqual(updated.weeks[1], secondWeek)
  assert.equal(previous.weeks[0].courses[0].location, '测试楼-101')
  assert.throws(() => mergeTimetableWeek(previous, 'student', null), /未覆盖/)
  assert.throws(() => mergeTimetableWeek(previous, 'student', { ...firstWeek, days: [] }), /未覆盖/)
  assert.equal(validateTimetableCache(previous), true)
})

test('真实的空周可以缓存，账号、学期和模式不同的课表不混合', () => {
  const previous = mergeTimetableWeek(null, 'student', firstWeek)
  const empty = { ...secondWeek, courses: [] }
  assert.equal(mergeTimetableWeek(previous, 'student', empty).weeks.length, 2)
  assert.deepEqual(mergeTimetableWeek(previous, 'student', empty).weeks[1].courses, [])
  assert.equal(mergeTimetableWeek(previous, 'another-student', secondWeek).weeks.length, 1)
  assert.equal(mergeTimetableWeek(previous, 'student', { ...secondWeek, date: '2027-03-18' }).weeks.length, 1)
  assert.equal(mergeTimetableWeek(previous, 'student', { ...secondWeek, mode: 'another-mode' }).weeks.length, 1)
})
