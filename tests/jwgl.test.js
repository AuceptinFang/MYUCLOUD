import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { parseTimetable } from '../jwgl-timetable.js'
import { JwglSessionStore } from '../jwgl-sessions.js'
import { currentTimetableWeek, groupTimetableCourses, validateTimetableCache } from '../src/utils/timetable.js'

const html = readFileSync(new URL('./fixtures/timetable.html', import.meta.url), 'utf8')

test('课表解析保留地点和节次，合并重复连堂课', () => {
  const week = parseTimetable(html)
  assert.equal(week.courses.length, 1)
  assert.equal(week.courses[0].name, '测试课程 & 实验')
  assert.equal(week.courses[0].location, '测试楼-101')
  assert.deepEqual([week.courses[0].day, week.courses[0].start, week.courses[0].end], [1, 1, 2])
  assert.equal(week.days.length, 7)
  assert.equal(currentTimetableWeek([week], new Date(2026, 8, 7)), 1)
  assert.equal(currentTimetableWeek([week], new Date(2026, 8, 13)), 1)
  assert.equal(currentTimetableWeek([week], new Date(2026, 8, 14)), undefined)
})

test('接受空课表和第0周，拒绝登录页和不完整课表', () => {
  const empty = html.replace(/<div class="table-class[\s\S]*?<\/div>/g, '').replace("dqzc = '1'", "dqzc = '0'")
  assert.equal(parseTimetable(empty).week, 0)
  assert.deepEqual(parseTimetable(empty).courses, [])
  assert.throws(() => parseTimetable('<input id="userAccount">'))
  assert.throws(() => parseTimetable(html.replace('1[01-02]节', '未知格式')))
  const cache = { version: 1, username: 'student', savedAt: new Date().toISOString(), weeks: [parseTimetable(empty)] }
  assert.equal(validateTimetableCache(cache), true)
  assert.equal(validateTimetableCache({ ...cache, weeks: [{}] }), false)
  assert.equal(validateTimetableCache(null), false)
})

test('重叠课程合并展示且不丢失课程', () => {
  const courses = [{ day: 1, start: 1, end: 2 }, { day: 1, start: 2, end: 3 }, { day: 1, start: 4, end: 5 }]
  const groups = groupTimetableCourses(courses, 1)
  assert.equal(groups.length, 2)
  assert.equal(groups[0].end, 3)
  assert.equal(groups[0].courses.length, 2)
})

test('服务端凭证可在重启后恢复，支持过期和撤销', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'jwgl-session-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'sessions.local')
  const store = new JwglSessionStore(file)
  store.set('token', { username: 'student', cookies: 'route=test; JSESSIONID=test', expiresAt: Date.now() + 60000 })
  assert.equal(new JwglSessionStore(file).get('token').username, 'student')
  assert.equal(statSync(file).mode & 0o777, 0o600)
  store.set('expired', { username: 'student', cookies: '', expiresAt: 1 })
  assert.equal(store.get('expired'), undefined)
  store.delete('token')
  assert.equal(new JwglSessionStore(file).get('token'), undefined)
})

test('同一登录凭证访问课表和评教，恢复和退出遵循相同接口', { timeout: 10000 }, async (t) => {
  const previous = process.cwd()
  const dir = mkdtempSync(join(tmpdir(), 'jwgl-api-test-'))
  process.chdir(dir)
  t.after(() => { process.chdir(previous); rmSync(dir, { recursive: true, force: true }) })
  t.mock.method(console, 'log', () => {})
  let expired = false
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url, options })
    if (String(url).includes('xsdPerson.jsp')) return new Response(html)
    if (String(url).includes('xspj_find.do')) return new Response(expired ? '<input id="userAccount">' : '<html>暂无评教批次</html>')
    if (String(url).endsWith('LoginToXk')) return new Response('ok', { headers: { 'Set-Cookie': 'JSESSIONID=updated; Path=/' } })
    return new Response('ok', { headers: { 'Set-Cookie': 'route=test; Path=/' } })
  })
  const { jwglPlugin } = await import('../vite.jwgl.js')
  const routes = new Map()
  jwglPlugin().configureServer({ middlewares: { use: (path, handler) => routes.set(path, handler) } })
  const request = (path, body) => new Promise((resolve, reject) => {
    const req = Readable.from([JSON.stringify(body)])
    req.method = 'POST'
    const res = { statusCode: 200, setHeader() {}, end(value) { resolve({ status: this.statusCode, ...JSON.parse(value) }) } }
    Promise.resolve(routes.get(path)(req, res, () => reject(new Error('unexpected next')))).catch(reject)
  })
  assert.equal((await request('/api/jwgl/timetable', {})).status, 401)
  const login = await request('/api/jwgl/login', { username: 'student', password: 'test-password' })
  assert.equal(login.status, 200)
  assert.equal(login.username, 'student')
  assert.ok(login.expiresAt > Date.now())
  const session = { sessionId: login.sessionId }
  assert.equal((await request('/api/jwgl/timetable', { ...session, week: 1 })).timetable.courses.length, 1)
  assert.equal((await request('/api/jwgl/timetable', { ...session, week: -1 })).status, 400)
  assert.equal((await request('/api/jwgl/timetable', { ...session, week: 0 })).status, 502)
  assert.equal((await request('/api/jwgl/courses', session)).success, true)
  assert.equal((await request('/api/jwgl/session', session)).username, 'student')
  const remote = calls.find(({ url }) => String(url).includes('xsdPerson.jsp'))
  assert.match(remote.options.headers.Cookie, /route=test/)
  assert.match(remote.options.headers.Cookie, /JSESSIONID=updated/)
  expired = true
  assert.equal((await request('/api/jwgl/courses', session)).status, 401)
  assert.equal((await request('/api/jwgl/session', session)).status, 401)
  assert.equal((await request('/api/jwgl/logout', session)).success, true)
  assert.equal((await request('/api/jwgl/timetable', session)).status, 401)
})
