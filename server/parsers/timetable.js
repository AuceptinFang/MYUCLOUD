function text(html = '') {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return html.replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] ?? match
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    })
    .replace(/\s+/g, ' ').trim()
}

function options(html, id) {
  const select = html.match(new RegExp(`<select\\b[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/select>`, 'i'))?.[1] || ''
  return [...select.matchAll(/<option\b[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({ value: text(match[1]), label: text(match[2]) }))
}

export function parseTimetable(html) {
  if (!/class=["'][^"']*\btable-header\b/i.test(html)) {
    throw new Error('未找到课表，请重新登录教务系统后重试')
  }

  const week = Number(html.match(/\bvar\s+dqzc\s*=\s*['"](\d+)['"]/)?.[1])
  const mode = html.match(/\bvar\s+kbjcmsid\s*=\s*['"]([^'"]+)['"]/)?.[1] || ''
  const date = html.match(/<input\b[^>]*id=["']xzrq["'][^>]*value=["'](\d{4}-\d{2}-\d{2})["']/i)?.[1] || ''
  const weeks = options(html, 'xkzc').map(({ value }) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value <= 60)
  const modes = options(html, 'kbjcmsid')
  const header = html.match(/<ul\b[^>]*class=["']table-header["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] || ''
  const days = [...header.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].slice(1).map((match) => {
    const spans = [...match[1].matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map((span) => text(span[1]))
    return { label: spans[0], date: spans[1] || '' }
  })
  const periods = [...html.matchAll(/<li\b[^>]*class=["']row-one["'][^>]*>([\s\S]*?)<\/li>/gi)].map((match) => ({
    number: Number(text(match[1].match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1])),
    time: text(match[1]).match(/\d{2}:\d{2}\s*[～~\-—]\s*\d{2}:\d{2}/)?.[0] || '',
  }))

  if (!Number.isInteger(week) || !weeks.includes(week) || !mode || !date || days.length !== 7 || !periods.length) {
    throw new Error('课表页面缺少周次、日期或节次信息，暂未更新本地课表')
  }

  const courses = []
  const seen = new Set()
  for (const match of html.matchAll(/<div\b[^>]*class=["']([^"']*\btable-class\b[^"']*)["'][^>]*>([\s\S]*?)<\/div>/gi)) {
    const day = Number(match[1].match(/\bday(\d)\b/)?.[1]) + 1
    const name = text(match[2].match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1])
    const details = [...match[2].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((item) => text(item[1]))
    const field = (label) => details.find((item) => item.startsWith(label))?.replace(new RegExp(`^${label}[:：]\\s*`), '') || ''
    const schedule = field('上课时间')
    const slots = schedule.match(/\[([\d\s,，\-]+)\]节/)?.[1].match(/\d+/g)?.map(Number) || []
    if (!name || day < 1 || day > 7 || !slots.length || !slots.every((slot) => periods.some((period) => period.number === slot))) {
      throw new Error('部分课程的时间格式无法识别，暂未更新本地课表')
    }
    const course = {
      name, day, start: Math.min(...slots), end: Math.max(...slots),
      location: field('上课地点'), campus: field('上课校区'), schedule, details,
    }
    const key = JSON.stringify(course)
    if (!seen.has(key)) { seen.add(key); courses.push(course) }
  }

  return { week, mode, date, weeks, modes, days, periods, courses }
}
