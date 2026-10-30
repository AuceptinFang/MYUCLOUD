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

// 课表日期是北京时间，“今天”也按北京时间算，设备在其他时区时不会错到上一周或下一周
export function currentTimetableWeek(weeks, now = new Date()) {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const today = Date.UTC(beijing.getUTCFullYear(), beijing.getUTCMonth(), beijing.getUTCDate())
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

// 备注按课程名保存，同一课程在所有周次、时段共用；与课表缓存分开，重新同步不会丢失。
export const TIMETABLE_NOTES_KEY = 'mock-ucloud-course-notes-v1'

export function readTimetableNotes(storage, username) {
  const notes = JSON.parse(storage.getItem(TIMETABLE_NOTES_KEY) || '{}')?.[username]
  return notes && typeof notes === 'object' ? notes : {}
}

export function writeTimetableNote(storage, username, courseName, text) {
  const all = JSON.parse(storage.getItem(TIMETABLE_NOTES_KEY) || '{}') || {}
  const notes = { ...all[username] }
  if (text.trim()) notes[courseName] = text.trim()
  else delete notes[courseName]
  storage.setItem(TIMETABLE_NOTES_KEY, JSON.stringify({ ...all, [username]: notes }))
  return notes
}

// 旧版备注按「日期#起始节次」保存在单元格上。迁移到对应课程后从旧数据中移除；
// 找不到课程的（写在空白格或周次未缓存）原样保留，作为 leftovers 返回给页面展示。
export const LEGACY_TIMETABLE_NOTES_KEY = 'mock-ucloud-timetable-notes-v1'

function legacyNoteCourses(cache, key) {
  const [date, period] = key.split('#')
  const target = Date.parse(`${date}T00:00:00Z`)
  for (const week of cache.weeks) {
    const start = new Date(`${week.date}T00:00:00Z`)
    const monday = start.getTime() - ((start.getUTCDay() + 6) % 7) * 86400000
    const day = (target - monday) / 86400000 + 1
    if (day < 1 || day > 7) continue
    return groupTimetableCourses(week.courses, day).find((group) => group.start === Number(period))?.courses || []
  }
  return []
}

export function migrateLegacyTimetableNotes(storage, cache) {
  const legacyAll = JSON.parse(storage.getItem(LEGACY_TIMETABLE_NOTES_KEY) || '{}') || {}
  const legacy = legacyAll[cache.username]
  if (!legacy || typeof legacy !== 'object') return {}
  let notes = readTimetableNotes(storage, cache.username)
  const leftovers = {}
  for (const [key, text] of Object.entries(legacy)) {
    const names = [...new Set(legacyNoteCourses(cache, key).map((course) => course.name))]
    if (!names.length) { leftovers[key] = text; continue }
    for (const name of names) {
      const existing = notes[name] || ''
      if (!existing.includes(text)) notes = writeTimetableNote(storage, cache.username, name, existing ? `${existing}\n${text}` : text)
    }
  }
  storage.setItem(LEGACY_TIMETABLE_NOTES_KEY, JSON.stringify({ ...legacyAll, [cache.username]: leftovers }))
  return leftovers
}
