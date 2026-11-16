import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { CliError } from './client.js'
import {
  isSubmitViewSubmitted,
  normalizeAssignment,
  normalizeQuiz,
  normalizeSurvey,
  sortAssignments,
} from '../src/utils/deadline.js'
import {
  QUIZ_QUESTION_TYPES,
  flattenQuizPaper,
  isChoiceQuestion,
  quizDeadline,
  quizQuestionResult,
} from '../src/utils/quiz.js'
import {
  SURVEY_QUESTION_TYPES,
  SUBJECTIVE_MAX_LENGTH,
  buildSurveyAnswers,
  isSupportedSurveyQuestion,
  isSurveyAnswered,
  normalizeSurveyQuestions,
} from '../src/utils/survey.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// 题干和作业说明是 HTML，转成纯文本给 agent 看；图片保留地址
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, ' [图片 $1] ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseAnswers(text) {
  if (!text) throw new CliError('缺少 --answers，格式为 JSON 对象：{"题目id": 答案}')
  try {
    const answers = JSON.parse(text)
    if (answers && typeof answers === 'object' && !Array.isArray(answers)) return answers
  } catch { /* 下面统一报错 */ }
  throw new CliError('--answers 必须是 JSON 对象：{"题目id": 答案}')
}

const courseName = (course) => course?.siteName || course?.name || '未命名课程'

async function getUser(client) {
  const body = await client.request('GET', '/ykt-basics/info')
  if (!body?.data?.id) throw new CliError('用户信息里没有 id')
  return body.data
}

async function getCourses(client, userId) {
  const body = await client.request('GET', '/ykt-site/site/list/student/current', { query: { userId, siteRoleCode: 2, current: 1, size: 9999 } })
  return body?.data?.records || []
}

function summarizeUser(user) {
  return { id: String(user.id), account: user.account || '', name: user.realName || user.name || '' }
}

function summarizeTodo(item) {
  return {
    kind: item.kind || 'assignment',
    id: item.activityId || String(item.id),
    title: item.title,
    courseId: item.courseId,
    courseName: item.courseName,
    beginTime: item.beginTime,
    deadline: item.deadline,
    daysLeft: item.daysLeft,
    status: item.status,
    isCompleted: item.isCompleted,
    ...(item.scoreText ? { score: item.scoreText } : {}),
  }
}

export async function whoami(client) {
  return { backend: client.backend(), user: summarizeUser(await getUser(client)) }
}

export async function auth(client, { token, refresh, backend }) {
  const value = String(token || '').trim().replace(/^Blade-Auth:\s*/i, '').replace(/^Bearer\s+/i, '')
  if (!value) throw new CliError('用法：auth <token> [--refresh <refresh_token>] [--backend <地址>]')
  client.save({ token: value, refreshToken: refresh || '', backend })
  return whoami(client)
}

export async function courses(client) {
  const user = await getUser(client)
  return (await getCourses(client, user.id)).map((course) => ({
    id: String(course.id || course.siteId || ''),
    name: courseName(course),
    teachers: (course.teachers || []).map((teacher) => teacher.realName || teacher.name).filter(Boolean).join('、') || course.primaryTeachers || '',
    term: course.termName || '',
  }))
}

// 与网页首页一致：作业列表不带课程，按课程逐个查一遍建立映射；问卷和测验各自拉取，失败不影响作业
export async function todo(client, { all = false } = {}) {
  const user = await getUser(client)
  const courseList = await getCourses(client, user.id)
  const courseIds = courseList.map((course) => [String(course.id || course.siteId || ''), courseName(course)]).filter(([id]) => id)
  const names = new Map(courseIds)
  const quiet = (promise) => promise.catch(() => [])

  const [assignmentMap, surveys, quizzes, assignmentBody] = await Promise.all([
    Promise.all(courseIds.map(([courseId, name]) => quiet(
      client.request('POST', '/ykt-site/work/student/list', { json: { current: 1, size: 9999, siteId: courseId } })
        .then((body) => (body?.data?.records || []).map((record) => [String(record.id), { courseId, name }])),
    ))).then((pairs) => new Map(pairs.flat())),
    Promise.all([1, 2].map((level) => quiet(
      client.request('GET', '/ykt-activity/survey/page/todo', { query: { level, current: 1, size: 9999, userId: user.id } })
        .then((body) => (body?.data?.records || []).map((record) => normalizeSurvey(record, names.get(String(record.siteId))))),
    ))).then((lists) => lists.flat()),
    Promise.all(courseIds.map(([courseId, name]) => quiet(
      client.request('GET', '/ykt-site/examination/list-stu', { query: { current: 1, size: 9999, status: -1, state: -1, siteId: courseId } })
        .then((body) => (body?.data?.records || []).map((record) => normalizeQuiz(record, { courseId, courseName: name }))),
    ))).then((lists) => lists.flat()),
    client.request('POST', '/ykt-site/work/student/list', { json: { current: 1, size: 9999 } }),
  ])

  const assignments = (assignmentBody?.data?.records || []).map((record) => {
    const course = assignmentMap.get(String(record.id)) || {}
    return normalizeAssignment({ ...record, siteId: course.courseId, siteName: course.name })
  })
  // 截止后没交的问卷和测验无法再作答，不列出
  const activities = [...surveys, ...quizzes].filter((task) => !task.isOverdue)
  const items = sortAssignments([...assignments, ...activities])
    .filter((item) => all || (!item.isCompleted && !item.isMissed))
  return items.map(summarizeTodo)
}

async function resourcesById(client, ids) {
  if (!ids.length) return []
  const body = await client.request('GET', '/blade-source/resource/list/byId', { query: { resourceIds: ids.join(',') } })
  return (Array.isArray(body?.data) ? body.data : []).map((resource) => ({
    resourceId: String(resource.id), name: resource.name || '', ext: resource.ext || '', size: resource.fileSizeUnit || '',
  }))
}

export async function assignment(client, { id }) {
  if (!id) throw new CliError('用法：assignment <作业id>')
  const [detailBody, viewBody] = await Promise.all([
    client.request('GET', '/ykt-site/work/detail', { query: { assignmentId: id } }),
    client.request('GET', '/ykt-site/work/submit-view', { query: { assignmentId: id } }),
  ])
  const detail = detailBody?.data || {}
  const view = viewBody?.data || {}
  const submitted = isSubmitViewSubmitted(viewBody)
  return {
    id: String(id),
    title: detail.assignmentTitle || '',
    content: htmlToText(detail.assignmentContent),
    beginTime: detail.assignmentBeginTime || '',
    deadline: detail.assignmentEndTime || '',
    attachments: (Array.isArray(detail.assignmentResource) ? detail.assignmentResource : [])
      .map((item) => ({ resourceId: String(item.resourceId || item.id || ''), name: item.resourceName || item.name || '' })),
    submission: submitted
      ? {
          submitted: true,
          content: htmlToText(view.assignmentContent),
          attachments: await resourcesById(client, (view.attachmentIds || []).map(String)),
          score: Number(view.score) >= 0 ? view.score : null,
          comment: htmlToText(view.assignmentComment),
          isLate: Number(view.isOvertimeCommit) === 1,
        }
      : { submitted: false },
  }
}

export async function assignmentSubmit(client, { id, content = '', files = [], confirm = false }) {
  if (!id) throw new CliError('用法：assignment-submit <作业id> [--content 文本] [--file 路径 ...] --confirm')
  if (!content && !files.length) throw new CliError('提交内容和附件不能都为空')
  for (const file of files) {
    if (!existsSync(file) || !statSync(file).isFile()) throw new CliError(`找不到文件：${file}`)
  }
  const [user, detailBody] = await Promise.all([getUser(client), client.request('GET', '/ykt-site/work/detail', { query: { assignmentId: id } })])
  const detail = detailBody?.data || {}
  const plan = {
    assignmentId: String(id),
    title: detail.assignmentTitle || '',
    deadline: detail.assignmentEndTime || '',
    content,
    files: files.map((file) => ({ path: file, bytes: statSync(file).size })),
  }
  if (!confirm) return { dryRun: true, note: '未提交。确认无误后加 --confirm 再运行；重新提交会覆盖上一次提交。', plan }

  const attachmentIds = []
  for (const file of files) {
    const form = new FormData()
    form.append('file', new Blob([readFileSync(file)]), basename(file))
    form.append('userId', String(user.id))
    form.append('userld', String(user.id))
    form.append('bizType', '3')
    const body = await client.request('POST', '/blade-source/resource/upload/biz', { form })
    const attachmentId = typeof body?.data === 'object' ? body.data?.id : body?.data
    if (!attachmentId) throw new CliError(`附件「${basename(file)}」上传响应里没有 id`)
    attachmentIds.push(String(attachmentId))
  }
  await client.request('POST', '/ykt-site/work/submit', {
    json: {
      assignmentContent: content,
      assignmentId: String(id),
      assignmentType: Number(detail.assignmentType) || 0,
      attachmentIds,
      commitId: detail.commitId ? String(detail.commitId) : '',
      groupId: detail.groupId ? String(detail.groupId) : '',
      userId: String(user.id),
    },
  })
  // 提交接口返回成功不代表已记录，以 submit-view 为准
  for (const delayMs of [0, 1500, 4000]) {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const view = await client.request('GET', '/ykt-site/work/submit-view', { query: { assignmentId: id } }).catch(() => null)
    if (view && isSubmitViewSubmitted(view)) return { submitted: true, confirmed: true, attachmentIds }
  }
  return { submitted: true, confirmed: false, note: '提交请求已成功，但暂未查到提交记录，稍后用 assignment 命令确认', attachmentIds }
}

function flattenResourceTree(nodes, path = []) {
  return (Array.isArray(nodes) ? nodes : []).flatMap((node) => {
    const here = [...path, node.resourceName || node.name || '未命名']
    const attachments = (node.attachmentVOs || []).map((attachment) => {
      const link = attachment.siteResourceLink?.link
      if (String(attachment.type) === '2' || link) {
        return { path: here.join(' / '), kind: 'link', name: attachment.siteResourceLink?.title || link || '外部链接', url: link || '' }
      }
      const resource = attachment.resource || {}
      return { path: here.join(' / '), kind: 'file', name: resource.name || '', resourceId: String(resource.id || ''), ext: resource.ext || '', size: resource.fileSizeUnit || '' }
    })
    return [...attachments, ...flattenResourceTree(node.children, here)]
  })
}

export async function resources(client, { courseId }) {
  if (!courseId) throw new CliError('用法：resources <课程id>')
  const user = await getUser(client)
  const body = await client.request('POST', '/ykt-site/site-resource/tree/student', { query: { siteId: courseId, userId: user.id }, json: {} })
  return flattenResourceTree(body?.data)
}

export async function download(client, { resourceId, out = '.' }) {
  if (!resourceId) throw new CliError('用法：download <资源id> [--out 目录或文件路径]')
  const [[meta], previewBody] = await Promise.all([
    resourcesById(client, [resourceId]),
    client.request('GET', '/blade-source/resource/preview-url', { query: { resourceId } }),
  ])
  const previewUrl = previewBody?.data?.previewUrl
  if (!previewUrl) throw new CliError('没有拿到文件地址')
  const name = (meta?.name || `${resourceId}${meta?.ext ? `.${meta.ext}` : ''}`).replace(/[/\\]/g, '_')
  const target = existsSync(out) && statSync(out).isDirectory() ? join(out, name) : out
  const response = await client.download(previewUrl)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
  return { path: target, bytes: statSync(target).size }
}

export async function survey(client, { id }) {
  if (!id) throw new CliError('用法：survey <问卷id>')
  const body = await client.request('GET', '/ykt-activity/survey/detail', { query: { id, current: 1, size: 999 } })
  const data = body?.data || {}
  return {
    id: String(id),
    title: data.theme || '',
    description: htmlToText(data.description),
    anonymous: Number(data.style) === 2,
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    questions: normalizeSurveyQuestions(data.questionPage?.records).map((question) => ({
      id: String(question.id),
      type: SURVEY_QUESTION_TYPES[question.type] || `不支持的题型 ${question.type}`,
      stem: htmlToText(question.trunk),
      options: question.optionVOList.map((option) => ({ opt: option.opt, content: htmlToText(option.content) })),
    })),
  }
}

export async function surveySubmit(client, { id, answers: answerText, confirm = false }) {
  if (!id) throw new CliError('用法：survey-submit <问卷id> --answers JSON --confirm')
  const answers = parseAnswers(answerText)
  const [user, body] = await Promise.all([
    getUser(client),
    client.request('GET', '/ykt-activity/survey/detail', { query: { id, current: 1, size: 999 } }),
  ])
  const questions = normalizeSurveyQuestions(body?.data?.questionPage?.records)
  const normalized = {}
  const problems = []
  for (const question of questions) {
    const raw = answers[question.id]
    const opts = question.optionVOList.map((option) => option.opt)
    if (!isSupportedSurveyQuestion(question)) problems.push(`${question.id}：不支持的题型 ${question.type}`)
    else if (question.type === 2) normalized[question.id] = (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    else if (question.type === 1) normalized[question.id] = String(raw ?? '').trim().toUpperCase()
    else normalized[question.id] = String(raw ?? '').trim()

    const value = normalized[question.id]
    if (!isSupportedSurveyQuestion(question)) continue
    if (!isSurveyAnswered(question, value)) problems.push(`${question.id}：未作答`)
    else if (question.type !== 3 && [value].flat().some((opt) => !opts.includes(opt))) problems.push(`${question.id}：选项只能是 ${opts.join('/')}`)
    else if (question.type === 3 && value.length > SUBJECTIVE_MAX_LENGTH) problems.push(`${question.id}：主观题不能超过 ${SUBJECTIVE_MAX_LENGTH} 字`)
  }
  const unknown = Object.keys(answers).filter((key) => !questions.some((question) => question.id === key))
  if (unknown.length) problems.push(`没有这些题目：${unknown.join(', ')}`)
  if (problems.length) throw new CliError('答案不完整或格式不对，没有提交', { problems })

  const payload = buildSurveyAnswers(questions, normalized, String(user.id))
  if (!confirm) return { dryRun: true, note: '未提交。问卷提交后不能修改，确认后加 --confirm 再运行。', answers: payload.map(({ questionId, answer }) => ({ questionId, answer })) }
  await client.request('POST', '/ykt-activity/survey/submit-answer', { json: payload })
  return { submitted: true }
}

// 测验：quiz-start 进入试卷后把卷面缓存到本地，quiz-save 用缓存校验答案，避免再次进入试卷
const paperFile = (client, id) => join(client.storeDir, `quiz-${String(id).replace(/[^\w-]/g, '')}.json`)

function describeQuestion(question) {
  return {
    id: question.id,
    label: question.label,
    type: QUIZ_QUESTION_TYPES[question.type] || `未知题型 ${question.type}`,
    ...(question.part ? { part: question.part } : {}),
    stem: htmlToText(question.stem),
    points: question.points,
    ...(isChoiceQuestion(question) ? { options: question.options.map((option, index) => ({ key: LETTERS[index], id: option.id, content: htmlToText(option.content) })) } : {}),
    ...(question.type === 4 ? { blankCount: question.blankCount } : {}),
  }
}

export async function quiz(client, { id }) {
  if (!id) throw new CliError('用法：quiz <测验id>')
  const data = (await client.request('GET', '/ykt-site/examination/exam-info-stu', { query: { id } }))?.data || {}
  return {
    id: String(id),
    title: data.title || '',
    durationMinutes: data.duration ?? null,
    allowRepeat: Boolean(Number(data.isAllowRepet)),
    submitted: Boolean(Number(data.submit)),
    score: Number(data.score) >= 0 ? data.score : null,
    startAt: data.startAt || '',
    endAt: data.endAt || '',
  }
}

export async function quizStart(client, { id, confirm = false }) {
  if (!id) throw new CliError('用法：quiz-start <测验id> --confirm')
  if (!confirm) {
    return { dryRun: true, note: '进入试卷会开始计时；已提交且允许重复作答的测验会开始新的一次作答。确认后加 --confirm 再运行。', info: await quiz(client, { id }) }
  }
  const paper = (await client.request('POST', '/ykt-site/answersheet/enter-paper', { query: { examinationId: id } }))?.data || {}
  const clock = await client.request('GET', '/ykt-site/common/clock').catch(() => null)
  const questions = flattenQuizPaper(paper)
  mkdirSync(client.storeDir, { recursive: true, mode: 0o700 })
  writeFileSync(paperFile(client, id), JSON.stringify(questions), { mode: 0o600 })
  const deadline = quizDeadline(paper)
  const serverNow = clock?.data?.data ? Date.parse(`${String(clock.data.data).replace(/\.\d+$/, '')}+08:00`) : Date.now()
  return {
    id: String(id),
    startAt: paper.startAt || '',
    endAt: paper.endAt || '',
    remainingSeconds: deadline === null ? null : Math.max(0, Math.floor((deadline - serverNow) / 1000)),
    questions: questions.map((question) => ({ ...describeQuestion(question), savedAnswer: question.initialAnswer })),
  }
}

// 选择题接受选项字母（A、B…）或选项 id；填空题传字符串数组，每空一项；主观题传字符串
function toQuizValues(question, raw) {
  if (isChoiceQuestion(question)) {
    const values = (Array.isArray(raw) ? raw : String(raw ?? '').split(',')).map((value) => String(value).trim()).filter(Boolean)
    return values.map((value) => {
      const byId = question.options.find((option) => option.id === value)
      const byKey = question.options[LETTERS.indexOf(value.toUpperCase())]
      const option = byId || (value.length === 1 ? byKey : null)
      if (!option) throw new CliError(`题目 ${question.label}（${question.id}）没有选项 ${value}`)
      return option.id
    })
  }
  if (question.type === 4) return (Array.isArray(raw) ? raw : [raw]).map((value) => String(value ?? '').trim())
  return [String(raw ?? '').trim()].filter(Boolean)
}

export async function quizSave(client, { id, answers: answerText }) {
  if (!id) throw new CliError('用法：quiz-save <测验id> --answers JSON')
  const answers = parseAnswers(answerText)
  let questions
  try { questions = JSON.parse(readFileSync(paperFile(client, id), 'utf8')) } catch {
    throw new CliError('本地没有这份试卷，请先运行 quiz-start <测验id> --confirm')
  }
  const saved = []
  for (const [questionId, raw] of Object.entries(answers)) {
    const question = questions.find((item) => item.id === questionId)
    if (!question) throw new CliError(`试卷里没有题目 ${questionId}`)
    const values = toQuizValues(question, raw)
    if (!values.some(Boolean)) throw new CliError(`题目 ${question.label}（${questionId}）的答案为空`)
    await client.request('POST', '/ykt-site/answersheet/member-answers', {
      json: { examinationId: String(id), answerSheetList: [{ questiontId: questionId, values, resourceIds: [] }] },
    })
    saved.push(questionId)
  }
  const unsaved = (await client.request('GET', '/ykt-site/answersheet/query-no-submit', { query: { examinationId: id } }))?.data || []
  return { saved, unsaved: unsaved.map(String) }
}

export async function quizSubmit(client, { id, confirm = false, allowIncomplete = false }) {
  if (!id) throw new CliError('用法：quiz-submit <测验id> --confirm')
  const unsaved = ((await client.request('GET', '/ykt-site/answersheet/query-no-submit', { query: { examinationId: id } }))?.data || []).map(String)
  if (unsaved.length && !allowIncomplete) throw new CliError('还有题目没有保存答案，没有交卷；确实要交卷请加 --allow-incomplete', { unsaved })
  if (!confirm) return { dryRun: true, note: '交卷后不能修改，确认后加 --confirm 再运行。', unsaved }
  await client.request('POST', '/ykt-site/answersheet/submit-exam', { query: { examinationId: id, auto: false } })
  return { submitted: true, result: await quizResult(client, { id }) }
}

export async function quizResult(client, { id }) {
  if (!id) throw new CliError('用法：quiz-result <测验id>')
  const paper = (await client.request('GET', '/ykt-site/answersheet/have-read-paper-stu', { query: { examinationId: id } }))?.data || {}
  return {
    id: String(id),
    score: paper.score ?? null,
    totalPoints: paper.totalPoints ?? null,
    questions: flattenQuizPaper(paper).map((question) => ({
      ...describeQuestion(question),
      ...(isChoiceQuestion(question) ? { rightKeys: question.options.flatMap((option, index) => (option.isRight ? [LETTERS[index]] : [])) } : {}),
      yourAnswer: isChoiceQuestion(question)
        ? question.initialAnswer.map((optionId) => LETTERS[question.options.findIndex((option) => option.id === optionId)] || optionId)
        : question.initialAnswer,
      score: question.score,
      result: quizQuestionResult(question),
    })),
  }
}

export async function api(client, { method, path, body, query = [] }) {
  if (!method || !path?.startsWith('/')) throw new CliError('用法：api <GET|POST> </学校接口路径> [--body JSON] [--query k=v ...]')
  let json
  if (body !== undefined) {
    try { json = JSON.parse(body) } catch { throw new CliError('--body 必须是 JSON') }
  }
  const params = Object.fromEntries(query.map((pair) => { const at = pair.indexOf('='); return [pair.slice(0, at), pair.slice(at + 1)] }))
  return client.request(method.toUpperCase(), path, { query: params, json })
}
