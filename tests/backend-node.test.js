import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer, request } from 'node:http'
import { createBackend } from '../server/app.js'
import { createBackendMiddleware } from '../vite.backend.js'

test('Node/Vite HTTP 适配正确读取请求体，并将页面交回静态服务', { timeout: 10000 }, async (t) => {
  const middleware = createBackendMiddleware(createBackend({ getSessionStore: () => new Map() }))
  const server = createServer((req, res) => middleware(req, res, () => res.end('frontend')))
  t.after(() => new Promise((resolve) => server.close(resolve)))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const send = (path, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method, headers: { 'Content-Type': 'application/json' } }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, text }))
    })
    req.on('error', reject)
    req.end(body)
  })
  assert.equal((await send('/')).text, 'frontend')
  assert.equal((await send('/src/App.vue')).text, 'frontend')
  const missing = await send('/api/login', 'POST', '{}')
  assert.equal(missing.status, 400)
  assert.equal(JSON.parse(missing.text).msg, 'username and password are required')
  assert.equal((await send('/api/login', 'POST', '{')).status, 400)
  assert.equal((await send('/api/jwgl/timetable', 'POST', '{}')).status, 401)
  assert.equal((await send('/api/login/extra', 'POST', '{}')).status, 404)
})
