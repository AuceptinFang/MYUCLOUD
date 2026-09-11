import { cors } from 'hono/cors'

export const DEFAULT_ALLOWED_ORIGINS = ['https://u.aucept.in', 'https://auceptinfang.github.io']

export function backendCors(origins = DEFAULT_ALLOWED_ORIGINS) {
  const values = typeof origins === 'string' ? origins.split(',') : origins
  const allowed = values.map((value) => value.trim()).filter(Boolean).map((value) => {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('CORS_ORIGINS 必须是 HTTP 或 HTTPS 来源地址，不包含路径或凭证')
    }
    return url.origin
  })
  return cors({
    origin: allowed,
    allowMethods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'Blade-Auth', 'Tenant-Id', 'Range'],
    exposeHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Disposition'],
    maxAge: 600,
  })
}
