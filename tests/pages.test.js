import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, createServer } from 'vite'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parseTimetable } from '../server/parsers/timetable.js'
import { mergeTimetableWeek, TIMETABLE_KEY } from '../src/utils/timetable.js'

test('Pages 构建适配项目子路径，且不包含本地插件、调试页及私有字体', { timeout: 30000 }, async (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'myucloud-pages-'))
  t.after(() => rmSync(outDir, { recursive: true, force: true }))
  await build({ mode: 'pages', logLevel: 'silent', build: { outDir, emptyOutDir: false } })
  const html = readFileSync(join(outDir, 'index.html'), 'utf8')
  assert.match(html, /src="\.\/assets\//)
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//)
  const assets = readdirSync(join(outDir, 'assets'))
  assert.ok(!assets.some((name) => /DebugPanel|local-fonts/.test(name)))
  assert.ok(!readdirSync(outDir).includes('fonts'))
  const code = assets.filter((name) => name.endsWith('.js')).map((name) => readFileSync(join(outDir, 'assets', name), 'utf8')).join('\n')
  assert.match(code, /https:\/\/u\.pub\.aucept\.in/)
  assert.doesNotMatch(code, /attendancebasicinfo|attendancedetailinfo|签到/)
})

test('未配置后端的 Pages 仍保留只读预览和课表缓存', { timeout: 30000 }, async (t) => {
  const week = parseTimetable(readFileSync(new URL('./fixtures/timetable.html', import.meta.url), 'utf8'))
  const cache = mergeTimetableWeek(null, 'cached-student', week)
  const storage = new Map([[TIMETABLE_KEY, JSON.stringify(cache)], ['mock-ucloud-blade-auth', 'private-token']])
  for (const [key, value] of Object.entries({
    localStorage: { getItem: (name) => storage.get(name) ?? null },
    window: { location: { hash: '#timetable', origin: 'https://example.github.io' }, addEventListener() {} },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key)
    Object.defineProperty(globalThis, key, { configurable: true, value })
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else delete globalThis[key] })
  }
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => { requests++; throw new Error('Preview must not fetch') })
  const server = await createServer({
    mode: 'pages', logLevel: 'silent',
    define: { 'import.meta.env.VITE_BACKEND_URL': JSON.stringify('') },
    server: { middlewareMode: true, hmr: false, watch: null },
  })
  t.after(() => server.close())
  const http = await server.ssrLoadModule('/src/api/http.js')
  await assert.rejects(http.fetchBackend('/api/login', { method: 'POST', body: 'private-password' }), /此预览未连接后端/)
  const { default: App } = await server.ssrLoadModule('/src/App.vue')
  const html = await renderToString(createSSRApp(App))
  assert.match(html, /此预览未连接后端/)
  assert.match(html, /cached-student/)
  assert.match(html, /测试课程 &amp; 实验/)
  assert.match(html, /id="jwgl-password"[^>]*disabled/)
  assert.equal(requests, 0)
  assert.equal(storage.get(TIMETABLE_KEY), JSON.stringify(cache))
})

test('Pages 默认将登录、业务、视频和 Office 预览指向配置的后端', { timeout: 30000 }, async (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const storage = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage })
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return Response.json({ success: true, code: 200, sessionId: 'test-session', username: 'student', expiresAt: Date.now() + 60000 })
  })
  const server = await createServer({ mode: 'pages', logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
  t.after(() => server.close())
  const runtime = await server.ssrLoadModule('/src/utils/runtime.js')
  assert.equal(runtime.STATIC_PREVIEW, false)
  const ucloud = await server.ssrLoadModule('/src/api/ucloud.js')
  const jwgl = await server.ssrLoadModule('/src/api/jwgl.js')
  await ucloud.loginWithCredentials({ username: 'student', password: 'test' })
  await jwgl.loginJwgl('student', 'test')
  await ucloud.getUserInfo('token')
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://u.pub.aucept.in/api/login',
    'https://u.pub.aucept.in/api/jwgl/login',
    'https://u.pub.aucept.in/ucloud/ykt-basics/info',
  ])
  const file = 'https://fileucloud.bupt.edu.cn/ucloud/video/test.mp4?signature=a%2Fb'
  assert.equal(ucloud.buildFileUrl(file), 'https://u.pub.aucept.in/file/ucloud/video/test.mp4?signature=a%2Fb')
  assert.match(ucloud.buildPreviewUrl({ previewUrl: file }), /^https:\/\/u\.pub\.aucept\.in\/office\//)
  const { default: AuthBar } = await server.ssrLoadModule('/src/components/common/AuthBar.vue')
  const html = await renderToString(createSSRApp(AuthBar, { loginAction: '/api/jwgl/login', credentialScope: 'jwgl' }))
  assert.match(html, /action="https:\/\/u\.pub\.aucept\.in\/api\/jwgl\/login"/)
  assert.doesNotMatch(html, /id="jwgl-password"[^>]*disabled/)
})
