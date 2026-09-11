import { serve } from '@hono/node-server'
import { createNodeBackend } from '../node-app.js'

const app = createNodeBackend()
const server = serve({ fetch: app.fetch, hostname: process.env.HOST || '127.0.0.1', port: Number(process.env.PORT || 8787) }, (info) => {
  console.log(`MYUCLOUD API listening on port ${info.port}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close())
}
