import { Hono } from 'hono'
import { ApiError, readJson } from './http.js'
import { createJwglService } from './services/jwgl.js'
import { loginUcloud } from './services/ucloud.js'
import { createJwglRoutes } from './routes/jwgl.js'
import { mountProxyRoutes, PROXY_RULES } from './routes/proxy.js'

export function isBackendPath(path) {
  return ['/api', ...PROXY_RULES.map((rule) => rule.prefix)]
    .some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

export function createBackend({ getSessionStore }) {
  const app = new Hono()
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    await next()
  })
  app.post('/api/login', async (c) => c.json(await loginUcloud(await readJson(c.req.raw))))
  app.route('/api/jwgl', createJwglRoutes(createJwglService(getSessionStore)))
  mountProxyRoutes(app)
  app.notFound((c) => c.json({ success: false, msg: '接口不存在' }, 404))
  app.onError((error, c) => {
    if (error instanceof ApiError) return c.json(error.body, error.status)
    return c.json({ success: false, msg: error.message || '请求失败' }, error.status || 500)
  })
  return app
}
