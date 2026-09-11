import { BACKEND_ORIGIN, PREVIEW_MESSAGE, STATIC_PREVIEW, backendUrl } from '../utils/runtime.js'

const NETWORK_MESSAGE = BACKEND_ORIGIN
  ? `无法连接后端 ${BACKEND_ORIGIN}，请检查网络或稍后重试。`
  : '无法连接服务，请检查网络，并确认本地后端已启动。'
const INVALID_RESPONSE_MESSAGE = '服务未返回有效数据，请确认后端地址正确，或稍后重试。'

export function friendlyError(error, fallback = '操作失败，请稍后重试。') {
  if (error?.name === 'TimeoutError') return '请求超时，请稍后重试。'
  if (error?.name === 'AbortError') return '请求已中断，请稍后重试。'
  if (error instanceof TypeError) return NETWORK_MESSAGE
  if (error instanceof SyntaxError) return INVALID_RESPONSE_MESSAGE
  return error?.message || fallback
}

export function responseErrorMessage(response, body, label = '请求') {
  if (response.status === 404 || response.status === 405) return '后端接口不可用，请确认服务已启动且地址正确。'
  if (typeof body?.msg === 'string' && body.msg && !/^(fetch failed|failed to fetch|networkerror|unexpected token|unexpected end)/i.test(body.msg)) return body.msg
  if (response.status >= 500) return '后端服务暂不可用，请稍后重试。'
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
