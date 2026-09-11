import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchBackend, friendlyError, readBackendJson, responseErrorMessage } from '../src/api/http.js'
import { getUserInfo, readResponse, assertUcloudOk } from '../src/api/ucloud.js'
import { loginJwgl } from '../src/api/jwgl.js'

test('网络故障转换为可理解的提示，调用者主动取消仍可识别', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(fetchBackend('/api/login'), /暂时无法连接服务，请稍后重试/)
  await assert.rejects(getUserInfo('test-token'), /无法连接服务/)
  const controller = new AbortController()
  controller.abort()
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => { signal.throwIfAborted() })
  await assert.rejects(fetchBackend('/api/login', { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(friendlyError(new DOMException('timeout', 'TimeoutError')), '请求超时，请稍后重试。')
})

test('HTML 错误页和错误后端地址不暴露 JSON 解析异常', async () => {
  for (const status of [200, 401, 404, 405, 502]) {
    const response = new Response('<html>server error</html>', { status, headers: { 'Content-Type': 'text/html' } })
    await assert.rejects(readBackendJson(response), (error) => {
      assert.doesNotMatch(error.message, /Unexpected|JSON|<html>/)
      assert.match(error.message, /服务|后端/)
      return true
    })
  }
  await assert.rejects(readBackendJson(new Response('null')), /服务响应异常/)
  const debug = await readResponse(new Response('<html>debug content</html>'), { allowText: true })
  assert.equal(debug.body, '<html>debug content</html>')
})

test('保留账号和业务错误，不误报为网络故障', async (t) => {
  const body = { success: false, msg: '教务密码错误' }
  t.mock.method(globalThis, 'fetch', async () => Response.json(body, { status: 401 }))
  await assert.rejects(loginJwgl('student', 'wrong'), /教务密码错误/)
  assert.equal(responseErrorMessage({ status: 503 }, null), '服务暂不可用，请稍后重试。')
  assert.equal(responseErrorMessage({ status: 500 }, { msg: 'fetch failed' }), '服务暂不可用，请稍后重试。')
  assert.throws(() => assertUcloudOk({ ok: true, status: 200, body: { success: false, msg: '附件已删除' } }, '预览'), /附件已删除/)
})

test('教务登录遇到静态站点错误页时给出后端提示', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>Not Found</html>', { status: 404 }))
  await assert.rejects(loginJwgl('student', 'test'), /服务暂不可用/)
})

test('用户可见错误不包含后端 URL 或上游连接细节', () => {
  assert.equal(friendlyError(new Error('连接 https://u.aucept.in 失败')), '操作失败，请稍后重试。')
  assert.equal(responseErrorMessage({ status: 502 }, { msg: '无法连接上游服务 jwgl.bupt.edu.cn' }), '服务暂不可用，请稍后重试。')
  assert.equal(responseErrorMessage({ status: 400 }, { msg: '请求 https://u.aucept.in 失败' }), '请求失败，请稍后重试。')
})

test('流式响应开始后不被连接超时中断', async (t) => {
  let signal
  let source
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    signal = options.signal
    return new Response(new ReadableStream({ start(controller) { source = controller } }))
  })
  const response = await fetchBackend('/api/jwgl/evaluate', {}, { streaming: true, timeoutMs: 5 })
  await new Promise((resolve) => setTimeout(resolve, 15))
  assert.equal(signal.aborted, false)
  source.enqueue(new TextEncoder().encode('data: progress\n\n'))
  source.close()
  assert.equal(await response.text(), 'data: progress\n\n')
})
