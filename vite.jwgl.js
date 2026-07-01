const JWGL_BASE = 'https://jwgl.bupt.edu.cn'

function now() {
  return new Date().toISOString()
}

function log(label, data = {}) {
  console.log(`[jwgl] ${now()} ${label}`, data)
}

// ── port from Python auto_evalued ──────────────────────────────────────────

function encodeInp(value) {
  const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
  let output = ''
  let i = 0
  while (i < value.length) {
    const chr1 = value.charCodeAt(i++)
    const chr2 = i < value.length ? value.charCodeAt(i++) : null
    const chr3 = i < value.length ? value.charCodeAt(i++) : null

    const enc1 = chr1 >> 2
    const enc2 = ((chr1 & 3) << 4) | ((chr2 ?? 0) >> 4)
    const enc3 = (((chr2 ?? 0) & 15) << 2) | ((chr3 ?? 0) >> 6)
    const enc4 = (chr3 ?? 0) & 63

    let enc3val, enc4val
    if (chr2 === null) {
      enc3val = 64
      enc4val = 64
    } else if (chr3 === null) {
      enc3val = enc3
      enc4val = 64
    } else {
      enc3val = enc3
      enc4val = enc4
    }

    output += KEY[enc1] + KEY[enc2] + KEY[enc3val] + KEY[enc4val]
  }
  return output
}

function isLoginPage(html) {
  return (
    html.includes('/jsxsd/xk/LoginToXk') ||
    html.includes('id="userAccount"') ||
    html.includes("id='userAccount'") ||
    html.includes('<title>登录</title>')
  )
}

// ── HTML parsers (regex-based, matching Python behaviour) ──────────────────

function parseLinks(html, keyword) {
  const re = new RegExp(
    `<a\\b[^>]*href\\s*=\\s*["']([^"']*${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^"']*)["']`,
    'gi',
  )
  const links = []
  const seen = new Set()
  for (const match of html.matchAll(re)) {
    let href = match[1]
    // decode HTML entities
    href = href.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    if (!seen.has(href)) {
      seen.add(href)
      links.push(href)
    }
  }
  return links
}

function parseEvalForm(html) {
  // extract the Form1 block — look from <form id="Form1" to </form>
  const formRe = /<form\b[^>]*id\s*=\s*["']Form1["'][^>]*>/i
  const formStart = html.search(formRe)
  const formBlock = formStart >= 0 ? html.slice(formStart) : html
  const formEnd = formBlock.search(/<\/form\s*>/i)
  const formHtml = formEnd >= 0 ? formBlock.slice(0, formEnd) : formBlock

  // action
  const actionMatch = formHtml.match(/<form\b[^>]*action\s*=\s*["']([^"']*)["']/i)
  const action = actionMatch ? actionMatch[1].replace(/&amp;/g, '&') : '/jsxsd/xspj/xspj_save.do'

  // radio groups
  const radioGroups = {}
  const radioRe = /<input\b[^>]*type\s*=\s*["']radio["'][^>]*>/gi
  for (const tag of formHtml.matchAll(radioRe)) {
    const nameMatch = tag[0].match(/name\s*=\s*["']([^"']*)["']/i)
    const valueMatch = tag[0].match(/value\s*=\s*["']([^"']*)["']/i)
    if (nameMatch) {
      const name = nameMatch[1]
      const value = valueMatch ? valueMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : ''
      ;(radioGroups[name] ??= []).push(value)
    }
  }

  // checkboxes
  const checkboxes = {}
  const cbRe = /<input\b[^>]*type\s*=\s*["']checkbox["'][^>]*>/gi
  for (const tag of formHtml.matchAll(cbRe)) {
    const nameMatch = tag[0].match(/name\s*=\s*["']([^"']*)["']/i)
    const valueMatch = tag[0].match(/value\s*=\s*["']([^"']*)["']/i)
    if (nameMatch) {
      const name = nameMatch[1]
      const value = valueMatch ? valueMatch[1].replace(/&amp;/g, '&') : ''
      ;(checkboxes[name] ??= []).push(value)
    }
  }

  // textareas
  const textareas = []
  const taRe = /<textarea\b[^>]*name\s*=\s*["']([^"']*)["'][^>]*>/gi
  for (const match of formHtml.matchAll(taRe)) {
    textareas.push(match[1])
  }

  // all other inputs (hidden, text, anything not radio/checkbox)
  const fields = []
  const inputRe = /<input\b[^>]*>/gi
  for (const tag of formHtml.matchAll(inputRe)) {
    const typeMatch = tag[0].match(/type\s*=\s*["'](\w+)["']/i)
    const type = (typeMatch ? typeMatch[1] : 'text').toLowerCase()
    if (type === 'radio' || type === 'checkbox') continue

    const nameMatch = tag[0].match(/name\s*=\s*["']([^"']*)["']/i)
    if (!nameMatch) continue
    const name = nameMatch[1]
    const valueMatch = tag[0].match(/value\s*=\s*["']([^"']*)["']/i)
    const value = valueMatch ? valueMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"') : ''
    fields.push([name, value])
  }

  return { action, fields, radioGroups, checkboxes, textareas }
}

function parseText(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── radio choice logic ─────────────────────────────────────────────────────

function chooseRadioFields(radioGroups, degree) {
  const names = Object.keys(radioGroups).filter((n) => n.startsWith('pj0601id_'))
  const result = []
  for (let idx = 0; idx < names.length; idx++) {
    const values = radioGroups[names[idx]]
    let choice = Math.max(0, Math.min(degree - 1, values.length - 1))
    if (names.length > 1 && idx === names.length - 1) {
      // shift last question by one to avoid all-identical answers
      choice = choice === 0 && values.length > 1 ? 1 : Math.max(0, choice - 1)
    }
    result.push([names[idx], values[choice]])
  }
  return result
}

// ── session store ──────────────────────────────────────────────────────────

const sessions = new Map() // sessionId -> { cookies, username, createdAt }

function makeSessionId() {
  return crypto.randomUUID()
}

function getSession(id) {
  const s = sessions.get(id)
  if (!s) return null
  return s
}

// ── HTTP helpers ───────────────────────────────────────────────────────────

function buildHeaders(cookies, extra = {}) {
  const h = { 'User-Agent': 'Mozilla/5.0', ...extra }
  if (cookies && cookies.trim()) {
    h.Cookie = cookies
  }
  return h
}

function parseSetCookies(resp) {
  // Node.js fetch: getSetCookie() returns an array, one per Set-Cookie header
  if (typeof resp.headers.getSetCookie === 'function') {
    const arr = resp.headers.getSetCookie()
    if (arr.length > 0) {
      return arr.filter(Boolean).map(c => c.split(';')[0]).join('; ')
    }
  }
  // fallback: single get() returns comma-joined value
  const raw = resp.headers.get('set-cookie') || ''
  if (!raw) return ''
  return raw.split(',').map(s => s.trim().split(';')[0]).filter(Boolean).join('; ')
}

async function jwglGet(path, cookies, referer) {
  const url = JWGL_BASE + path
  const headers = buildHeaders(cookies, referer ? { Referer: referer } : {})
  log('jwgl:get', { url, hasCookies: Boolean(cookies && cookies.trim()), hasReferer: Boolean(referer) })
  const resp = await fetch(url, { headers })
  const body = await resp.text()
  const newCookies = parseSetCookies(resp)
  const resultCookies = newCookies || cookies || ''
  log('jwgl:get:done', { status: resp.status, url: resp.url, bodyLen: body.length, cookies: resultCookies })
  return { status: resp.status, body, cookies: resultCookies }
}

async function jwglPost(path, data, cookies, referer) {
  const url = JWGL_BASE + path
  const headers = buildHeaders(cookies, {
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: JWGL_BASE,
    Referer: referer || JWGL_BASE + '/jsxsd/',
  })
  const body = new URLSearchParams(data).toString()
  log('jwgl:post', { url, fields: Object.keys(data), hasCookies: Boolean(cookies && cookies.trim()) })
  const resp = await fetch(url, { method: 'POST', headers, body })
  const respBody = await resp.text()
  const newCookies = parseSetCookies(resp)
  const resultCookies = newCookies || cookies || ''
  log('jwgl:post:done', { status: resp.status, url: resp.url, bodyLen: respBody.length, cookies: resultCookies })
  return { status: resp.status, body: respBody, cookies: resultCookies }
}

// ── course list fetcher ────────────────────────────────────────────────────

function parseCourseList(listHtml) {
  // Parse <th> headers to find column indices
  const headMatch = listHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead\s*>/i) || ['']
  const thead = headMatch[1] || ''
  const thCells = []
  const thRe = /<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi
  for (const m of thead.matchAll(thRe)) {
    thCells.push(m[1].replace(/<[^>]+>/g, '').trim())
  }
  // fallback: look for first tr with th
  if (thCells.length === 0) {
    const firstThRow = listHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/i)
    if (firstThRow) {
      for (const m of firstThRow[1].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th\s*>/gi)) {
        thCells.push(m[1].replace(/<[^>]+>/g, '').trim())
      }
    }
  }
  // default column map
  const colIdx = {
    xh: thCells.findIndex(c => c.includes('序号')),
    code: thCells.findIndex(c => c.includes('课程编号') || c.includes('课程代码')),
    name: thCells.findIndex(c => c.includes('课程名称')),
    teacher: thCells.findIndex(c => c.includes('教师') || c.includes('任课教师') || c.includes('授课教师')),
  }

  // Parse data rows
  const courses = []
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi
  for (const m of listHtml.matchAll(trRe)) {
    const rowHtml = m[1]
    // skip header rows
    if (/<th\b/i.test(rowHtml)) continue
    // must contain an edit link
    const hrefMatch = rowHtml.match(/href\s*=\s*["']([^"']*xspj_edit\.do[^"']*)["']/i)
    if (!hrefMatch) continue
    const editLink = hrefMatch[1].replace(/&amp;/g, '&')

    const cells = []
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi
    for (const td of rowHtml.matchAll(tdRe)) {
      cells.push(td[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim())
    }

    const courseName = colIdx.name >= 0 ? (cells[colIdx.name] || '') : (cells[2] || '')
    const teacherName = colIdx.teacher >= 0 ? (cells[colIdx.teacher] || '') : ''

    courses.push({ editLink, courseName, teacherName })
  }

  log('courses:parse', { headers: thCells, colIdx, parsedN: courses.length, first: courses[0] })
  return courses
}

async function fetchCourses(cookies) {
  const findResp = await jwglGet('/jsxsd/xspj/xspj_find.do', cookies)
  const batchLinks = parseLinks(findResp.body, '/jsxsd/xspj/xspj_list.do')
  if (batchLinks.length === 0) return []

  // All batch pages return the same course list. Just parse the first one.
  const firstBatch = batchLinks[0]
  const listResp = await jwglGet(firstBatch, cookies, JWGL_BASE + '/jsxsd/xspj/xspj_find.do')
  const allCourses = parseCourseList(listResp.body).map(c => ({
    ...c,
    batchIndex: 0,
    batchLink: firstBatch,
  }))

  log('courses:result', { total: allCourses.length, sample: allCourses.slice(0, 2).map(c => ({ name: c.courseName, teacher: c.teacherName })) })
  return allCourses
}

// ── evaluation runner (async generator) ────────────────────────────────────

async function* runEvaluation(cookies, degree, comment, doSubmit, selectedEditLinks) {
  const findResp = await jwglGet('/jsxsd/xspj/xspj_find.do', cookies)
  const batchLinks = parseLinks(findResp.body, '/jsxsd/xspj/xspj_list.do')

  if (batchLinks.length === 0) {
    yield { type: 'done', totalSaved: 0, totalBatches: 0, message: '没有找到评教批次' }
    return
  }

  // build full course list, then filter if needed
  let allCourses = []
  for (const batchLink of batchLinks) {
    const listResp = await jwglGet(batchLink, cookies, JWGL_BASE + '/jsxsd/xspj/xspj_find.do')
    const editLinks = parseLinks(listResp.body, '/jsxsd/xspj/xspj_edit.do')
    allCourses.push({ batchLink, editLinks, listBody: listResp.body })
  }

  // filter to selected courses
  const selectedSet = selectedEditLinks ? new Set(selectedEditLinks) : null
  if (selectedSet) {
    allCourses = allCourses
      .map(({ batchLink, editLinks, listBody }) => ({
        batchLink,
        listBody,
        editLinks: editLinks.filter((link) => selectedSet.has(link)),
      }))
      .filter(({ editLinks }) => editLinks.length > 0)
  }

  const totalCourses = allCourses.reduce((sum, c) => sum + c.editLinks.length, 0)
  if (totalCourses === 0) {
    yield { type: 'done', totalSaved: 0, totalBatches: allCourses.length, message: '没有选中的课程' }
    return
  }

  let totalSaved = 0
  let courseIndex = 0

  for (let bi = 0; bi < allCourses.length; bi++) {
    const { batchLink, editLinks, listBody } = allCourses[bi]

    yield {
      type: 'step',
      step: 'courses',
      batch: bi + 1,
      totalBatches: allCourses.length,
      message: `批次：共 ${editLinks.length} 门课程`,
    }

    for (const editLink of editLinks) {
      courseIndex++
      yield {
        type: 'course',
        courseIndex,
        totalCourses,
        message: `正在评价课程 ${courseIndex}/${totalCourses}`,
      }

      try {
        const editResp = await jwglGet(
          editLink,
          cookies,
          JWGL_BASE + '/jsxsd/xspj/xspj_find.do',
        )
        const form = parseEvalForm(editResp.body)

        // build submission data
        const data = new URLSearchParams()

        // all non-radio/checkbox fields
        for (const [name, value] of form.fields) {
          if (name === 'issubmit') {
            data.append(name, '0')
          } else if (name === 'sfxyt') {
            data.append(name, '0')
          } else if (name === 'sava') {
            data.append(name, '0')
          } else {
            data.append(name, value)
          }
        }

        // radio choices
        for (const [name, value] of chooseRadioFields(form.radioGroups, degree)) {
          data.append(name, value)
        }

        // positive comments (first 3)
        const positiveComments = (form.checkboxes['zgpyids'] || []).slice(0, 3)
        for (const value of positiveComments) {
          data.append('zgpyids', value)
        }

        // textareas
        for (const name of form.textareas) {
          data.append(name, comment)
        }

        // POST save
        const saveUrl = form.action || '/jsxsd/xspj/xspj_save.do'
        await jwglPost(saveUrl, Object.fromEntries(data), cookies, JWGL_BASE + editLink)
        totalSaved++
      } catch (err) {
        log('evaluate:course:error', { courseIndex, error: err.message })
        yield {
          type: 'course-error',
          courseIndex,
          message: `课程 ${courseIndex} 保存失败: ${err.message}`,
        }
      }
    }

    // submit batch if requested
    if (doSubmit && editLinks.length > 0) {
      yield { type: 'step', step: 'submit', message: `正在统一提交批次 ${bi + 1}…` }

      try {
        // refresh list page to get latest form data
        const refreshedResp = await jwglGet(batchLink, cookies, JWGL_BASE + '/jsxsd/xspj/xspj_find.do')
        const listForm = parseEvalForm(refreshedResp.body)

        let pj01id = ''
        for (const [name, value] of listForm.fields) {
          if (name === 'pj01id' && value) {
            pj01id = value
            break
          }
        }

        if (pj01id) {
          const submitData = Object.fromEntries(listForm.fields)
          await jwglPost(
            `/jsxsd/xspj/xspj_yjtj.do?pj01id=${encodeURIComponent(pj01id)}`,
            submitData,
            cookies,
            JWGL_BASE + batchLink,
          )
          yield { type: 'step', step: 'submitted', message: `批次 ${bi + 1} 已提交` }
        } else {
          yield { type: 'step', step: 'submit-skip', message: `批次 ${bi + 1} 未找到 pj01id，跳过提交` }
        }
      } catch (err) {
        log('evaluate:submit:error', { batch: bi + 1, error: err.message })
        yield { type: 'step', step: 'submit-error', message: `批次 ${bi + 1} 提交失败: ${err.message}` }
      }
    }
  }

  const msg = doSubmit
    ? `评价完成：共评价并提交 ${totalSaved} 门课程，${allCourses.length} 个批次`
    : `评价完成：共保存 ${totalSaved} 门课程评价，请手动登录教务系统提交`

  yield { type: 'done', totalSaved, totalBatches: allCourses.length, message: msg }
}

// ── request body parser ────────────────────────────────────────────────────

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
    })
    req.on('end', () => {
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body, null, 2))
}

// ── middleware handlers ────────────────────────────────────────────────────

async function handleLogin(req, res) {
  try {
    const body = await readRequestBody(req)
    const { username = '', password = '' } = body

    if (!username || !password) {
      sendJson(res, 400, { success: false, msg: '学号和密码不能为空' })
      return
    }

    // step 1: GET /jsxsd/ — grab initial cookies
    const r1 = await fetch(JWGL_BASE + '/jsxsd/', { headers: { 'User-Agent': 'Mozilla/5.0' } })
    const cookies = parseSetCookies(r1)

    // step 2: POST LoginToXk
    const encoded = encodeInp(username) + '%%%' + encodeInp(password)
    const r2Body = new URLSearchParams({ userAccount: username, userPassword: '', encoded }).toString()
    const r2 = await fetch(JWGL_BASE + '/jsxsd/xk/LoginToXk', {
      method: 'POST',
      headers: buildHeaders(cookies, {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: JWGL_BASE,
        Referer: JWGL_BASE + '/jsxsd/',
      }),
      body: r2Body,
    })
    const cookies2 = parseSetCookies(r2) || cookies

    // step 3: verify by fetching find.do
    const r3 = await fetch(JWGL_BASE + '/jsxsd/xspj/xspj_find.do', {
      headers: buildHeaders(cookies2, { Referer: JWGL_BASE + '/jsxsd/' }),
    })
    const r3Body = await r3.text()

    if (isLoginPage(r3Body)) {
      const text = parseText(r3Body)
      const hints = ['用户名', '密码', '验证码', '错误', '失败'].filter((h) => text.includes(h))
      sendJson(res, 401, { success: false, msg: '登录失败: ' + hints.join('/') })
      return
    }

    const sessionId = makeSessionId()
    sessions.set(sessionId, { cookies: cookies2, username, createdAt: Date.now() })
    log('login:done', { username, sessionId })
    sendJson(res, 200, { success: true, sessionId })
  } catch (error) {
    log('handleLogin:error', { message: error.message })
    sendJson(res, 500, { success: false, msg: error.message || '登录失败' })
  }
}

async function handleEvaluate(req, res) {
  try {
    const body = await readRequestBody(req)
    const { sessionId, degree, comment = '', submit = false, selectedCourses } = body

    if (!sessionId) {
      sendJson(res, 400, { success: false, msg: '缺少 sessionId' })
      return
    }

    const session = getSession(sessionId)
    if (!session) {
      sendJson(res, 401, { success: false, msg: '会话已过期，请重新登录' })
      return
    }

    const degreeNum = Number(degree)
    if (!Number.isFinite(degreeNum) || degreeNum < 1 || degreeNum > 5) {
      sendJson(res, 400, { success: false, msg: '评分必须在 1-5 之间' })
      return
    }

    log('handleEvaluate:start', { sessionId, degree: degreeNum, hasComment: Boolean(comment), submit, selectedN: selectedCourses?.length })

    // SSE headers
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    try {
      for await (const event of runEvaluation(session.cookies, degreeNum, comment, submit, selectedCourses)) {
        res.write('data: ' + JSON.stringify(event) + '\n\n')
      }
    } catch (err) {
      log('handleEvaluate:stream:error', { message: err.message })
      res.write('data: ' + JSON.stringify({ type: 'error', message: err.message }) + '\n\n')
    }

    res.end()
  } catch (error) {
    log('handleEvaluate:error', { message: error.message, stack: error.stack })
    // if headers haven't been sent yet (e.g. invalid JSON body)
    if (!res.headersSent) {
      sendJson(res, 500, { success: false, msg: error.message || '评教失败' })
    } else {
      res.write('data: ' + JSON.stringify({ type: 'error', message: error.message }) + '\n\n')
      res.end()
    }
  }
}

// ── plugin export ──────────────────────────────────────────────────────────

export function jwglPlugin() {
  return {
    name: 'mock-jwgl',
    configureServer(server) {
      server.middlewares.use('/api/jwgl/login', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        handleLogin(req, res)
      })

      server.middlewares.use('/api/jwgl/courses', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return }
        try {
          const body = await readRequestBody(req)
          const { sessionId } = body
          if (!sessionId) { sendJson(res, 400, { success: false, msg: '缺少 sessionId' }); return }
          const session = getSession(sessionId)
          if (!session) { sendJson(res, 401, { success: false, msg: '会话已过期' }); return }
          const courses = await fetchCourses(session.cookies)
          sendJson(res, 200, { success: true, courses })
        } catch (e) {
          log('courses:error', { message: e.message })
          sendJson(res, 500, { success: false, msg: e.message })
        }
      })

      server.middlewares.use('/api/jwgl/evaluate', (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }
        handleEvaluate(req, res)
      })
    },
  }
}
