import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const DEFAULT_BACKEND = 'https://myu.aucept.in'
const OAUTH_AUTHORIZATION = 'Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ='
const BUSINESS_AUTHORIZATION = 'Basic c3dvcmQ6c3dvcmRfc2VjcmV0'
const TENANT_ID = '000000'
const REQUEST_TIMEOUT_MS = 30000
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000

export class CliError extends Error {
  constructor(message, detail) {
    super(message)
    this.detail = detail
  }
}

// 凭证存在 ~/.myucloud/session.json（MYU_HOME 可改目录），权限 0600
export function createSessionStore(dir = process.env.MYU_HOME || join(homedir(), '.myucloud')) {
  const file = join(dir, 'session.json')
  return {
    dir,
    read() {
      try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return null }
    },
    write(session) {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      writeFileSync(file, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 })
    },
    clear() { rmSync(file, { force: true }) },
  }
}

function normalizeBackend(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)) throw new CliError('后端地址必须是 HTTP 或 HTTPS')
  return url.origin
}

async function readBody(response) {
  const text = await response.text()
  try { return text ? JSON.parse(text) : null } catch { return text }
}

const isExpired = (response, body) => response.status === 401 || body?.code === 401

// 所有学校接口都经后端的 /ucloud 代理；token 过期时用 refresh_token 换一次再重试
export function createClient({ store = createSessionStore(), backend, fetch = globalThis.fetch } = {}) {
  let session = store.read()
  const origin = () => normalizeBackend(backend || process.env.MYU_BACKEND || session?.backend || DEFAULT_BACKEND)

  async function call(url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
    } catch (error) {
      const reason = error?.name === 'TimeoutError' ? `${timeoutMs / 1000} 秒内没有响应` : error?.cause?.message || error?.message
      throw new CliError(`无法连接后端 ${origin()}：${reason}`)
    }
  }

  function requireSession() {
    if (!session?.token) throw new CliError('还没有登录凭证：请先运行 auth <token>（在 MYUCLOUD 网页登录后点「复制给 Agent」获取）')
    return session
  }

  async function refresh() {
    if (!session?.refreshToken) return false
    const response = await call(`${origin()}/ucloud/ykt-basics/oauth/token`, {
      method: 'POST',
      headers: { Authorization: OAUTH_AUTHORIZATION, 'Tenant-Id': TENANT_ID, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: session.refreshToken }),
    })
    const body = await readBody(response)
    if (!response.ok || !body?.access_token) return false
    session = { ...session, token: body.access_token, refreshToken: body.refresh_token || session.refreshToken, savedAt: new Date().toISOString() }
    store.write(session)
    return true
  }

  async function send(method, path, { query, json, form } = {}) {
    const url = new URL(`/ucloud${path}`, origin())
    for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, String(value))
    const headers = { Accept: 'application/json', 'Blade-Auth': requireSession().token, Authorization: BUSINESS_AUTHORIZATION, 'Tenant-Id': TENANT_ID }
    let body
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(json)
    } else if (form) {
      body = form
    }
    const response = await call(url, { method, headers, body })
    return { response, body: await readBody(response) }
  }

  async function request(method, path, options = {}) {
    let { response, body } = await send(method, path, options)
    if (isExpired(response, body) && await refresh()) ({ response, body } = await send(method, path, options))
    if (isExpired(response, body)) throw new CliError('登录凭证已过期且无法刷新：请在 MYUCLOUD 网页重新登录后再点「复制给 Agent」')
    if (!response.ok || body?.success === false || (body?.code && body.code !== 200)) {
      throw new CliError(`${method} ${path} 失败：${body?.msg || response.status}`, { status: response.status, body })
    }
    return body
  }

  // 下载走后端的 /file 代理，路径和签名参数原样保留
  async function download(fileUrl) {
    const url = new URL(fileUrl)
    const response = await call(`${origin()}/file${url.pathname}${url.search}`, {}, DOWNLOAD_TIMEOUT_MS)
    if (!response.ok) throw new CliError(`下载失败：HTTP ${response.status}`)
    return response
  }

  return {
    request,
    download,
    storeDir: store.dir,
    get session() { return session },
    backend: origin,
    save(next) {
      session = { ...next, backend: next.backend ? normalizeBackend(next.backend) : undefined, savedAt: new Date().toISOString() }
      store.write(session)
    },
    clear() { session = null; store.clear() },
  }
}
