import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, createSessionStore } from '../agent/client.js'
import * as commands from '../agent/commands.js'
import { run } from '../agent/cli.js'
import { bundleAgentCli } from '../vite.agent.js'
import { buildAgentPrompt } from '../src/utils/agent-prompt.js'

const BACKEND = 'https://backend.test'
const ok = (data) => ({ code: 200, success: true, data, msg: '操作成功' })

// 按「方法 路径」返回模拟响应，记录每次请求
function mockBackend(t, routes) {
  const dir = mkdtempSync(join(tmpdir(), 'myu-agent-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const calls = []
  const fetch = async (input, init = {}) => {
    const url = new URL(input)
    const method = init.method || 'GET'
    const call = { method, path: url.pathname, query: Object.fromEntries(url.searchParams), headers: init.headers || {}, body: init.body }
    calls.push(call)
    const handler = routes[`${method} ${url.pathname}`]
    if (!handler) return new Response(JSON.stringify({ code: 404, msg: 'no route' }), { status: 404 })
    const result = await handler(call)
    return new Response(JSON.stringify(result.body ?? result), { status: result.status || 200 })
  }
  const store = createSessionStore(dir)
  store.write({ token: 'old-token', refreshToken: 'refresh-1', backend: BACKEND })
  return { client: createClient({ store, fetch }), store, calls, dir }
}

const user = { 'GET /ucloud/ykt-basics/info': () => ok({ id: 7, account: '2024000000', realName: '学生' }) }

test('token 过期时用 refresh_token 续期并保存新凭证', async (t) => {
  const { client, store, calls } = mockBackend(t, {
    'GET /ucloud/ykt-basics/info': ({ headers }) => (headers['Blade-Auth'] === 'new-token'
      ? ok({ id: 7, account: '2024000000', realName: '学生' })
      : { status: 401, body: { code: 401, msg: '请求未授权' } }),
    'POST /ucloud/ykt-basics/oauth/token': () => ({ access_token: 'new-token', refresh_token: 'refresh-2' }),
  })
  const result = await commands.whoami(client)
  assert.deepEqual(result.user, { id: '7', account: '2024000000', name: '学生' })
  assert.equal(store.read().token, 'new-token')
  assert.equal(store.read().refreshToken, 'refresh-2')
  const refresh = calls.find((call) => call.path.endsWith('/oauth/token'))
  assert.equal(refresh.body.get('grant_type'), 'refresh_token')
  assert.equal(refresh.body.get('refresh_token'), 'refresh-1')
  assert.equal(statSync(join(store.dir, 'session.json')).mode & 0o777, 0o600)
})

test('续期失败时提示回网页重新登录', async (t) => {
  const { client } = mockBackend(t, {
    'GET /ucloud/ykt-basics/info': () => ({ status: 401, body: { code: 401 } }),
    'POST /ucloud/ykt-basics/oauth/token': () => ({ status: 400, body: { error: 'invalid_grant' } }),
  })
  await assert.rejects(commands.whoami(client), /重新登录/)
})

test('todo 合并作业、问卷和测验，作业按课程补上课程名，默认不列已完成', async (t) => {
  const future = '2099-01-01 00:00:00'
  const { client } = mockBackend(t, {
    ...user,
    'GET /ucloud/ykt-site/site/list/student/current': () => ok({ records: [{ id: 'c1', siteName: '数据结构' }] }),
    'POST /ucloud/ykt-site/work/student/list': ({ body }) => (JSON.parse(body).siteId
      ? ok({ records: [{ id: 'a1' }] })
      : ok({ records: [
          { id: 'a1', assignmentTitle: '实验一', assignmentEndTime: '2099-01-02 00:00' },
          { id: 'a2', assignmentTitle: '已交', assignmentEndTime: '2099-01-02 00:00', submitTime: '2026-11-01 10:00' },
        ] })),
    'GET /ucloud/ykt-activity/survey/page/todo': ({ query }) => ok({ records: query.level === '1' ? [{ id: 's1', siteId: 'c1', theme: '课程问卷', endTime: future }] : [] }),
    'GET /ucloud/ykt-site/examination/list-stu': () => ok({ records: [
      { id: 'q1', title: '小测', endAt: future, statusSelf: '未提交', score: -1 },
      { id: 'q2', title: '已交小测', endAt: future, statusSelf: '已评分', score: 90 },
    ] }),
  })

  const pending = await commands.todo(client)
  assert.deepEqual(pending.map((item) => [item.kind, item.id]).sort(), [['assignment', 'a1'], ['quiz', 'q1'], ['survey', 's1']])
  assert.equal(pending.find((item) => item.id === 'a1').courseName, '数据结构')
  assert.equal(pending.find((item) => item.id === 's1').courseName, '数据结构')

  const all = await commands.todo(client, { all: true })
  assert.equal(all.find((item) => item.id === 'q2').score, '90 分')
  assert.ok(all.some((item) => item.id === 'a2' && item.isCompleted))
})

test('不加 --confirm 时提交作业只预演，不上传也不提交', async (t) => {
  const { client, calls, dir } = mockBackend(t, {
    ...user,
    'GET /ucloud/ykt-site/work/detail': () => ok({ assignmentTitle: '实验一', assignmentEndTime: '2099-01-02 00:00' }),
  })
  const file = join(dir, 'report.pdf')
  writeFileSync(file, 'pdf')
  const result = await commands.assignmentSubmit(client, { id: 'a1', content: '见附件', files: [file] })
  assert.equal(result.dryRun, true)
  assert.deepEqual(result.plan.files, [{ path: file, bytes: 3 }])
  assert.ok(!calls.some((call) => call.method === 'POST'))
})

test('加 --confirm 后上传附件、提交作业并以 submit-view 确认', async (t) => {
  let submitted = null
  const { client, dir } = mockBackend(t, {
    ...user,
    'GET /ucloud/ykt-site/work/detail': () => ok({ assignmentTitle: '实验一', assignmentType: 0, commitId: 9 }),
    'POST /ucloud/blade-source/resource/upload/biz': ({ body }) => {
      assert.equal(body.get('bizType'), '3')
      assert.equal(body.get('file').name, 'report.pdf')
      return ok('att-1')
    },
    'POST /ucloud/ykt-site/work/submit': ({ body }) => { submitted = JSON.parse(body); return ok(null) },
    'GET /ucloud/ykt-site/work/submit-view': () => ok(submitted ? { assignmentStatus: 1, attachmentIds: ['att-1'] } : { assignmentId: -1 }),
  })
  const file = join(dir, 'report.pdf')
  writeFileSync(file, 'pdf')
  const result = await commands.assignmentSubmit(client, { id: 'a1', content: '见附件', files: [file], confirm: true })
  assert.deepEqual(result, { submitted: true, confirmed: true, attachmentIds: ['att-1'] })
  assert.deepEqual(submitted, { assignmentContent: '见附件', assignmentId: 'a1', assignmentType: 0, attachmentIds: ['att-1'], commitId: '9', groupId: '', userId: '7' })
})

test('问卷答案缺题时拒绝提交，齐全时按官方格式提交', async (t) => {
  let payload = null
  const { client } = mockBackend(t, {
    ...user,
    'GET /ucloud/ykt-activity/survey/detail': () => ok({ theme: '问卷', questionPage: { records: [
      { id: 'q1', type: 1, sort: 1, trunk: '<p>满意吗</p>', optionVOList: [{ opt: 'A' }, { opt: 'B' }] },
      { id: 'q2', type: 2, sort: 2, trunk: '多选', optionVOList: [{ opt: 'A' }, { opt: 'B' }, { opt: 'C' }] },
      { id: 'q3', type: 3, sort: 3, trunk: '建议', optionVOList: [] },
    ] } }),
    'POST /ucloud/ykt-activity/survey/submit-answer': ({ body }) => { payload = JSON.parse(body); return ok(null) },
  })
  await assert.rejects(commands.surveySubmit(client, { id: 's1', answers: '{"q1":"A"}', confirm: true }), (error) => {
    assert.deepEqual(error.detail.problems, ['q2：未作答', 'q3：未作答'])
    return true
  })
  await assert.rejects(commands.surveySubmit(client, { id: 's1', answers: '{"q1":"D","q2":["A"],"q3":"无"}', confirm: true }), /格式不对/)

  const answers = '{"q1":"b","q2":["C","A"],"q3":"无"}'
  assert.equal((await commands.surveySubmit(client, { id: 's1', answers })).dryRun, true)
  assert.equal(payload, null)
  await commands.surveySubmit(client, { id: 's1', answers, confirm: true })
  assert.deepEqual(payload.map(({ questionId, answer, type, userId }) => [questionId, answer, type, userId]), [['q1', 'B', 1, '7'], ['q2', 'A,C', 2, '7'], ['q3', '无', 3, '7']])
})

test('测验先进入试卷才能保存，选择题的字母换成选项 id', async (t) => {
  const saved = []
  const paper = {
    examTime: 30, startAt: '2099-01-01T10:00:00', endAt: '2099-01-02T00:00:00',
    paperParts: [{ paperTrees: [
      { sort: 1, questionId: 'q1', selfAnswer: [], questionCombinationDTO: { questionType: 2, stem: '<p>选两个</p>', questionOptionsList: [{ id: 'o1', optionContent: '甲' }, { id: 'o2', optionContent: '乙' }, { id: 'o3', optionContent: '丙' }] } },
      { sort: 2, questionId: 'q2', selfAnswer: [], questionCombinationDTO: { questionType: 4, stem: '填空', questionOptionsList: [], questionAnswersList: [{}, {}] } },
    ] }],
  }
  const { client, calls } = mockBackend(t, {
    'GET /ucloud/ykt-site/examination/exam-info-stu': () => ok({ duration: 30 }),
    'POST /ucloud/ykt-site/answersheet/enter-paper': () => ok(paper),
    'GET /ucloud/ykt-site/common/clock': () => ok({ data: '2099-01-01T10:10:00.123' }),
    'POST /ucloud/ykt-site/answersheet/member-answers': ({ body }) => { saved.push(JSON.parse(body)); return ok(null) },
    'GET /ucloud/ykt-site/answersheet/query-no-submit': () => ok([]),
  })

  await assert.rejects(commands.quizSave(client, { id: 'e1', answers: '{"q1":["A"]}' }), /quiz-start/)
  assert.equal((await commands.quizStart(client, { id: 'e1' })).dryRun, true)
  assert.ok(!calls.some((call) => call.path.endsWith('/enter-paper')))

  const started = await commands.quizStart(client, { id: 'e1', confirm: true })
  assert.equal(started.remainingSeconds, 20 * 60)
  assert.deepEqual(started.questions[0].options.map((option) => option.key), ['A', 'B', 'C'])
  assert.equal(started.questions[0].stem, '选两个')

  const result = await commands.quizSave(client, { id: 'e1', answers: '{"q1":["A","o3"],"q2":["一","二"]}' })
  assert.deepEqual(result, { saved: ['q1', 'q2'], unsaved: [] })
  assert.deepEqual(saved.map((body) => body.answerSheetList[0]), [
    { questiontId: 'q1', values: ['o1', 'o3'], resourceIds: [] },
    { questiontId: 'q2', values: ['一', '二'], resourceIds: [] },
  ])
  await assert.rejects(commands.quizSave(client, { id: 'e1', answers: '{"q1":["D"]}' }), /没有选项 D/)
})

test('有未保存的题目时拒绝交卷', async (t) => {
  const { client, calls } = mockBackend(t, {
    'GET /ucloud/ykt-site/answersheet/query-no-submit': () => ok(['q2']),
  })
  await assert.rejects(commands.quizSubmit(client, { id: 'e1', confirm: true }), /没有保存答案/)
  assert.ok(!calls.some((call) => call.path.endsWith('/submit-exam')))
})

test('命令行解析位置参数和选项，未登录时给出获取凭证的提示', async (t) => {
  const { client } = mockBackend(t, user)
  let output = ''
  await run(['whoami'], { client, stdout: { write: (text) => { output += text } } })
  assert.equal(JSON.parse(output).user.id, '7')
  client.clear()
  await assert.rejects(run(['courses'], { client, stdout: { write() {} } }), /复制给 Agent/)
})

test('htmlToText 去掉标签并保留图片地址', () => {
  assert.equal(commands.htmlToText('<p>第一行</p><p>a &amp; b<img src="https://x/y.png"></p>'), '第一行\na & b [图片 https://x/y.png]')
})

test('提示词带上下载地址、凭证和后端，凭证按 shell 单引号转义', () => {
  const prompt = buildAgentPrompt({ cliUrl: 'https://u.aucept.in/agent/myu.mjs', backend: 'https://myu.aucept.in', token: "a'b", refreshToken: 'r1' })
  assert.match(prompt, /curl -fsSL 'https:\/\/u\.aucept\.in\/agent\/myu\.mjs'/)
  assert.match(prompt, /auth 'a'\\''b' --refresh 'r1' --backend 'https:\/\/myu\.aucept\.in'/)
  assert.doesNotMatch(buildAgentPrompt({ cliUrl: 'x', backend: 'y', token: 't' }), /--refresh/)
})

test('打包后的命令行是单个文件，只引用 Node 内置模块', { timeout: 30000 }, async () => {
  const code = await bundleAgentCli()
  const imports = [...code.matchAll(/^import .* from "([^"]+)";$/gm)].map((match) => match[1])
  assert.ok(imports.length > 0)
  assert.ok(imports.every((name) => name.startsWith('node:')), imports.join(', '))
  assert.match(code, /^#!\/usr\/bin\/env node/)
})

test('连不上后端时说明是哪个地址、什么原因', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'myu-agent-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const store = createSessionStore(dir)
  store.write({ token: 't', backend: BACKEND })
  const fetch = async () => { throw new TypeError('fetch failed', { cause: new Error('connect ECONNREFUSED') }) }
  await assert.rejects(commands.whoami(createClient({ store, fetch })), /无法连接后端 https:\/\/backend\.test：connect ECONNREFUSED/)
})
