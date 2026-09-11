import { proxy } from 'hono/proxy'
import { ApiError } from '../http.js'

export const PROXY_RULES = [
  { prefix: '/ucloud', origin: 'https://apiucloud.bupt.edu.cn' },
  { prefix: '/file', origin: 'https://fileucloud.bupt.edu.cn', source: 'https://ucloud.bupt.edu.cn', anonymous: true },
  { prefix: '/jwgl', origin: 'https://jwgl.bupt.edu.cn', source: 'https://jwgl.bupt.edu.cn' },
  { prefix: '/office', origin: 'https://ucloud.bupt.edu.cn', source: 'https://ucloud.bupt.edu.cn', anonymous: true, keepPrefix: true },
]

export function mountProxyRoutes(app) {
  for (const rule of PROXY_RULES) {
    const handler = async (c) => {
      const incoming = new URL(c.req.url)
      const target = new URL(rule.origin)
      target.pathname = rule.keepPrefix ? incoming.pathname : incoming.pathname.slice(rule.prefix.length) || '/'
      target.search = incoming.search
      const request = new Request(target, c.req.raw)
      request.headers.delete('host')
      if (rule.source) {
        request.headers.set('Origin', rule.source)
        request.headers.set('Referer', `${rule.source}/`)
      }
      if (rule.anonymous) {
        for (const name of ['Authorization', 'Blade-Auth', 'Tenant-Id']) request.headers.delete(name)
      }
      try {
        const response = await proxy(target, { raw: request, redirect: 'manual', strictConnectionProcessing: true })
        // 学校的 CORS 规则由本后端面向前端的规则替换。
        for (const name of [...response.headers.keys()]) {
          if (name.startsWith('access-control-')) response.headers.delete(name)
        }
        return response
      } catch (error) {
        if (error.status) throw error
        throw new ApiError(502, `无法连接上游服务 ${target.hostname}`)
      }
    }
    app.all(rule.prefix, handler)
    app.all(`${rule.prefix}/*`, handler)
  }
}
