import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSurveyAnswers,
  emptySurveyAnswer,
  isSupportedSurveyQuestion,
  isSurveyAnswered,
  normalizeSurveyQuestions,
  readSurveyDraft,
  removeSurveyDraft,
  restoreSurveyAnswers,
  writeSurveyDraft,
} from '../src/utils/survey.js'

// 题目结构取自真实问卷的 survey/detail：type 1 单选、2 多选、3 主观，选项在 optionVOList
const options = (...letters) => letters.map((opt) => ({ id: `o-${opt}`, opt, content: `${opt}.选项` }))
const questions = normalizeSurveyQuestions([
  { id: 'q3', type: 3, sort: 3, trunk: '建议' },
  { id: 'q1', type: '1', sort: 1, trunk: '单选', optionVOList: options('A', 'B', 'C', 'D') },
  { id: 'q2', type: 2, sort: 2, trunk: '多选', optionVOList: options('A', 'B', 'C', 'D', 'E') },
])

test('题目按 sort 排序，type 统一成数字', () => {
  assert.deepEqual(questions.map((question) => question.id), ['q1', 'q2', 'q3'])
  assert.equal(questions[0].type, 1)
  assert.deepEqual(questions[2].optionVOList, [])
  assert.equal(isSupportedSurveyQuestion({ type: 4 }), false)
})

test('多选初始为空数组，空白文本不算作答', () => {
  assert.deepEqual(emptySurveyAnswer(questions[1]), [])
  assert.equal(emptySurveyAnswer(questions[0]), '')
  assert.equal(isSurveyAnswered(questions[1], []), false)
  assert.equal(isSurveyAnswered(questions[2], '   '), false)
  assert.equal(isSurveyAnswered(questions[0], 'B'), true)
})

test('提交格式与官方页面一致，多选按选项顺序拼接', () => {
  assert.deepEqual(buildSurveyAnswers(questions, { q1: 'B', q2: ['E', 'A', 'C'], q3: ' 多一些讨论 ' }, 'u1'), [
    { answer: 'B', type: 1, questionId: 'q1', userId: 'u1' },
    { answer: 'A,C,E', type: 2, questionId: 'q2', userId: 'u1' },
    { answer: '多一些讨论', type: 3, questionId: 'q3', userId: 'u1' },
  ])
})

const memoryStorage = () => {
  const items = new Map()
  return {
    items,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  }
}

test('草稿按用户和问卷分开保存，一题没答时不留草稿', () => {
  const storage = memoryStorage()
  writeSurveyDraft(storage, 'u1', 's1', questions, { q1: '', q2: [], q3: '  ' })
  assert.equal(storage.items.size, 0)

  writeSurveyDraft(storage, 'u1', 's1', questions, { q1: 'B', q2: [], q3: '' })
  assert.deepEqual(readSurveyDraft(storage, 'u1', 's1'), { q1: 'B', q2: [], q3: '' })
  assert.equal(readSurveyDraft(storage, 'u2', 's1'), null)
  assert.equal(readSurveyDraft(storage, '', 's1'), null)

  writeSurveyDraft(storage, 'u1', 's1', questions, { q1: '', q2: [], q3: '' })
  assert.equal(readSurveyDraft(storage, 'u1', 's1'), null)

  writeSurveyDraft(storage, 'u1', 's1', questions, { q1: 'A', q2: [], q3: '' })
  removeSurveyDraft(storage, 'u1', 's1')
  assert.equal(storage.items.size, 0)

  storage.setItem('mock-ucloud-survey-draft:u1:s2', '{坏数据')
  assert.equal(readSurveyDraft(storage, 'u1', 's2'), null)
})

test('恢复草稿时丢掉对不上题目的答案', () => {
  assert.deepEqual(restoreSurveyAnswers(questions, { q1: 'Z', q2: ['E', 'X', 'A'], q3: 'x'.repeat(250), q9: 'A' }), {
    q1: '',
    q2: ['A', 'E'],
    q3: 'x'.repeat(200),
  })
  assert.deepEqual(restoreSurveyAnswers(questions, { q1: 'C', q2: 'A', q3: 5 }), { q1: 'C', q2: [], q3: '' })
  assert.deepEqual(restoreSurveyAnswers(questions, null), { q1: '', q2: [], q3: '' })
})
