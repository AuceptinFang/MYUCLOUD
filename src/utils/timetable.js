export const TIMETABLE_KEY = 'mock-ucloud-timetable-v1'

export function validateTimetableCache(value) {
  return value?.version === 1 && typeof value.username === 'string'
    && typeof value.savedAt === 'string' && Number.isFinite(Date.parse(value.savedAt))
    && Array.isArray(value.weeks) && value.weeks.length > 0
    && value.weeks.every((week) => week && Number.isInteger(week.week)
      && /^\d{4}-\d{2}-\d{2}$/.test(week.date) && Number.isFinite(Date.parse(week.date))
      && Array.isArray(week.days) && week.days.length === 7
      && week.days.every((day) => day && typeof day.label === 'string' && typeof day.date === 'string')
      && Array.isArray(week.periods) && week.periods.length > 0
      && week.periods.every((period) => period && Number.isInteger(period.number) && typeof period.time === 'string')
      && Array.isArray(week.courses) && week.courses.every((course) => course && typeof course.name === 'string'
        && Number.isInteger(course.day) && course.day >= 1 && course.day <= 7
        && Number.isInteger(course.start) && Number.isInteger(course.end) && course.end >= course.start
        && Array.isArray(course.details) && course.details.every((detail) => typeof detail === 'string')))
}

export function readTimetableCache(storage) {
  const raw = storage.getItem(TIMETABLE_KEY)
  if (!raw) return null
  const cache = JSON.parse(raw)
  if (!validateTimetableCache(cache)) throw new Error('本地课表数据不完整')
  return cache
}

function semesterStart(week) {
  const date = new Date(`${week.date}T00:00:00Z`)
  return date.getTime() - ((date.getUTCDay() + 6) % 7 + week.week * 7) * 86400000
}

export function mergeTimetableWeek(cache, username, timetable) {
  const updated = {
    version: 1, username, mode: timetable?.mode,
    savedAt: new Date().toISOString(), weeks: [timetable],
  }
  if (!validateTimetableCache(updated)) throw new Error('课表数据不完整，未覆盖本地课表')

  // 只合并同一账号、学期、节次模式；未重新获取的周次继续使用旧缓存。
  if (validateTimetableCache(cache) && cache.username === username && cache.mode === updated.mode
    && semesterStart(cache.weeks[0]) === semesterStart(timetable)) {
    updated.weeks = [...cache.weeks.filter((week) => week.week !== timetable.week), timetable]
      .sort((a, b) => a.week - b.week)
  }
  return updated
}

export function currentTimetableWeek(weeks, now = new Date()) {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return weeks.find((week) => {
    const date = new Date(`${week.date}T00:00:00Z`)
    const monday = date.getTime() - ((date.getUTCDay() + 6) % 7) * 86400000
    return today >= monday && today < monday + 7 * 86400000
  })?.week
}

// 将时间重叠的课程放进同一个单元格，避免冲突课程互相遮挡。
export function groupTimetableCourses(courses, day) {
  const groups = []
  for (const course of courses.filter((item) => item.day === day).sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = groups.at(-1)
    if (previous && course.start <= previous.end) {
      previous.end = Math.max(previous.end, course.end)
      previous.courses.push(course)
    } else {
      groups.push({ start: course.start, end: course.end, courses: [course] })
    }
  }
  return groups
}
