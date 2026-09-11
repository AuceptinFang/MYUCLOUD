import assert from 'node:assert/strict'
import test from 'node:test'
import { Hono } from 'hono'
import { createBackend, isBackendPath } from '../server/app.js'
import { createJwglRoutes } from '../server/routes/jwgl.js'

function backend() {
  const sessions = new Map()
  return { app: createBackend({ getSessionStore: () => sessions }), sessions }
}

const post = (app, path, body) => app.request(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})

test('Hono 路由拒绝无效 JSON，并与前端页面路径隔离', async () => {
  const { app } = backend()
  for (const body of ['{', 'null', '[]', '"text"']) {
    const response = await app.request('/api/login', { method: 'POST', body })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).success, false)
  }
  assert.equal((await app.request('/api/login')).status, 404)
  assert.equal((await post(app, '/api/login/extra', {})).status, 404)
  assert.equal(isBackendPath('/api/jwgl/login'), true)
  assert.equal(isBackendPath('/file/video.mp4'), true)
  assert.equal(isBackendPath('/office/index.html'), true)
  assert.equal(isBackendPath('/src/App.vue'), false)
  assert.equal(isBackendPath('/filename'), false)
})

test('UCloud 登录保留 CAS、OAuth 和用户信息的接口契约', async (t) => {
  t.mock.method(console, 'log', () => {})
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url: String(url), options })
    if (calls.length === 1) return new Response('<input name="execution" value="test-execution">', { headers: { 'Set-Cookie': 'CAS=test-cookie' } })
    if (calls.length === 2) return new Response(null, { status: 302, headers: { Location: 'https://ucloud.bupt.edu.cn?ticket=ST-test' } })
    if (calls.length === 3) return Response.json({ access_token: 'ucloud-test-token', refresh_token: 'refresh-test' })
    return Response.json({ code: 200, data: { id: 'test-user' } })
  })
  const { app } = backend()
  const response = await post(app, '/api/login', { username: 'student', password: 'cas-password' })
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.token, 'ucloud-test-token')
  assert.equal(data.authHeaders['Blade-Auth'], data.token)
  assert.equal(data.userInfo.body.data.id, 'test-user')
  assert.equal(calls[1].options.redirect, 'manual')
  assert.equal(calls[1].options.headers.Cookie, 'CAS=test-cookie')
  assert.equal(calls[1].options.body.get('password'), 'cas-password')
  assert.equal(calls[2].options.body.get('ticket'), 'ST-test')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
})

test('UCloud 登录失败仍返回可识别的阶段', async (t) => {
  t.mock.method(console, 'log', () => {})
  t.mock.method(globalThis, 'fetch', async () => new Response('<p>密码错误</p>'))
  const { app } = backend()
  const response = await post(app, '/api/login', { username: 'student', password: 'wrong' })
  assert.equal(response.status, 401)
  assert.equal((await response.json()).stage, 'cas-login')
})

test('文件代理保留 Range 和编码查询，剥离鉴权头并保持 206', async (t) => {
  let incoming
  t.mock.method(globalThis, 'fetch', async (request) => {
    incoming = request
    return new Response('abc', { status: 206, headers: { 'Content-Range': 'bytes 0-2/99', 'Content-Length': '3', 'Content-Type': 'video/mp4' } })
  })
  const { app } = backend()
  const response = await app.request('/file/ucloud/video/test.mp4?name=%E4%B8%AD&signature=a%2Fb', {
    headers: { Range: 'bytes=0-2', Authorization: 'secret', 'Blade-Auth': 'token', 'Tenant-Id': '000000', Host: 'localhost:5173' },
  })
  assert.equal(incoming.url, 'https://fileucloud.bupt.edu.cn/ucloud/video/test.mp4?name=%E4%B8%AD&signature=a%2Fb')
  assert.equal(incoming.headers.get('Range'), 'bytes=0-2')
  assert.equal(incoming.headers.get('Origin'), 'https://ucloud.bupt.edu.cn')
  assert.equal(incoming.headers.get('Referer'), 'https://ucloud.bupt.edu.cn/')
  for (const header of ['Authorization', 'Blade-Auth', 'Tenant-Id', 'Host']) assert.equal(incoming.headers.has(header), false)
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-2/99')
  assert.equal(await response.text(), 'abc')
})

test('业务代理保留上传请求体和鉴权头，Office 代理保留路径', async (t) => {
  const received = []
  t.mock.method(globalThis, 'fetch', async (request) => {
    received.push({ url: request.url, headers: request.headers, body: await request.text(), redirect: request.redirect })
    return new Response(null, { status: 302, headers: { Location: 'https://example.com/next' } })
  })
  const { app } = backend()
  const response = await app.request('/ucloud/resource/upload', {
    method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=test', 'Blade-Auth': 'token' },
    body: '--test\r\nfile-content\r\n--test--',
  })
  assert.equal(received[0].headers.get('Blade-Auth'), 'token')
  assert.equal(received[0].body, '--test\r\nfile-content\r\n--test--')
  assert.equal(received[0].redirect, 'manual')
  assert.equal(response.status, 302)
  await app.request('/office/view?furl=test')
  assert.equal(received[1].url, 'https://ucloud.bupt.edu.cn/office/view?furl=test')
  await app.request('/file//other.example/secret')
  assert.equal(new URL(received[2].url).origin, 'https://fileucloud.bupt.edu.cn')
})

test('代理直接返回流，不等完整文件下载后再响应', async (t) => {
  let source
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) { source = controller } })))
  const { app } = backend()
  const response = await app.request('/file/large.mp4')
  const reader = response.body.getReader()
  source.enqueue(new TextEncoder().encode('first chunk'))
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'first chunk')
  source.close()
  assert.equal((await reader.read()).done, true)
})

test('评教开始前验证会话，过期时返回 JSON 401', async (t) => {
  t.mock.method(console, 'log', () => {})
  t.mock.method(globalThis, 'fetch', async () => new Response('<input id="userAccount">'))
  const { app, sessions } = backend()
  sessions.set('expired', { cookies: 'JSESSIONID=old' })
  const response = await post(app, '/api/jwgl/evaluate', { sessionId: 'expired', targetScore: 85, selectedCourses: [] })
  assert.equal(response.status, 401)
  assert.match(response.headers.get('Content-Type'), /application\/json/)
  assert.equal(sessions.has('expired'), false)
})

test('现有评教和提交业务通过 Hono 返回完成事件', async (t) => {
  t.mock.method(console, 'log', () => {})
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>暂无评教批次</html>'))
  const { app, sessions } = backend()
  sessions.set('active', { cookies: 'JSESSIONID=test' })
  for (const action of ['evaluate', 'submit']) {
    const response = await post(app, `/api/jwgl/${action}`, { sessionId: 'active', targetScore: 85, selectedCourses: [] })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type'), /text\/event-stream/)
    assert.match(await response.text(), /"type":"done"/)
  }
})

test('SSE 逐条发送，流中错误保持前端可识别的 JSON 事件', async () => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  const app = new Hono().route('/api/jwgl', createJwglRoutes({
    async *evaluate() {
      yield { type: 'course', courseIndex: 1 }
      await gate
      throw new Error('upstream failed')
    },
  }))
  const response = await post(app, '/api/jwgl/evaluate', {})
  assert.equal(response.headers.get('X-Accel-Buffering'), 'no')
  const reader = response.body.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.match(first, /data: \{"type":"course","courseIndex":1\}\n\n/)
  release()
  let rest = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    rest += new TextDecoder().decode(chunk.value)
  }
  assert.match(rest, /"type":"error","message":"upstream failed"/)
})

test('停止读取 SSE 会取消业务使用的信号', async () => {
  let operationSignal
  const app = new Hono().route('/api/jwgl', createJwglRoutes({
    async *evaluate(_body, signal) {
      operationSignal = signal
      yield { type: 'course' }
      await new Promise((resolve) => {
        if (signal.aborted) resolve()
        else signal.addEventListener('abort', resolve, { once: true })
      })
    },
  }))
  const response = await post(app, '/api/jwgl/evaluate', {})
  const reader = response.body.getReader()
  await reader.read()
  await reader.cancel()
  assert.equal(operationSignal.aborted, true)
})
