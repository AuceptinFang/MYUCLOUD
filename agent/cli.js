#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { CliError, createClient } from './client.js'
import * as commands from './commands.js'
import { GUIDE } from './guide.js'

const OPTIONS = {
  refresh: { type: 'string' },
  backend: { type: 'string' },
  all: { type: 'boolean' },
  content: { type: 'string' },
  file: { type: 'string', multiple: true },
  out: { type: 'string' },
  answers: { type: 'string' },
  body: { type: 'string' },
  query: { type: 'string', multiple: true },
  confirm: { type: 'boolean' },
  'allow-incomplete': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
}

// 命令名 → 处理函数；位置参数按顺序填进对应字段
const COMMANDS = {
  auth: [commands.auth, ['token']],
  whoami: [commands.whoami, []],
  courses: [commands.courses, []],
  todo: [commands.todo, []],
  assignment: [commands.assignment, ['id']],
  'assignment-submit': [commands.assignmentSubmit, ['id']],
  resources: [commands.resources, ['courseId']],
  download: [commands.download, ['resourceId']],
  survey: [commands.survey, ['id']],
  'survey-submit': [commands.surveySubmit, ['id']],
  quiz: [commands.quiz, ['id']],
  'quiz-start': [commands.quizStart, ['id']],
  'quiz-save': [commands.quizSave, ['id']],
  'quiz-submit': [commands.quizSubmit, ['id']],
  'quiz-result': [commands.quizResult, ['id']],
  api: [commands.api, ['method', 'path']],
}

export async function run(argv, { client, stdout = process.stdout } = {}) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true })
  const [name, ...rest] = positionals
  if (!name || name === 'guide' || name === 'help' || values.help) {
    stdout.write(GUIDE)
    return
  }
  if (name === 'logout') {
    (client || createClient()).clear()
    stdout.write(`${JSON.stringify({ loggedOut: true })}\n`)
    return
  }
  const entry = COMMANDS[name]
  if (!entry) throw new CliError(`未知命令 ${name}，运行 guide 查看可用命令`)
  const [handler, fields] = entry
  const args = {
    ...Object.fromEntries(fields.map((field, index) => [field, rest[index]])),
    refresh: values.refresh,
    backend: values.backend,
    all: values.all,
    content: values.content,
    files: values.file || [],
    out: values.out,
    answers: values.answers,
    body: values.body,
    query: values.query || [],
    confirm: Boolean(values.confirm),
    allowIncomplete: Boolean(values['allow-incomplete']),
  }
  const result = await handler(client || createClient({ backend: name === 'auth' ? undefined : values.backend }), args)
  stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  run(process.argv.slice(2)).catch((error) => {
    const output = { error: error.message, ...(error instanceof CliError && error.detail ? { detail: error.detail } : {}) }
    if (!(error instanceof CliError) && error?.cause) output.cause = String(error.cause.message || error.cause)
    process.stderr.write(`${JSON.stringify(output, null, 2)}\n`)
    process.exitCode = 1
  })
}
