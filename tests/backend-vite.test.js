import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, preview } from 'vite'

test('Vite 开发与预览服务挂载同一套 Hono 接口', { timeout: 30000 }, async (t) => {
  const dist = mkdtempSync(join(tmpdir(), 'myucloud-preview-test-'))
  writeFileSync(join(dist, 'index.html'), '<html>preview fixture</html>')
  t.after(() => rmSync(dist, { recursive: true, force: true }))
  const dev = await createServer({ logLevel: 'silent', server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } })
  try {
    await dev.listen()
    const response = await fetch(`http://127.0.0.1:${dev.httpServer.address().port}/api/login`, { method: 'POST', body: '{}' })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).success, false)
  } finally { await dev.close() }

  const server = await preview({ logLevel: 'silent', build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0 } })
  try {
    const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/api/jwgl/login`, { method: 'POST', body: '{}' })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).success, false)
  } finally {
    await new Promise((resolve) => server.httpServer.close(resolve))
  }
})
