export function normalizeBackendOrigin(value = '') {
  if (!value.trim()) return ''
  let url
  try { url = new URL(value) } catch { throw new Error('后端地址必须是完整的 HTTP 或 HTTPS 地址') }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('后端地址必须是 HTTP 或 HTTPS 来源地址，不包含路径、查询参数或凭证')
  }
  return url.origin
}

export function resolveBackendUrl(path, origin = '') {
  if (!origin || typeof path !== 'string' || !/^\/(api|ucloud|file|jwgl|office)(?:\/|[?#]|$)/.test(path)) return path
  return `${normalizeBackendOrigin(origin)}${path}`
}
