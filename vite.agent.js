import { fileURLToPath } from 'node:url'
import { build } from 'vite'

export const AGENT_CLI_PATH = 'agent/myu.mjs'
const ENTRY = fileURLToPath(new URL('./agent/cli.js', import.meta.url))

// 把 agent/cli.js 连同引用的 src/utils 打成一个零依赖的 Node 脚本
export async function bundleAgentCli() {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      ssr: ENTRY,
      write: false,
      minify: false,
      rollupOptions: { output: { format: 'es', entryFileNames: 'myu.mjs' } },
    },
  })
  const chunk = [result].flat().flatMap((output) => output.output).find((item) => item.type === 'chunk' && item.isEntry)
  return chunk.code
}

// 构建时输出 dist/agent/myu.mjs，开发与预览服务按同一路径提供下载
export function agentCliPlugin() {
  const serve = (server) => {
    server.middlewares.use(`/${AGENT_CLI_PATH}`, async (req, res, next) => {
      try {
        const code = await bundleAgentCli()
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(code)
      } catch (error) { next(error) }
    })
  }
  return {
    name: 'myucloud-agent-cli',
    configureServer: serve,
    async generateBundle() {
      this.emitFile({ type: 'asset', fileName: AGENT_CLI_PATH, source: await bundleAgentCli() })
    },
  }
}
