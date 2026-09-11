import assert from 'node:assert/strict'
import test from 'node:test'
import { createBackend } from '../server/app.js'

const origin = 'https://auceptinfang.github.io'
const app = (allowedOrigins) => createBackend({ getSessionStore: () => new Map(), allowedOrigins })

test('Pages 的 JSON、鉴权头和视频 Range 预检由后端处理', async () => {
  const backend = app()
  for (const path of ['/api/login', '/api/jwgl/login', '/ucloud/upload', '/file/video.mp4']) {
    const response = await backend.request(path, { method: 'OPTIONS', headers: {
      Origin: origin, 'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization,blade-auth,tenant-id,range',
    } })
    assert.equal(response.status, 204)
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
    for (const header of ['Content-Type', 'Authorization', 'Blade-Auth', 'Tenant-Id', 'Range']) {
      assert.ok(response.headers.get('Access-Control-Allow-Headers').includes(header))
    }
    assert.equal(response.headers.has('Access-Control-Allow-Credentials'), false)
  }
})

test('登录错误也携带 CORS 响应头，其他站点不在允许列表', async () => {
  const backend = app()
  const response = await backend.request('/api/login', { method: 'POST', headers: { Origin: origin }, body: '{}' })
  assert.equal(response.status, 400)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  const denied = await backend.request('/api/login', { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example' } })
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null)
  const custom = await app('https://frontend.example').request('/api/login', { method: 'OPTIONS', headers: { Origin: 'https://frontend.example' } })
  assert.equal(custom.headers.get('Access-Control-Allow-Origin'), 'https://frontend.example')
})

test('学校的 CORS 头被替换，Range 响应和长度仍可读取', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('abc', { status: 206, headers: {
    'Content-Range': 'bytes 0-2/10', 'Content-Length': '3',
    'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Credentials': 'true',
  } }))
  const backend = app()
  const response = await backend.request('/file/video.mp4', { headers: { Origin: origin, Range: 'bytes=0-2' } })
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  assert.equal(response.headers.has('Access-Control-Allow-Credentials'), false)
  assert.match(response.headers.get('Access-Control-Expose-Headers'), /Content-Range/)
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-2/10')
  assert.equal(response.status, 206)
  assert.equal(await response.text(), 'abc')
  const denied = await backend.request('/file/video.mp4', { headers: { Origin: 'https://untrusted.example' } })
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null)
})
