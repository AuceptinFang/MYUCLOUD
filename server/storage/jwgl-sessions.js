import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { resolve } from 'node:path'

export class JwglSessionStore extends Map {
  constructor(file = resolve('.jwgl-sessions.local')) {
    super()
    this.file = file
    try {
      for (const [id, session] of JSON.parse(readFileSync(file, 'utf8'))) {
        if (typeof id === 'string' && typeof session.cookies === 'string'
          && typeof session.username === 'string' && session.expiresAt > Date.now()) super.set(id, session)
      }
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('[jwgl] 无法恢复已保存的教务会话，需要重新登录')
    }
  }

  save() {
    const temporary = `${this.file}.tmp.local`
    writeFileSync(temporary, JSON.stringify([...this].filter(([, session]) => session.expiresAt > Date.now())), { mode: 0o600 })
    renameSync(temporary, this.file)
  }

  set(id, session) { super.set(id, session); this.save(); return this }
  delete(id) { const removed = super.delete(id); if (removed) this.save(); return removed }
  get(id) {
    const session = super.get(id)
    if (session && session.expiresAt <= Date.now()) { this.delete(id); return undefined }
    return session
  }
}
