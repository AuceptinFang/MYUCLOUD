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
// ── 精准控分评价逻辑 (基于 20%评课, 30%评教, 50%自评 结构) ──────────────────────────

function generatePreciseEvaluation(form, targetScore) {
  // targetScore: 你想要给出的具体分数 (例如: 85, 92, 78)，范围 0-100
  const radioNames = Object.keys(form.radioGroups).filter((n) => n.startsWith('pj0601id_'))
  const result = []

  // 选项对应的基准分数：完全符合=100, 基本符合=80, 不确定=60, 基本不符合=40, 完全不符合=20
  const optionScores = [100, 80, 60, 40, 20]
  
  // 12 道题的权重分布
  const weights = [
    0.05, 0.05, 0.05, 0.05,          // 评课 (4题 x 5% = 20%)
    0.075, 0.075, 0.075, 0.075,      // 评教 (4题 x 7.5% = 30%)
    0.125, 0.125, 0.125, 0.125       // 自评 (4题 x 12.5% = 50%)
  ]

  // 核心：使用随机采样寻找最优解 (蒙特卡洛模拟)
  // 随机生成 500 组答案，挑选最接近 targetScore 且符合人类打分习惯的一组
  let bestChoices = []
  let minDiff = Infinity

  for (let iter = 0; iter < 500; iter++) {
    let currentChoices = []
    let currentScore = 0

    for (let i = 0; i < 12; i++) {
      let choice;
      // 根据目标分数，设定各区间的概率分布（为了像真人，我们优先扣自评的分）
      if (targetScore >= 90) {
        // 想打 90+ 高分：绝大数选"完全符合"(0)，自评部分概率掉到"基本符合"(1)
        let dropProb = (i >= 8) ? 0.5 : 0.1; // 自评有 50% 概率谦虚一下选 1
        choice = Math.random() < dropProb ? 1 : 0;
      } else if (targetScore >= 75) {
        // 想打 75-89 分：混杂 0, 1，偶尔 2
        let rand = Math.random();
        if (i >= 8) choice = rand < 0.2 ? 2 : (rand < 0.7 ? 1 : 0); // 自评更容易给中庸评价
        else choice = rand < 0.1 ? 2 : (rand < 0.3 ? 1 : 0);
      } else {
        // 75 分以下（中差评）：在 1, 2, 3, 4 中随机散布
        choice = Math.floor(Math.random() * 4) + 1;
      }

      currentChoices.push(choice)
      currentScore += optionScores[choice] * weights[i]
    }

    // 绝对防拦截兜底：一键排查是否 12 道题全选了一模一样的选项
    const allSame = currentChoices.every(val => val === currentChoices[0])
    if (allSame) continue; // 如果全一样，直接抛弃这个组合，重新生成

    // 比较偏差
    const diff = Math.abs(currentScore - targetScore)
    if (diff < minDiff) {
      minDiff = diff
      bestChoices = [...currentChoices]
    }
    
    // 如果找到了误差在 0.5 分以内的神仙组合，直接停止运算，节约性能
    if (minDiff < 0.5) break;
  }

  // 组装最终的表单 POST 数据
  for (let i = 0; i < radioNames.length; i++) {
    const name = radioNames[i]
    const options = form.radioGroups[name]
    
    // 容错处理：万一教务系统某门课题目不到12题，或者选项不到5个
    const choiceIdx = Math.min(bestChoices[i] || 0, options.length - 1)
    result.push([name, options[choiceIdx]])
  }

  // ── 主观评语 (zgpyids) 智能选择 ──
  const allComments = form.checkboxes['zgpyids'] || []
  if (allComments.length > 0) {
    const half = Math.floor(allComments.length / 2)
    const positiveComments = allComments.slice(0, half)
    const negativeComments = allComments.slice(half)
    
    // 分数 >= 75 算好评池，否则用差评池
    const pool = targetScore >= 75 ? positiveComments : negativeComments
    
    // 随机打乱并取前 2 个评语
    const shuffled = pool.sort(() => 0.5 - Math.random())
    const selectedComments = shuffled.slice(0, 2)
    
    for (const val of selectedComments) {
      result.push(['zgpyids', val])
    }
  }

  return result
}

// function chooseRadioFields(radioGroups, degree) {
//   // 筛选出所有评价指标的单选框组
//   const names = Object.keys(radioGroups).filter((n) => n.startsWith('pj0601id_'))
//   const result = []
//
//   // 基准索引：degree = 1(优) 对应 index 0
//   const baseIndex = Math.max(0, degree - 1)
//
//   for (let idx = 0; idx < names.length; idx++) {
//     const values = radioGroups[names[idx]]
//     const maxIndex = values.length - 1
//
//     // 随机抖动逻辑 (Random Jitter)
//     // 设定：70% 概率保持基准选项，15% 概率往上浮动一档，15% 概率往下浮动一档
//     let offset = 0
//     const rand = Math.random()
//     if (rand < 0.15) {
//       offset = -1 // 评价变好（索引减小）
//     } else if (rand > 0.85) {
//       offset = 1  // 评价变差（索引增大）
//     }
//
//     // 计算最终选择的索引，使用 Math.max 和 Math.min 防止越界
//     // 比如基准已经是0(最好)，offset -1 会被拦截在 0
//     let choice = Math.max(0, Math.min(baseIndex + offset, maxIndex))
//
//     result.push([names[idx], values[choice]])
//   }
//
//   // 防刷机制兜底 (Anti-bot Fallback)
//   // 虽然有了随机抖动，但在概率上仍有可能出现“全选A”的情况，导致提交被系统拦截
//   if (names.length > 1) {
//     // 检查是否所有题目最终都选了同一个下标的值
//     const allSame = result.every((item) => item[1] === result[0][1])
//     if (allSame) {
//       // 如果不幸随机出了全一样，强行把最后一道题错开一档
//       const lastValues = radioGroups[names[names.length - 1]]
//       let fallbackChoice = baseIndex === 0 && lastValues.length > 1 ? 1 : Math.max(0, baseIndex - 1)
//       result[result.length - 1][1] = lastValues[fallbackChoice]
//     }
//   }
//
//   return result
// }
//
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
  log('jwgl:post', { url, bodyLen: body.length, hasCookies: Boolean(cookies && cookies.trim()) })
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
    score: thCells.findIndex(c => c.includes('总评分')),
    evaluated: thCells.findIndex(c => c.includes('已评')),
    submitted: thCells.findIndex(c => c.includes('是否提交')),
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
    const totalScore = colIdx.score >= 0 ? (cells[colIdx.score] || '0') : '0'
    const evaluated = colIdx.evaluated >= 0 ? (cells[colIdx.evaluated] || '否') : '否'
    const submitted = colIdx.submitted >= 0 ? (cells[colIdx.submitted] || '否') : '否'

    courses.push({ editLink, courseName, teacherName, totalScore, evaluated, submitted })
  }

  log('courses:parse', { headers: thCells, colIdx, parsedN: courses.length, first: courses[0] })
  return courses
}

async function fetchCourses(cookies) {
  const findResp = await jwglGet('/jsxsd/xspj/xspj_find.do', cookies)
  cookies = findResp.cookies
  const batchLinks = parseLinks(findResp.body, '/jsxsd/xspj/xspj_list.do')
  if (batchLinks.length === 0) return { courses: [], cookies }

  // All batch pages return the same course list. Just parse the first one.
  const firstBatch = batchLinks[0]
  const listResp = await jwglGet(firstBatch, cookies, JWGL_BASE + '/jsxsd/xspj/xspj_find.do')
  cookies = listResp.cookies
  const allCourses = parseCourseList(listResp.body).map(c => ({
    ...c,
    batchIndex: 0,
    batchLink: firstBatch,
  }))

  log('courses:result', { total: allCourses.length, sample: allCourses.slice(0, 2).map(c => ({ name: c.courseName, teacher: c.teacherName })) })
  return { courses: allCourses, cookies }
}

// ── evaluation runner (async generator) ────────────────────────────────────

async function* runEvaluation(cookies, targetScore, comment, commentImprove, doSubmit, selectedEditLinks) {
  if (!selectedEditLinks || selectedEditLinks.length === 0) {
    yield { type: 'done', totalSaved: 0, totalBatches: 0, message: '没有选中的课程' }
    return
  }

  const totalCourses = selectedEditLinks.length
  let totalSaved = 0

  for (let i = 0; i < selectedEditLinks.length; i++) {
    const editLink = selectedEditLinks[i]
    yield {
      type: 'course',
      courseIndex: i + 1,
      totalCourses,
      message: `正在评价课程 ${i + 1}/${totalCourses}`,
    }

    try {
      const editResp = await jwglGet(editLink, cookies, JWGL_BASE + '/jsxsd/xspj/xspj_find.do')
      cookies = editResp.cookies
      const form = parseEvalForm(editResp.body)

      // build data as array of [name,value] pairs — exactly like Python build_eval_data
      const data = []
      for (const [name, value] of form.fields) {
        if (name === 'issubmit') data.push([name, '0'])
        else if (name === 'sfxyt') data.push([name, '0'])
        else if (name === 'sava') data.push([name, '0'])
        else data.push([name, value])
      }

      data.push(...generatePreciseEvaluation(form, targetScore))

      // 教务表单 textarea 顺序：第1个=亮点，第2个=改进建议
      log('evaluate:textareas', { names: form.textareas, comment, commentImprove })
      if (form.textareas.length > 0) data.push([form.textareas[0], comment])
      if (form.textareas.length > 1) data.push([form.textareas[1], commentImprove])
      else if (form.textareas.length === 0) {
        yield { type: 'course-error', courseIndex: i + 1, message: '未找到评语输入框，表单结构可能已变更' }
        continue
      }

      const saveUrl = form.action || '/jsxsd/xspj/xspj_save.do'
      const postResp = await jwglPost(saveUrl, data, cookies, JWGL_BASE + editLink)
      // 教务系统通过 alert 弹窗返回结果
      const alertMatch = postResp.body.match(/alert\('([^']+)'\)/)
      if (alertMatch) {
        const msg = alertMatch[1]
        if (msg.includes('成功')) {
          // 保存成功，继续下一门
        } else {
          yield { type: 'course-error', courseIndex: i + 1, message: msg }
          continue
        }
      }
      totalSaved++
    } catch (err) {
      log('evaluate:course:error', { courseIndex: i + 1, error: err.message })
      yield {
        type: 'course-error',
        courseIndex: i + 1,
        message: `课程 ${i + 1} 保存失败: ${err.message}`,
      }
    }
  }

  // submit all batches if requested
  if (doSubmit) {
    yield { type: 'step', step: 'submit', message: '正在提交…' }
    try {
      const findResp = await jwglGet('/jsxsd/xspj/xspj_find.do', cookies)
      cookies = findResp.cookies
      const batchLinks = parseLinks(findResp.body, '/jsxsd/xspj/xspj_list.do')

      for (const batchLink of batchLinks) {
        const listResp = await jwglGet(batchLink, cookies, JWGL_BASE + '/jsxsd/xspj/xspj_find.do')
        cookies = listResp.cookies
        const listForm = parseEvalForm(listResp.body)

        let pj01id = ''
        for (const [name, value] of listForm.fields) {
          if (name === 'pj01id' && value) { pj01id = value; break }
        }

        if (pj01id) {
          await jwglPost(
            `/jsxsd/xspj/xspj_yjtj.do?pj01id=${encodeURIComponent(pj01id)}`,
            listForm.fields,
            cookies,
            JWGL_BASE + batchLink,
          )
          yield { type: 'step', step: 'submitted', message: '已提交' }
        }
      }
    } catch (err) {
      yield { type: 'step', step: 'submit-error', message: `提交失败: ${err.message}` }
    }
  }

  const msg = doSubmit
    ? `评价完成：共评价并提交 ${totalSaved} 门课程`
    : `评价完成：共保存 ${totalSaved} 门课程评价`

  yield { type: 'done', totalSaved, message: msg }
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

    // step 3: verify by fetching find.do — capture cookies from this response too
    const r3 = await fetch(JWGL_BASE + '/jsxsd/xspj/xspj_find.do', {
      headers: buildHeaders(cookies2, { Referer: JWGL_BASE + '/jsxsd/' }),
    })
    const r3Body = await r3.text()
    const cookies3 = parseSetCookies(r3) || cookies2

    if (isLoginPage(r3Body)) {
      const text = parseText(r3Body)
      const hints = ['用户名', '密码', '验证码', '错误', '失败'].filter((h) => text.includes(h))
      sendJson(res, 401, { success: false, msg: '登录失败: ' + hints.join('/') })
      return
    }

    const sessionId = makeSessionId()
    sessions.set(sessionId, { cookies: cookies3, username, createdAt: Date.now() })
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
    const { sessionId, targetScore, comment = '', commentImprove = '', submit = false, selectedCourses } = body

    if (!sessionId) {
      sendJson(res, 400, { success: false, msg: '缺少 sessionId' })
      return
    }

    const session = getSession(sessionId)
    if (!session) {
      sendJson(res, 401, { success: false, msg: '会话已过期，请重新登录' })
      return
    }

    const scoreNum = Number(targetScore)
    if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      sendJson(res, 400, { success: false, msg: '评分必须在 0-100 之间' })
      return
    }

    log('handleEvaluate:start', { sessionId, targetScore: scoreNum, hasComment: Boolean(comment), hasImprove: Boolean(commentImprove), submit, selectedN: selectedCourses?.length })

    // SSE headers
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')

    try {
      for await (const event of runEvaluation(session.cookies, scoreNum, comment, commentImprove, submit, selectedCourses)) {
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
          const { courses, cookies: refreshedCookies } = await fetchCourses(session.cookies)
          session.cookies = refreshedCookies
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
