export function getDaysLeft(deadline) {
  if (!deadline) return null

  const endTime = new Date(deadline).getTime()
  if (Number.isNaN(endTime)) return null

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
  if (daysLeft < 0) return '已逾期'
  if (daysLeft === 0) return '今天截止'
  if (daysLeft === 1) return '明天截止'
  if (daysLeft <= 7) return '临近截止'

  return '待完成'
}

export function getAssignmentPriority(assignment) {
  if (assignment.level === 'overdue') return 0
  if (assignment.level === 'danger') return 1
  if (assignment.level === 'warning') return 2
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

export function isRecordCompleted(record) {
  const status = Number(record.status)

  if (
    hasValue(record.submitTime) ||
    hasValue(record.commitTime) ||
    hasValue(record.submittedAt) ||
    hasValue(record.submitAt)
  ) {
    return true
  }

  if (status === 3) return true
  if (status === 2) return false

  if (
    isTruthyFlag(record.submitStatus) ||
    isTruthyFlag(record.commitStatus) ||
    isTruthyFlag(record.isSubmit) ||
    isTruthyFlag(record.isSubmitted) ||
    isTruthyFlag(record.isCommit)
  ) {
    return true
  }

  return Number.isFinite(status) ? status !== 2 : false
}

export function normalizeAssignment(record) {
  const isCompleted = isRecordCompleted(record)
  const daysLeft = getDaysLeft(record.assignmentEndTime)
  const level = getDeadlineLevel(daysLeft, isCompleted)
  const courseId = record.siteId || record.courseId || record.rawSiteId || ''
  const courseName = record.siteName || record.courseName || record.rawSiteName || ''

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
    isOverdue: level === 'overdue',
    isCompleted,
    status: getAssignmentStatus(record, daysLeft, isCompleted),
    raw: record,
  }
}

function toTimestamp(value) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

export function sortAssignments(records) {
  return records.sort((left, right) => {
    const priorityDiff = getAssignmentPriority(left) - getAssignmentPriority(right)
    if (priorityDiff !== 0) return priorityDiff

    const leftDeadline = toTimestamp(left.deadline) ?? Number.MAX_SAFE_INTEGER
    const rightDeadline = toTimestamp(right.deadline) ?? Number.MAX_SAFE_INTEGER

    // 已完成的作业倒序排列：最近提交（缺失时回退到最近截止）的排最前
    if (left.isCompleted && right.isCompleted) {
      const leftTime = toTimestamp(left.submitTime) ?? toTimestamp(left.deadline) ?? 0
      const rightTime = toTimestamp(right.submitTime) ?? toTimestamp(right.deadline) ?? 0
      return rightTime - leftTime
    }

    return leftDeadline - rightDeadline
  })
}
