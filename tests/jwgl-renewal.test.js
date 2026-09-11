import assert from 'node:assert/strict'
import test from 'node:test'
import { nextTick, watch } from 'vue'

test('更新教务凭证时保留登录身份，旧请求失败不会清除新凭证', async (t) => {
  const saved = new Map()
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
    removeItem: (key) => saved.delete(key),
  } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  const auth = await import('../src/api/jwgl.js?renewal')
  const requests = []
  let rejectOld
  t.mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, body: JSON.parse(options.body) })
    if (path.endsWith('/login')) return Response.json({ success: true, username: 'student', sessionKey: 'stable-login', sessionId: 'sealed-first', expiresAt: Date.now() + 60000 })
    if (path.endsWith('/pending')) return new Promise((resolve) => { rejectOld = () => resolve(Response.json({ success: false }, { status: 401 })) })
    if (path.endsWith('/courses')) return Response.json({ success: true, courses: [] }, { headers: { 'X-Jwgl-Session': 'sealed-renewed' } })
    return Response.json({ success: true })
  })
  await auth.loginJwgl('student', 'password')
  let changes = 0
  const stop = watch(auth.jwglSessionId, () => { changes++ })
  t.after(stop)
  const pending = assert.rejects(auth.jwglRequest('/api/jwgl/pending'), /凭证已更新/)
  await auth.jwglRequest('/api/jwgl/courses')
  await nextTick()
  assert.equal(auth.jwglSessionId.value, 'stable-login')
  assert.equal(auth.jwglToken.value, 'sealed-renewed')
  assert.equal(changes, 0)
  assert.equal(JSON.parse(saved.get(auth.JWGL_AUTH_KEY)).sessionId, 'sealed-renewed')
  rejectOld()
  await pending
  assert.equal(auth.jwglLoggedIn.value, true)
  assert.equal(auth.jwglToken.value, 'sealed-renewed')
  await auth.jwglRequest('/api/jwgl/timetable')
  assert.equal(requests.at(-1).body.sessionId, 'sealed-renewed')
  await auth.logoutJwgl()
  assert.equal(requests.at(-1).body.sessionId, 'sealed-renewed')
  assert.equal(auth.jwglLoggedIn.value, false)
})
