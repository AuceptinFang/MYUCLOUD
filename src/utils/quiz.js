import { parseBeijingTime } from './deadline.js'

// 题型与官方答题页一致。单选、多选、判断的答案是选项 id；填空每空一段文本；主观题一段文本。
// 2026-11-10 用真实测验验证过单选、多选、判断；填空和主观题的格式取自官方代码，还没有真实试卷验证。
export const QUIZ_QUESTION_TYPES = { 1: '单选', 2: '多选', 3: '多选', 4: '填空', 5: '判断', 6: '主观' }
const CHOICE_TYPES = new Set([1, 2, 3, 5])
const MULTIPLE_TYPES = new Set([2, 3])

export function isMultipleChoice(question) {
  return MULTIPLE_TYPES.has(question.type)
}

export function isChoiceQuestion(question) {
  return CHOICE_TYPES.has(question.type)
}

function toQuestion(tree, { stem, label, part }) {
  const dto = tree.questionCombinationDTO || {}
  const type = Number(dto.questionType)
  // rightAnswer 为 1 是正确选项；老师没开「答案与解析反馈」时一律是 -1
  const options = (dto.questionOptionsList || []).map((option) => ({
    id: String(option.id),
    content: option.optionContent || '',
    isRight: Number(option.rightAnswer) === 1,
  }))
  const selfAnswer = (tree.selfAnswer || []).map(String)

  return {
    id: String(tree.questionId),
    label,
    part,
    type,
    stem: stem ?? dto.stem ?? '',
    options,
    // 填空题优先按选项数出空，没有选项时按参考答案条数，和官方一致
    blankCount: type === 4 ? Math.max(options.length || (dto.questionAnswersList || []).length, 1) : 0,
    points: tree.points ?? '',
    score: tree.score ?? '',
    initialAnswer: selfAnswer,
    analysis: dto.analysis || '',
  }
}

// enter-paper 和 have-read-paper-stu 的结构相同：paperParts[].paperTrees[]；组合题的小题在 paperTreeChilds，题干取大题的
export function flattenQuizPaper(paper) {
  const questions = []
  for (const part of paper?.paperParts || []) {
    for (const tree of part.paperTrees || []) {
      const children = tree.paperTreeChilds || []
      if (children.length) {
        for (const child of children) {
          questions.push(toQuestion(child, { stem: tree.questionCombinationDTO?.stem, label: `${tree.sort}-${child.sort}`, part: part.name || '' }))
        }
      } else {
        questions.push(toQuestion(tree, { label: String(tree.sort), part: part.name || '' }))
      }
    }
  }
  return questions
}

// 按得分判断对错：满分 correct，部分得分 partial，零分 wrong；未评分（-1 或空）返回空串
export function quizQuestionResult(question) {
  const score = Number(question.score)
  const points = Number(question.points)
  if (question.score === '' || !Number.isFinite(score) || score < 0 || !(points > 0)) return ''
  if (score >= points) return 'correct'
  return score > 0 ? 'partial' : 'wrong'
}

// 选择题保持数组（单选也是），填空题每空一个字符串，主观题一个字符串
export function initialQuizAnswer(question) {
  const saved = question.initialAnswer
  if (isChoiceQuestion(question)) {
    const ids = new Set(question.options.map((option) => option.id))
    return saved.filter((id) => ids.has(id))
  }
  if (question.type === 4) return Array.from({ length: question.blankCount }, (_, index) => saved[index] || '')

  return saved[0] || ''
}

export function quizAnswerValues(question, answer) {
  if (isChoiceQuestion(question)) return Array.isArray(answer) ? answer : []
  if (question.type === 4) return (answer || []).map((value) => String(value).trim())

  const text = String(answer || '').trim()
  return text ? [text] : []
}

export function isQuizAnswered(question, answer) {
  return quizAnswerValues(question, answer).some(Boolean)
}

// 时间是不带时区的北京时间，可能带毫秒（2026-11-10T16:26:31.706）
export function parseQuizTime(value) {
  return parseBeijingTime(String(value || '').replace(/\.\d+$/, ''))
}

// 截止时刻取「进入时间 + 时长」和「测验结束时间」中较早的一个，与官方答题页一致；examTime 单位是分钟
export function quizDeadline(paper) {
  const startAt = parseQuizTime(paper?.startAt)
  const endAt = parseQuizTime(paper?.endAt)
  const byDuration = startAt !== null && Number(paper?.examTime) > 0 ? startAt + Number(paper.examTime) * 60000 : null
  const candidates = [byDuration, endAt].filter((time) => time !== null)

  return candidates.length ? Math.min(...candidates) : null
}

export function formatCountdown(milliseconds) {
  const total = Math.max(0, Math.ceil(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')

  return hours ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`
}
