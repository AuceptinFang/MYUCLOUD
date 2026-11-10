import assert from 'node:assert/strict'
import test from 'node:test'
import {
  flattenQuizPaper,
  formatCountdown,
  initialQuizAnswer,
  isQuizAnswered,
  parseQuizTime,
  quizAnswerValues,
  quizDeadline,
} from '../src/utils/quiz.js'

// 结构取自真实测验 enter-paper 的返回（2026-11-10），只保留用到的字段
const tree = (sort, questionType, options, selfAnswer = [], extra = {}) => ({
  sort,
  questionId: `q${sort}`,
  selfAnswer,
  points: '10.0',
  score: '10.0',
  paperTreeChilds: [],
  questionCombinationDTO: {
    questionType,
    stem: `<p>题 ${sort}</p>`,
    questionOptionsList: options.map((id) => ({ id, optionContent: `<p>${id}</p>` })),
    questionAnswersList: [],
  },
  ...extra,
})

const paper = {
  examTime: 30,
  startAt: '2026-11-10T16:26:31.706',
  endAt: '2026-11-12T23:59:00',
  paperParts: [{
    name: '',
    paperTrees: [
      tree(1, 1, ['a', 'b', 'c'], ['b']),
      tree(2, 2, ['a', 'b', 'c'], ['c', 'a', 'gone']),
      tree(3, 5, ['t', 'f']),
      tree(4, 4, ['x', 'y'], ['答案一']),
      tree(5, 6, [], ['主观']),
      tree(6, 1, [], [], {
        paperTreeChilds: [tree(1, 1, ['m', 'n'], ['n'], { questionId: 'c1' })],
      }),
    ],
  }],
}
const questions = flattenQuizPaper(paper)

test('试卷按题拍平，组合题的小题用大题题干', () => {
  assert.deepEqual(questions.map((question) => question.label), ['1', '2', '3', '4', '5', '6-1'])
  assert.equal(questions[5].id, 'c1')
  assert.equal(questions[5].stem, '<p>题 6</p>')
  assert.equal(questions[3].blankCount, 2)
})

test('已保存的答案恢复成作答格式，失效的选项被丢掉', () => {
  assert.deepEqual(initialQuizAnswer(questions[0]), ['b'])
  assert.deepEqual(initialQuizAnswer(questions[1]), ['c', 'a'])
  assert.deepEqual(initialQuizAnswer(questions[2]), [])
  assert.deepEqual(initialQuizAnswer(questions[3]), ['答案一', ''])
  assert.equal(initialQuizAnswer(questions[4]), '主观')
})

test('保存的 values：选择题是选项 id，填空每空一段，主观题空白不算作答', () => {
  assert.deepEqual(quizAnswerValues(questions[1], ['a', 'c']), ['a', 'c'])
  assert.deepEqual(quizAnswerValues(questions[3], [' 一 ', '']), ['一', ''])
  assert.deepEqual(quizAnswerValues(questions[4], '  '), [])
  assert.equal(isQuizAnswered(questions[3], ['', ' ']), false)
  assert.equal(isQuizAnswered(questions[2], ['t']), true)
})

test('截止取进入时间加时长和结束时间中较早的，按北京时间解析', () => {
  assert.equal(parseQuizTime('2026-11-10T16:26:31.706'), Date.parse('2026-11-10T16:26:31+08:00'))
  assert.equal(quizDeadline(paper), Date.parse('2026-11-10T16:56:31+08:00'))
  assert.equal(quizDeadline({ ...paper, endAt: '2026-11-10T16:40:00' }), Date.parse('2026-11-10T16:40:00+08:00'))
  assert.equal(quizDeadline({ startAt: '', endAt: '' }), null)
  assert.equal(formatCountdown(65_400), '01:06')
  assert.equal(formatCountdown(3_725_000), '1:02:05')
  assert.equal(formatCountdown(-5), '00:00')
})
