import { getDaysLeft, getDeadlineLevel, parseBeijingTime } from './deadline.js'

// 对应官方 assignmentDetails_fullpage 的互评开关，仅个人作业支持互评。
export function hasPeerReview(assignment, detail) {
  const raw = assignment?.raw || assignment || {}
  return Number(detail?.assignmentType ?? raw.assignmentType) === 0
    && Number(detail?.isOpenEvaluation ?? raw.isOpenEvaluation) === 1
}

export function reviewWindow(rules = {}, now = Date.now()) {
  const start = parseBeijingTime(rules.evaluateStartTime)
  const end = parseBeijingTime(rules.evaluateEndTime)
  if (start !== null && now < start) return 'not-started'
  if (end !== null && now > end) return 'closed'
  return 'open'
}

export function canReview(record, rules, now) {
  return [true, 1, '1', 'true'].includes(record?.canEnter)
    && reviewWindow(rules, now) === 'open'
}

export function reviewStatus(record) {
  return ({ 0: '未评', 1: '已评', 2: '未评', 3: '未评（互评已截止）' })[record?.isEvaluated] || '状态未知'
}

export function reviewPayload(id, score, evaluation) {
  if (!id) throw new Error('缺少互评记录编号，请刷新列表。')
  const value = Number(score)
  if (!Number.isInteger(value) || value < 1 || value > 5) throw new Error('请选择 1 至 5 星评分。')
  if (typeof evaluation !== 'string' || evaluation.length > 200) throw new Error('评语最多 200 字。')
  return { id: String(id), score: value, evaluation }
}

export function reviewAttachmentIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .filter((id) => typeof id === 'string' || typeof id === 'number')
    .map(String).filter(Boolean))]
}

export function receivedReviews(submitView) {
  return Array.isArray(submitView?.evaluationInfos) ? submitView.evaluationInfos : []
}

export function buildPeerReviewUrl(assignmentId, title = '') {
  const params = new URLSearchParams({ activeTabName: 'fourth', assignmentId: String(assignmentId || ''), assignmentType: '0', assignmentTitle: title, evaluationStatus: '-1', isOpenEvaluation: '1' })
  return `https://ucloud.bupt.edu.cn/uclass/course.html#/student/assignmentDetails_fullpage?${params}`
}

export function pendingReviewRows(rows) {
  return rows.filter((row) => [0, 2, 3].includes(Number(row.isEvaluated)))
}

// 学校显式返回空提交时间时没有可评交件；附件数为零并不能排除纯文字提交。
export function actionableReviewRows(rows, rules, now = Date.now()) {
  return rows.filter(row => [0, 2, '0', '2'].includes(row.isEvaluated)
    && !(Number(row.score) > 0)
    && (!Object.hasOwn(row, 'submitTime') || Boolean(String(row.submitTime ?? '').trim()))
    && canReview(row, rules, now))
}

export function normalizePeerReviewTask(assignment, detail, rows) {
  const rules = detail?.assignmentMutualEvaluation || {}
  const pendingCount = actionableReviewRows(rows, rules).length
  const deadline = rules.evaluateEndTime || ''
  const daysLeft = getDaysLeft(deadline)
  const closed = reviewWindow(rules) === 'closed'
  const completed = rows.length > 0 && rows.every(row => [1, '1'].includes(row.isEvaluated))
  return {
    id: `peer-review:${assignment.id}`, activityId: String(assignment.id), kind: 'peer-review', kindLabel: '互评',
    title: assignment.title, courseId: assignment.courseId, courseName: assignment.courseName,
    chapter: pendingCount ? `还有 ${pendingCount} 份待评` : completed ? '评阅已完成' : '暂无可评作业', deadline, beginTime: rules.evaluateStartTime || '',
    daysLeft, pendingCount, isCompleted: completed, isMissed: closed && !completed,
    isOverdue: closed && !completed, isUrgent: !closed && pendingCount > 0 && daysLeft !== null && daysLeft <= 7,
    level: completed ? 'submitted' : closed ? 'missed' : getDeadlineLevel(daysLeft, false),
    status: completed ? '互评已完成' : closed ? '互评已截止' : reviewWindow(rules) === 'not-started' ? '互评未开始' : pendingCount ? `${pendingCount} 份待评` : '暂无可评作业',
    raw: assignment.raw,
  }
}
