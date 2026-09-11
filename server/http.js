export class ApiError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : body.msg)
    this.status = status
    this.body = typeof body === 'string' ? { success: false, msg: body } : body
  }
}

export async function readJson(request) {
  try {
    const text = await request.text()
    const body = text ? JSON.parse(text) : {}
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid body')
    return body
  } catch {
    throw new ApiError(400, '请求体必须是 JSON 对象')
  }
}
