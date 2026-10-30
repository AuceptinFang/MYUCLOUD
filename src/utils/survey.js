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

// 草稿按用户和问卷分开保存在本机：登录过期后重新登录可以接着答，同一台电脑换人登录也看不到别人的答案
export const SURVEY_DRAFT_KEY_PREFIX = 'mock-ucloud-survey-draft'

function surveyDraftKey(userId, surveyId) {
  return `${SURVEY_DRAFT_KEY_PREFIX}:${userId}:${surveyId}`
}

export function readSurveyDraft(storage, userId, surveyId) {
  if (!userId || !surveyId) return null

  try {
    const draft = JSON.parse(storage.getItem(surveyDraftKey(userId, surveyId)) || 'null')
    return draft && typeof draft === 'object' && !Array.isArray(draft) ? draft : null
  } catch {
    return null
  }
}

// 一题都没答时不留草稿；存储不可用（隐私模式、空间满）时只是没有草稿，不影响作答
export function writeSurveyDraft(storage, userId, surveyId, questions, answers) {
  if (!userId || !surveyId) return

  const key = surveyDraftKey(userId, surveyId)
  try {
    if (questions.some((question) => isSurveyAnswered(question, answers[question.id]))) {
      storage.setItem(key, JSON.stringify(answers))
    } else {
      storage.removeItem(key)
    }
  } catch {
    // 忽略
  }
}

export function removeSurveyDraft(storage, userId, surveyId) {
  if (!userId || !surveyId) return

  try {
    storage.removeItem(surveyDraftKey(userId, surveyId))
  } catch {
    // 忽略
  }
}

// 草稿只恢复和当前题目对得上的答案：选项字母要存在，主观题截到字数上限
export function restoreSurveyAnswers(questions, draft) {
  const saved = draft || {}

  return Object.fromEntries(
    questions.map((question) => {
      const value = saved[question.id]
      const options = question.optionVOList.map((option) => option.opt)
      if (question.type === 2) {
        return [question.id, Array.isArray(value) ? options.filter((opt) => value.includes(opt)) : []]
      }
      if (question.type === 1) return [question.id, options.includes(value) ? value : '']

      return [question.id, typeof value === 'string' ? value.slice(0, SUBJECTIVE_MAX_LENGTH) : emptySurveyAnswer(question)]
    }),
  )
}
