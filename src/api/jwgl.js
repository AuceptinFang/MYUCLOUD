import { computed, ref } from 'vue'

export const JWGL_AUTH_KEY = 'mock-ucloud-jwgl-auth'
const credential = ref(null)
export const jwglAuthError = ref('')
export const jwglStorageWarning = ref('')

function restoreCredential() {
  try {
    const saved = JSON.parse(localStorage.getItem(JWGL_AUTH_KEY) || 'null')
    return saved && typeof saved.sessionId === 'string' && saved.sessionId
      && typeof saved.username === 'string' && saved.expiresAt > Date.now() ? saved : null
  } catch { return null }
}
credential.value = restoreCredential()
export const jwglSessionId = computed(() => credential.value?.sessionId || '')
export const jwglUsername = computed(() => credential.value?.username || '')
export const jwglLoggedIn = computed(() => Boolean(jwglSessionId.value))

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === JWGL_AUTH_KEY || event.key === null) credential.value = restoreCredential()
  })
}

function saveCredential(data) {
  if (typeof data.sessionId !== 'string' || !data.sessionId || typeof data.username !== 'string' || !(data.expiresAt > Date.now())) {
    throw new Error('教务登录未返回有效凭证，请重试')
  }
  credential.value = { sessionId: data.sessionId, username: data.username, expiresAt: data.expiresAt }
  jwglAuthError.value = ''
  jwglStorageWarning.value = ''
  try {
    localStorage.setItem(JWGL_AUTH_KEY, JSON.stringify(credential.value))
    localStorage.removeItem('jwgl_creds')
  } catch { jwglStorageWarning.value = '浏览器未能保存教务凭证，刷新页面后可能需要重新登录。' }
}

export function invalidateJwglSession(expectedId = jwglSessionId.value, message = '教务凭证已过期，请重新登录') {
  if (expectedId !== jwglSessionId.value) return
  credential.value = null
  jwglAuthError.value = message
  try { localStorage.removeItem(JWGL_AUTH_KEY) } catch { /* 当前页面仍退出 */ }
}

async function authRequest(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.msg || '教务登录失败')
  saveCredential(data)
  return data
}

export const loginJwgl = (username, password) => authRequest('/api/jwgl/login', { username, password })
export const restoreJwglToken = (sessionId) => authRequest('/api/jwgl/session', { sessionId })

export async function logoutJwgl() {
  const sessionId = jwglSessionId.value
  invalidateJwglSession(sessionId, '')
  if (sessionId) {
    try {
      await fetch('/api/jwgl/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) })
    } catch { /* 本地已退出，远程凭证仍受有效期限制 */ }
  }
}

export async function jwglFetch(path, body = {}, options = {}) {
  const sessionId = jwglSessionId.value
  if (!sessionId || credential.value.expiresAt <= Date.now()) {
    invalidateJwglSession(sessionId)
    throw new Error('请先登录教务系统')
  }
  const response = await fetch(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, sessionId }), signal: options.signal,
  })
  if (response.status === 401) {
    invalidateJwglSession(sessionId)
    throw new Error('教务凭证已过期，请重新登录')
  }
  return response
}

export async function jwglRequest(path, body, options) {
  const response = await jwglFetch(path, body, options)
  const data = await response.json()
  if (!response.ok || !data.success) throw new Error(data.msg || `请求失败 HTTP ${response.status}`)
  return data
}
