// 学校接口的时间都是不带时区的北京时间（如 2026-11-15 00:00:00）。按设备时区解析的话，
// 设备不在东八区时截止判断会整体偏移，所以统一按 +08:00 解析；带时区的字符串照常解析。
const BEIJING_OFFSET_HOURS = 8
const LOCAL_TIME_PATTERN = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/

export function parseBeijingTime(value) {
  if (value === null || value === undefined || value === '') return null

  const text = String(value).trim()
  const match = text.match(LOCAL_TIME_PATTERN)
  const time = match
    ? Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4] || 0) - BEIJING_OFFSET_HOURS,
        Number(match[5] || 0),
        Number(match[6] || 0),
      )
    : Date.parse(text)

  return Number.isNaN(time) ? null : time
}

// 把时刻格式化成学校接口同样的北京时间字符串，例如本地补一个提交时间
export function formatBeijingTime(date = new Date()) {
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_HOURS * 60 * 60 * 1000)

  return beijing.toISOString().slice(0, 19).replace('T', ' ')
}

export function getDaysLeft(deadline) {
  const endTime = parseBeijingTime(deadline)
  if (endTime === null) return null

  return Math.floor((endTime - Date.now()) / (1000 * 60 * 60 * 24))
}

export function getDeadlineLevel(daysLeft, isCompleted) {
  if (isCompleted) return 'submitted'
  if (daysLeft === null) return 'normal'
  if (daysLeft < 0) return 'overdue'
  if (daysLeft <= 1) return 'danger'
  if (daysLeft <= 7) return 'warning'

  return 'normal'
}

export function getAssignmentStatus(record, daysLeft, isCompleted) {
  if (isCompleted) return '已提交'
  if (daysLeft === null) return '待完成'
  if (daysLeft < 0) return '已截止未交'
  if (daysLeft === 0) return '今天截止'
  if (daysLeft === 1) return '明天截止'
  if (daysLeft <= 7) return '临近截止'

  return '待完成'
}

export function getAssignmentPriority(assignment) {
  if (assignment.level === 'overdue') return 0
  if (assignment.level === 'danger') return 1
  if (assignment.level === 'warning') return 2
  if (assignment.level === 'missed') return 5
  if (assignment.isCompleted) return 4

  return 3
}

function hasValue(value) {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0

  const text = String(value).trim()

  return text !== '' && text !== 'null' && text !== 'undefined' && text !== '-'
}

function isTruthyFlag(value) {
  if (value === true) return true
  if (value === false || value === null || value === undefined) return false

  const text = String(value).trim().toLowerCase()

  return text === '1' || text === 'true' || text === 'yes'
}

// 学校字段的真实含义（以真实账号数据核对过）：
// - status：作业本身的状态，2 进行中、3 已截止，与是否提交无关；
// - assignmentStatus：本人的提交状态，99 未提交，0 已提交、1 已批改；
// - isOverTime：1 表示是截止后补交的；isOvertimeCommit（详情、submit-view）：1 表示允许补交。
export const NOT_SUBMITTED_STATUS = 99

/** 按 assignmentStatus 判断是否已提交；字段缺失或无法识别时返回 null，交给其他字段判断。 */
function submissionFromAssignmentStatus(value) {
  if (value === null || value === undefined || value === '') return null
  const status = Number(value)
  if (!Number.isFinite(status)) return null

  return status !== NOT_SUBMITTED_STATUS
}

export function isRecordCompleted(record) {
  if (
    hasValue(record.submitTime) ||
    hasValue(record.commitTime) ||
    hasValue(record.submittedAt) ||
    hasValue(record.submitAt)
  ) {
    return true
  }

  const fromStatus = submissionFromAssignmentStatus(record.assignmentStatus)
  if (fromStatus !== null) return fromStatus

  return (
    isTruthyFlag(record.submitStatus) ||
    isTruthyFlag(record.commitStatus) ||
    isTruthyFlag(record.isSubmit) ||
    isTruthyFlag(record.isSubmitted) ||
    isTruthyFlag(record.isCommit)
  )
}

/** 是否允许截止后补交；学校没给这个字段时返回 null。 */
export function allowsLateSubmission(body) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object' || data.isOvertimeCommit === undefined || data.isOvertimeCommit === null) {
    return null
  }

  return Number(data.isOvertimeCommit) === 1
}

function hasText(value) {
  if (typeof value !== 'string') return hasValue(value)

  const text = value.replace(/<[^>]*>/g, '').replace(/&nbsp;|\u00a0/g, ' ').trim()

  return text !== '' && text !== 'null' && text !== 'undefined'
}

// submit-view 对未提交的作业也会返回 assignmentId（真实值为 -1），截止后 status 也是 3，
// 所以只认 assignmentStatus 与真实的提交内容
export function isSubmitViewSubmitted(body) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false

  const fromStatus = submissionFromAssignmentStatus(data.assignmentStatus)
  if (fromStatus !== null) return fromStatus

  return (
    hasValue(data.submitTime) ||
    hasValue(data.commitTime) ||
    hasValue(data.submittedAt) ||
    hasValue(data.submitAt) ||
    hasText(data.assignmentContent) ||
    hasText(data.assignmentComment) ||
    (Array.isArray(data.attachmentIds) && data.attachmentIds.some((id) => hasValue(id)))
  )
}

// 学校的作业列表跨越所有学期，又不带课程。没有归到本学期课程、而且截止已久的未交作业
// 算“往期未交”，不再混进“已逾期”里催促。
export const CURRENT_TERM_GRACE_DAYS = 60

export function normalizeAssignment(record) {
  const isCompleted = isRecordCompleted(record)
  const daysLeft = getDaysLeft(record.assignmentEndTime)
  const courseId = record.siteId || record.courseId || record.rawSiteId || ''
  const courseName = record.siteName || record.courseName || record.rawSiteName || ''
  const isPastTerm = !courseId && daysLeft !== null && daysLeft < -CURRENT_TERM_GRACE_DAYS
  let level = getDeadlineLevel(daysLeft, isCompleted)
  if (level === 'overdue' && isPastTerm) level = 'missed'

  return {
    id: record.id,
    title: record.assignmentTitle || '无标题',
    chapter: record.chapterName || '无章节',
    courseId,
    courseName,
    beginTime: record.assignmentBeginTime || '',
    deadline: record.assignmentEndTime || '',
    submitTime: record.submitTime || '',
    daysLeft,
    level,
    isUrgent: level === 'danger' || level === 'warning',
    isOverdue: level === 'overdue' || level === 'missed',
    isMissed: level === 'missed',
    isLateSubmission: Number(record.isOverTime) === 1,
    isCompleted,
    status: level === 'missed' ? '往期未交' : getAssignmentStatus(record, daysLeft, isCompleted),
    raw: record,
  }
}

// 问卷（type 2）和测验（type 4）和作业一起列入待办；问卷在应用内作答，测验跳转官方页面。
// 列表只拉未提交的，所以都算未完成；id 加前缀，避免和作业撞号。
const ACTIVITY_LABELS = { survey: '问卷', quiz: '测验' }

// 问卷和测验的时间带秒，作业列表只到分钟，显示时对齐
export function trimSeconds(value) {
  return String(value || '').replace(/(\d{2}:\d{2}):\d{2}$/, '$1')
}

function normalizeActivity(kind, record, { activityId, title, courseId, courseName, beginTime, deadline }) {
  const daysLeft = getDaysLeft(deadline)
  const level = getDeadlineLevel(daysLeft, false)

  return {
    id: `${kind}-${activityId}`,
    activityId: String(activityId),
    kind,
    kindLabel: ACTIVITY_LABELS[kind],
    title: title || '无标题',
    chapter: '',
    courseId: courseId || '',
    courseName: courseName || '',
    beginTime: trimSeconds(beginTime),
    deadline: trimSeconds(deadline),
    submitTime: '',
    daysLeft,
    level,
    isUrgent: level === 'danger' || level === 'warning',
    isOverdue: level === 'overdue',
    isMissed: false,
    isLateSubmission: false,
    isCompleted: false,
    status: getAssignmentStatus(record, daysLeft, false),
    raw: record,
  }
}

// 课堂级问卷带真实 siteId，平台级问卷的 siteId 是 -1
export function normalizeSurvey(record, courseName = '') {
  const siteId = String(record.siteId ?? '')
  const courseId = hasValue(siteId) && siteId !== '-1' ? siteId : ''

  return normalizeActivity('survey', record, {
    activityId: record.id,
    title: record.theme,
    courseId,
    courseName: courseName || record.siteName,
    beginTime: record.startTime,
    deadline: record.endTime,
  })
}

// 测验记录里的 siteId 是 -1，课程取自发起查询的那门课
export function normalizeQuiz(record, { courseId = '', courseName = '' } = {}) {
  return normalizeActivity('quiz', record, {
    activityId: record.id,
    title: record.title,
    courseId,
    courseName,
    beginTime: record.startAt,
    deadline: record.endAt,
  })
}

export function sortAssignments(records) {
  return records.sort((left, right) => {
    const priorityDiff = getAssignmentPriority(left) - getAssignmentPriority(right)
    if (priorityDiff !== 0) return priorityDiff

    const leftDeadline = parseBeijingTime(left.deadline) ?? Number.MAX_SAFE_INTEGER
    const rightDeadline = parseBeijingTime(right.deadline) ?? Number.MAX_SAFE_INTEGER

    // 已截止未交的作业倒序排列：刚过截止的排最前，越久越靠后
    if (left.isOverdue && right.isOverdue) return rightDeadline - leftDeadline

    // 已完成的作业倒序排列：最近提交（缺失时回退到最近截止）的排最前
    if (left.isCompleted && right.isCompleted) {
      const leftTime = parseBeijingTime(left.submitTime) ?? parseBeijingTime(left.deadline) ?? 0
      const rightTime = parseBeijingTime(right.submitTime) ?? parseBeijingTime(right.deadline) ?? 0
      return rightTime - leftTime
    }

    return leftDeadline - rightDeadline
  })
}
