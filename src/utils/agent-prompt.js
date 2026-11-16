// 「复制给 Agent」的提示词：让 agent 下载命令行工具、保存当前凭证，再按 guide 的规则操作
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`

export function buildAgentPrompt({ cliUrl, backend, token, refreshToken = '' }) {
  const cli = 'node ~/.myucloud/myu.mjs'
  const auth = [`${cli} auth ${shellQuote(token)}`, refreshToken && `--refresh ${shellQuote(refreshToken)}`, `--backend ${shellQuote(backend)}`]
    .filter(Boolean)
    .join(' ')

  return `请帮我操作北邮 UCloud（课程、作业、问卷、测验）。MYUCLOUD 提供了一个命令行工具，可以直接调用后端接口，不需要打开网页。需要 Node.js 20 以上；Windows 请换成等效命令。

1. 下载工具：
   mkdir -p ~/.myucloud && curl -fsSL ${shellQuote(cliUrl)} -o ~/.myucloud/myu.mjs
2. 保存我的登录凭证（只用于这个工具，不要转发，也不要写进其他文件）：
   ${auth}
3. 阅读使用说明，并严格遵守其中「必须遵守」的规则：
   ${cli} guide

完成后运行 \`${cli} todo\`，简要告诉我当前待办，然后等我的指示。`
}
