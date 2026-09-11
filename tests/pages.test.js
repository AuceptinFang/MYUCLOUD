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
  assert.match(code, /此预览未连接后端/)
  assert.doesNotMatch(code, /attendancebasicinfo|attendancedetailinfo|签到/)
})

test('Pages 请求层拒绝发送凭证，缓存课表仍可渲染', { timeout: 30000 }, async (t) => {
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
  const server = await createServer({ mode: 'pages', logLevel: 'silent', server: { middlewareMode: true, hmr: false, watch: null } })
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
