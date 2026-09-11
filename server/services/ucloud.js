import { ApiError } from '../http.js'

const SERVICE_URL = 'https://ucloud.bupt.edu.cn'
const API_BASE_URL = 'https://apiucloud.bupt.edu.cn'
const TOKEN_URL = `${API_BASE_URL}/ykt-basics/oauth/token`
const INFO_URL = `${API_BASE_URL}/ykt-basics/info`
const OAUTH_AUTHORIZATION = 'Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ='
const BUSINESS_AUTHORIZATION = 'Basic c3dvcmQ6c3dvcmRfc2VjcmV0'
const TENANT_ID = '000000'

function now() {
  return new Date().toISOString()
}

function serverLog(label, data = {}) {
  console.log(`[ucloud-auth] ${now()} ${label}`, data)
}

function describeError(error) {
  const cause = error?.cause || {}

  return {
    name: error?.name || 'Error',
    message: error?.message || 'unknown error',
    code: cause.code || error?.code || '',
    errno: cause.errno ?? error?.errno ?? '',
    syscall: cause.syscall || error?.syscall || '',
    hostname: cause.hostname || error?.upstream || '',
    upstream: error?.upstream || '',
  }
}

async function fetchUpstream(url, options, stage) {
  try {
    return await fetch(url, options)
  } catch (error) {
    error.stage = stage
    error.upstream = new URL(url).hostname
    throw error
  }
}

function redact(value) {
  if (typeof value !== 'string') return value

  return {
    length: value.length,
    prefix: value.slice(0, 10),
    suffix: value.slice(-10),
  }
}

function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      /password|ticket|token/i.test(key) ? redact(item) : redactSensitive(item),
    ]),
  )
}

function getCookies(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers
      .getSetCookie()
      .map((cookie) => cookie.split(';')[0])
      .join('; ')
  }

  return (headers.get('set-cookie') || '').split(';')[0]
}

function readResponseBody(text) {
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function readRemoteResponse(response) {
  const rawText = await response.text()

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    redirected: response.redirected,
    headers: Object.fromEntries(response.headers.entries()),
    rawText,
    body: readResponseBody(rawText),
  }
}

function pickInputValue(html, name) {
  const input = html.match(new RegExp(`<input[^>]*name=["'\\s]*${name}["']?[^>]*>`, 'i'))?.[0] || ''

  return input.match(/value="([^"]*)"/i)?.[1] || ''
}

function pickCasError(html) {
  return (
    html
      .match(/<p[^>]*>(.*?)<\/p>/i)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .trim() || ''
  )
}

async function casLogin(username, password) {
  const loginUrl = `https://auth.bupt.edu.cn/authserver/login?service=${encodeURIComponent(
    SERVICE_URL,
  )}`

  serverLog('cas:get:start', { loginUrl, service: SERVICE_URL })
  const loginPage = await fetchUpstream(loginUrl, { redirect: 'manual' }, 'cas-get')
  const cookies = getCookies(loginPage.headers)
  const loginHtml = await loginPage.text()
  const execution = pickInputValue(loginHtml, 'execution')

  serverLog('cas:get:done', {
    status: loginPage.status,
    hasCookies: Boolean(cookies),
    hasExecution: Boolean(execution),
  })

  const form = new URLSearchParams({
    username,
    password,
    type: pickInputValue(loginHtml, 'type') || 'username_password',
    execution,
    _eventId: pickInputValue(loginHtml, '_eventId') || 'submit',
    submit: 'LOGIN',
  })

  serverLog('cas:post:start', {
    username,
    password: {
      present: Boolean(password),
      length: password.length,
    },
    fields: {
      type: form.get('type'),
      hasExecution: Boolean(form.get('execution')),
      eventId: form.get('_eventId'),
      submit: form.get('submit'),
    },
  })

  const casResponse = await fetchUpstream(loginUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: form,
  }, 'cas-post')

  const location = casResponse.headers.get('location') || ''
  const ticket = location ? new URL(location).searchParams.get('ticket') || '' : ''
  const errorHtml = location ? '' : await casResponse.text()
  const error = pickCasError(errorHtml)

  serverLog('cas:post:done', {
    status: casResponse.status,
    hasTicket: Boolean(ticket),
    location: location ? redact(location) : '',
    error,
  })

  return {
    loginUrl,
    get: {
      status: loginPage.status,
      hasCookies: Boolean(cookies),
      hasExecution: Boolean(execution),
    },
    post: {
      status: casResponse.status,
      location,
      ticket,
      error,
    },
  }
}

async function exchangeToken(ticket) {
  const body = new URLSearchParams({
    ticket,
    grant_type: 'third',
  })

  serverLog('oauth:token:start', {
    url: TOKEN_URL,
    grant_type: 'third',
    ticket: redact(ticket),
  })

  const response = await fetchUpstream(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: OAUTH_AUTHORIZATION,
      'Tenant-Id': TENANT_ID,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  }, 'oauth-token')
  const result = await readRemoteResponse(response)

  serverLog('oauth:token:done', {
    status: result.status,
    ok: result.ok,
    body: redactSensitive(result.body),
  })

  return result
}

async function getUserInfo(accessToken) {
  serverLog('ucloud:info:start', {
    url: INFO_URL,
    accessToken: redact(accessToken),
  })

  const response = await fetchUpstream(INFO_URL, {
    headers: {
      Authorization: BUSINESS_AUTHORIZATION,
      'Tenant-Id': TENANT_ID,
      'Blade-Auth': accessToken,
    },
  }, 'user-info')
  const result = await readRemoteResponse(response)

  serverLog('ucloud:info:done', {
    status: result.status,
    ok: result.ok,
    body: redactSensitive(result.body),
  })

  return result
}

export async function loginUcloud({ username = '', password = '' }) {
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    throw new ApiError(400, 'username and password are required')
  }
  try {
    const cas = await casLogin(username, password)
    if (!cas.post.ticket) {
      throw new ApiError(401, {
        success: false, stage: 'cas-login',
        msg: cas.post.error || 'CAS login did not return ticket', cas,
      })
    }
    const tokenResponse = await exchangeToken(cas.post.ticket)
    const accessToken = tokenResponse.body?.access_token || ''
    if (!tokenResponse.ok || !accessToken) {
      throw new ApiError(tokenResponse.status || 502, {
        success: false, stage: 'oauth-token',
        msg: tokenResponse.body?.error_description || tokenResponse.body?.msg || 'token exchange failed',
        cas, tokenResponse,
      })
    }
    const userInfo = await getUserInfo(accessToken)
    return {
      success: true, token: accessToken, access_token: accessToken,
      refresh_token: tokenResponse.body?.refresh_token || '',
      tokenResponse, userInfo, cas,
      authHeaders: {
        'Blade-Auth': accessToken, Authorization: BUSINESS_AUTHORIZATION, 'Tenant-Id': TENANT_ID,
      },
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    const detail = describeError(error)
    serverLog('login:error', { ...detail, stage: error?.stage || 'server' })
    throw new ApiError(500, {
      success: false, stage: error?.stage || 'server',
      msg: detail.hostname ? `无法连接上游服务 ${detail.hostname}` : error?.message || 'login failed',
      error: detail,
    })
  }
}
