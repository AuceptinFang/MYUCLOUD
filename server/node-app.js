import { fileURLToPath } from 'node:url'
import { createBackend } from './app.js'
import { JwglSessionStore } from './storage/jwgl-sessions.js'

export function createNodeBackend({ sessionFile = fileURLToPath(new URL('../.jwgl-sessions.local', import.meta.url)) } = {}) {
  let sessions
  return createBackend({ getSessionStore: () => sessions ||= new JwglSessionStore(sessionFile) })
}
