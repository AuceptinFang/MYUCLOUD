import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { parseTimetable } from '../server/parsers/timetable.js'
import { mergeTimetableWeek, readTimetableCache, TIMETABLE_KEY } from '../src/utils/timetable.js'

test('浏览器共用凭证、刷新恢复、过期保留课表及旧请求不会清除新登录', { timeout: 10000 }, async (t) => {
  const timetable = parseTimetable(readFileSync(new URL('./fixtures/timetable.html', import.meta.url), 'utf8'))
  const cached = mergeTimetableWeek(null, 'student', timetable)
  const data = new Map([[TIMETABLE_KEY, JSON.stringify(cached)], ['jwgl_creds', 'legacy credentials']])
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
  })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  } })
  const auth = await import('../src/api/jwgl.js')
  const calls = []
  let token = 'first-token'
  let expired = false
  let loginFailed = false
  let offline = false
  let resolveOld
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    calls.push({ path, body: JSON.parse(options.body) })
    if (offline) throw new TypeError('Failed to fetch')
    if (path === '/api/jwgl/login' && loginFailed) return Response.json({ success: false, msg: '登录失败' }, { status: 401 })
    if (path === '/api/jwgl/login') return Response.json({ success: true, sessionId: token, username: 'student', expiresAt: Date.now() + 60000 })
    if (path === '/api/jwgl/pending') return new Promise((resolve) => { resolveOld = resolve })
    return Response.json({ success: !expired }, { status: expired ? 401 : 200 })
  })
  await auth.loginJwgl('student', 'password')
  assert.equal(auth.jwglLoggedIn.value, true)
  assert.equal(data.has('jwgl_creds'), false)
  assert.ok(!data.get(auth.JWGL_AUTH_KEY).includes('password'))
  await auth.jwglRequest('/api/jwgl/courses')
  await auth.jwglRequest('/api/jwgl/timetable')
  assert.equal(calls[1].body.sessionId, calls[2].body.sessionId)
  const restored = await import('../src/api/jwgl.js?restored')
  assert.equal(restored.jwglSessionId.value, 'first-token')
  const pending = auth.jwglFetch('/api/jwgl/pending')
  const rejected = assert.rejects(pending, /过期/)
  token = 'new-token'
  await auth.loginJwgl('student', 'password')
  resolveOld(new Response('{}', { status: 401 }))
  await rejected
  assert.equal(auth.jwglSessionId.value, 'new-token')
  expired = true
  await assert.rejects(auth.jwglRequest('/api/jwgl/courses'), /过期/)
  assert.equal(auth.jwglLoggedIn.value, false)
  assert.deepEqual(readTimetableCache(localStorage), cached)
  assert.equal(data.has(auth.JWGL_AUTH_KEY), false)
  loginFailed = true
  await assert.rejects(auth.loginJwgl('student', 'wrong-password'), /登录失败/)
  assert.deepEqual(readTimetableCache(localStorage), cached)
  offline = true
  await assert.rejects(auth.loginJwgl('student', 'password'), /Failed to fetch/)
  const afterReload = await import('../src/api/jwgl.js?offline')
  assert.equal(afterReload.jwglLoggedIn.value, false)
  assert.deepEqual(readTimetableCache(localStorage), cached)
})
