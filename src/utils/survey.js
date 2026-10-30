// 问卷题型与官方作答页一致：1 单选、2 多选、3 主观；主观题官方限 200 字
export const SURVEY_QUESTION_TYPES = { 1: '单选', 2: '多选', 3: '主观' }
export const SUBJECTIVE_MAX_LENGTH = 200

export function isSupportedSurveyQuestion(question) {
  return Boolean(SURVEY_QUESTION_TYPES[Number(question?.type)])
}

export function emptySurveyAnswer(question) {
  return Number(question?.type) === 2 ? [] : ''
}

export function isSurveyAnswered(question, answer) {
  if (Number(question?.type) === 2) return Array.isArray(answer) && answer.length > 0

  return String(answer ?? '').trim() !== ''
}

// 题目按 sort 排序，type 统一成数字，方便模板比较
export function normalizeSurveyQuestions(records) {
  return [...(Array.isArray(records) ? records : [])]
    .map((question) => ({
      ...question,
      type: Number(question.type),
      optionVOList: Array.isArray(question.optionVOList) ? question.optionVOList : [],
    }))
    .sort((left, right) => (Number(left.sort) || 0) - (Number(right.sort) || 0))
}

// 提交格式与官方页面一致：每题一条，单选填选项字母，多选按选项顺序用逗号拼接，主观题填文本
export function buildSurveyAnswers(questions, answers, userId) {
  return questions.map((question) => {
    const answer = answers[question.id]
    const value = Array.isArray(answer)
      ? question.optionVOList.map((option) => option.opt).filter((opt) => answer.includes(opt)).join(',')
      : String(answer ?? '').trim()

    return {
      answer: value,
      type: question.type,
      questionId: question.id,
      userId,
    }
  })
}
