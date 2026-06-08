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

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''

    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
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

function sendJson(res, status, body) {
  const text = JSON.stringify(body, null, 2)

  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(text)
}

async function casLogin(username, password) {
  const loginUrl = `https://auth.bupt.edu.cn/authserver/login?service=${encodeURIComponent(
    SERVICE_URL,
  )}`

  serverLog('cas:get:start', { loginUrl, service: SERVICE_URL })
  const loginPage = await fetch(loginUrl, { redirect: 'manual' })
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

  const casResponse = await fetch(loginUrl, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Cookie: cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0',
    },
    body: form,
  })

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

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: OAUTH_AUTHORIZATION,
      'Tenant-Id': TENANT_ID,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
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

  const response = await fetch(INFO_URL, {
    headers: {
      Authorization: BUSINESS_AUTHORIZATION,
      'Tenant-Id': TENANT_ID,
      'Blade-Auth': accessToken,
    },
  })
  const result = await readRemoteResponse(response)

  serverLog('ucloud:info:done', {
    status: result.status,
    ok: result.ok,
    body: redactSensitive(result.body),
  })

  return result
}

async function handleLogin(req, res) {
  try {
    const { username = '', password = '' } = await readRequestBody(req)

    if (!username || !password) {
      sendJson(res, 400, {
        success: false,
        msg: 'username and password are required',
      })
      return
    }

    serverLog('login:start', {
      username,
      password: {
        present: true,
        length: password.length,
      },
    })

    const cas = await casLogin(username, password)
    if (!cas.post.ticket) {
      sendJson(res, 401, {
        success: false,
        stage: 'cas-login',
        msg: cas.post.error || 'CAS login did not return ticket',
        cas,
      })
      return
    }

    const tokenResponse = await exchangeToken(cas.post.ticket)
    const accessToken = tokenResponse.body?.access_token || ''

    if (!tokenResponse.ok || !accessToken) {
      sendJson(res, tokenResponse.status || 502, {
        success: false,
        stage: 'oauth-token',
        msg: tokenResponse.body?.error_description || tokenResponse.body?.msg || 'token exchange failed',
        cas,
        tokenResponse,
      })
      return
    }

    const userInfo = await getUserInfo(accessToken)

    sendJson(res, 200, {
      success: true,
      token: accessToken,
      access_token: accessToken,
      refresh_token: tokenResponse.body?.refresh_token || '',
      tokenResponse,
      userInfo,
      cas,
      authHeaders: {
        'Blade-Auth': accessToken,
        Authorization: BUSINESS_AUTHORIZATION,
        'Tenant-Id': TENANT_ID,
      },
    })
  } catch (error) {
    serverLog('login:error', {
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    })
    sendJson(res, 500, {
      success: false,
      msg: error?.message || 'login failed',
    })
  }
}

export function ucloudAuthPlugin() {
  return {
    name: 'mock-ucloud-auth',
    configureServer(server) {
      server.middlewares.use('/api/login', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        handleLogin(req, res)
      })
    },
  }
}
