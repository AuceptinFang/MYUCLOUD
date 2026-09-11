import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeBackendOrigin, resolveBackendUrl } from '../src/utils/backend-url.js'

test('本地默认同源，配置后端后只改写后端路径', () => {
  const origin = 'https://u.pub.aucept.in/'
  for (const path of ['/api/login', '/api/jwgl/session', '/ucloud/upload', '/file/video.mp4?key=a%2Fb', '/office/?furl=x', '/jwgl/jsxsd/']) {
    assert.equal(resolveBackendUrl(path), path)
    assert.equal(resolveBackendUrl(path, origin), `https://u.pub.aucept.in${path}`)
  }
  for (const url of ['https://u.pub.aucept.in/api/login', 'https://example.com/video', '/assets/main.js', '/filename', '//example.com/api']) {
    assert.equal(resolveBackendUrl(url, origin), url)
  }
})

test('后端地址规范化，拒绝凭证、非 HTTP 协议及路径', () => {
  assert.equal(normalizeBackendOrigin(''), '')
  assert.equal(normalizeBackendOrigin('http://localhost:8787/'), 'http://localhost:8787')
  for (const value of ['u.pub.aucept.in', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/api', 'https://example.com/?secret=x']) {
    assert.throws(() => normalizeBackendOrigin(value))
  }
})
