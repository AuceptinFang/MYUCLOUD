import { BACKEND_ORIGIN, PREVIEW_MESSAGE, STATIC_PREVIEW, backendUrl } from '../utils/runtime.js'

const NETWORK_MESSAGE = '暂时无法连接服务，请稍后重试。'
const INVALID_RESPONSE_MESSAGE = '服务响应异常，请稍后重试。'
const backendHostname = BACKEND_ORIGIN ? new URL(BACKEND_ORIGIN).hostname : ''

function publicMessage(message, fallback) {
  if (typeof message !== 'string' || !message || /https?:\/\//i.test(message)
    || (backendHostname && message.includes(backendHostname))) return fallback
  return message
}

export function friendlyError(error, fallback = '操作失败，请稍后重试。') {
  if (error?.name === 'TimeoutError') return '请求超时，请稍后重试。'
  if (error?.name === 'AbortError') return '请求已中断，请稍后重试。'
  if (error instanceof TypeError) return NETWORK_MESSAGE
  if (error instanceof SyntaxError) return INVALID_RESPONSE_MESSAGE
  return publicMessage(error?.message, fallback)
}

export function responseErrorMessage(response, body, label = '请求') {
  if (response.status === 404 || response.status === 405 || response.status >= 500) return '服务暂不可用，请稍后重试。'
  if (typeof body?.msg === 'string' && body.msg && !/^(fetch failed|failed to fetch|networkerror|unexpected token|unexpected end)/i.test(body.msg)) return publicMessage(body.msg, `${label}失败，请稍后重试。`)
  if (response.status === 401) return '登录已失效，请重新登录。'
  if (response.status === 403) return '没有访问权限，请确认登录账号。'
  return `${label}失败，请稍后重试。`
}

export async function fetchBackend(url, options = {}, { timeoutMs = 30000, streaming = false } = {}) {
  if (STATIC_PREVIEW) throw new Error(PREVIEW_MESSAGE)
  const headersTimeout = new AbortController()
  const timeout = streaming ? headersTimeout.signal : AbortSignal.timeout(timeoutMs)
  // 流式响应只限制等待响应头的时间，已开始的评教和下载可持续传输。
  const timer = streaming ? setTimeout(() => headersTimeout.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs) : null
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
  try {
    return await fetch(backendUrl(url), { ...options, signal })
  } catch (error) {
    if (options.signal?.aborted) throw error
    throw new Error(friendlyError(timeout.aborted ? timeout.reason : error), { cause: error })
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}

export async function readBackendPayload(response, { allowText = false } = {}) {
  let rawText
  try { rawText = await response.text() } catch (error) {
    if (error?.name === 'AbortError') throw new DOMException(friendlyError(error), 'AbortError')
    throw new Error(friendlyError(error), { cause: error })
  }
  if (!allowText && (response.status === 404 || response.status === 405)) {
    throw new Error(responseErrorMessage(response))
  }
  try {
    const body = JSON.parse(rawText)
    if (!allowText && (!body || typeof body !== 'object')) throw new Error('invalid payload')
    return { rawText, body }
  } catch {
    if (allowText) return { rawText, body: rawText || null }
    throw new Error(response.status >= 500 ? responseErrorMessage(response) : INVALID_RESPONSE_MESSAGE)
  }
}

export async function readBackendJson(response) {
  return (await readBackendPayload(response)).body
}
