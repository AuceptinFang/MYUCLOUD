import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { readJson } from '../http.js'

export function createJwglRoutes(service) {
  const routes = new Hono()
  for (const action of ['login', 'courses', 'timetable', 'session', 'logout']) {
    routes.post(`/${action}`, async (c) => c.json(await service[action](await readJson(c.req.raw))))
  }
  for (const action of ['evaluate', 'submit']) {
    routes.post(`/${action}`, async (c) => {
      const controller = new AbortController()
      const signal = AbortSignal.any([controller.signal, c.req.raw.signal])
      const events = await service[action](await readJson(c.req.raw), signal)
      c.header('X-Accel-Buffering', 'no')
      return streamSSE(c, async (stream) => {
        stream.onAbort(() => controller.abort())
        try {
          for await (const event of events) {
            if (signal.aborted) break
            await stream.writeSSE({ data: JSON.stringify(event) })
          }
        } catch (error) {
          if (!signal.aborted) {
            await stream.writeSSE({ data: JSON.stringify({ type: 'error', message: error.message, code: error.status }) })
          }
        }
      })
    })
  }
  return routes
}
