import { getRequestListener } from '@hono/node-server'
import { isBackendPath } from './server/app.js'
import { createNodeBackend } from './server/node-app.js'

export function backendPlugin() {
  function configure(server) {
    server.middlewares.use(createBackendMiddleware())
  }
  return { name: 'myucloud-backend', configureServer: configure, configurePreviewServer: configure }
}

export function createBackendMiddleware(app = createNodeBackend()) {
  const listener = getRequestListener(app.fetch)
  return (req, res, next) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (isBackendPath(path)) return listener(req, res)
    next()
  }
}
