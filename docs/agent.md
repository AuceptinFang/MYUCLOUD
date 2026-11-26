# 给 Agent 用的命令行

[返回 README](../README.md)

Claude Code、Codex 这类能运行终端命令的 agent，可以不打开网页，直接通过命令行工具操作课程、作业、问卷和测验。工具的请求和网页一样，都经后端的 `/ucloud`、`/file` 代理转发，后端不需要改动。

## 使用

1. 在网页上登录 UCloud，点页头的「复制给 Agent」。
2. 把复制的提示词粘贴给 agent。agent 会下载 `agent/myu.mjs`，用提示词里的凭证运行 `auth`，再读 `guide` 里的规则。

提示词里带有当前的 Blade-Auth 和 refresh_token，会出现在 agent 的对话记录里。工具在 token 过期时用 refresh_token 续期；续期失败就要回网页重新登录，再复制一次。用 Blade-Auth 登录网页时没有 refresh_token，复制出的凭证大约 2 小时后失效。

## 命令

完整说明以 `node myu.mjs guide` 的输出为准，内容来自 [agent/guide.js](../agent/guide.js)。

| 类别 | 命令 |
| --- | --- |
| 账户 | `auth <token> [--refresh] [--backend]`、`whoami`、`logout` |
| 浏览 | `courses`、`todo [--all]`、`resources <课程id>`、`download <资源id> [--out]` |
| 作业 | `assignment <id>`、`assignment-submit <id> [--content] [--file]... [--confirm]` |
| 问卷 | `survey <id>`、`survey-submit <id> --answers JSON [--confirm]` |
| 测验 | `quiz <id>`、`quiz-start <id> [--confirm]`、`quiz-save <id> --answers JSON`、`quiz-submit <id> [--confirm]`、`quiz-result <id>` |
| 其他 | `api <GET\|POST> <路径> [--body] [--query k=v]` |

所有命令输出 JSON。会产生真实提交或开始计时的命令，不加 `--confirm` 时只预演，不发出请求。`quiz-start` 会把试卷缓存到本地，`quiz-save` 据此把选项字母换成选项 id，不会再次进入试卷。

凭证保存在 `~/.myucloud/session.json`，权限为 `0600`，可以用 `MYU_HOME` 改目录。后端默认为 `https://myu.aucept.in`，可以用 `auth --backend` 或 `MYU_BACKEND` 修改。普通请求 30 秒超时，下载 10 分钟超时。

## 开发

源码在 [agent/](../agent/)，复用 `src/utils` 中的待办、测验和问卷逻辑，结果和网页一致。[vite.agent.js](../vite.agent.js) 在构建时把它们打包成只依赖 Node 内置模块的单个文件，输出到 `dist/agent/myu.mjs`；开发服务也在 `/agent/myu.mjs` 提供同样的文件。

在仓库里可以直接运行源码：

```sh
node agent/cli.js guide
MYU_BACKEND=http://127.0.0.1:5173 node agent/cli.js todo
```

测试在 [tests/agent.test.js](../tests/agent.test.js)，使用模拟的后端响应。

## 在任务开始前检查登录

运行 `node myu.mjs session-check`。它会查询学校身份接口，不会打开测验或提交作业。结果的 `state` 表示这次检查的结果，`expiresAt` 是预计到期时间（毫秒时间戳，未知时为 null）。

常驻服务可每 5 分钟串行调用一次 `checkSession(client)`，与任务共用同一个 client。距离到期不足 15 分钟时尝试续期；到期时间未知时，以最近一次保存时间为基准，每小时尝试续期。不要让多个独立进程同时轮换同一份凭据。

- `online`：身份已验证，有续期凭据。`online_without_refresh`：身份已验证，但不能自动续期。
- `renewal_rejected`、`renewal_failed`、`login_required`：应通知用户；分别表示续期被拒、续期请求失败、需要登录。
- `unverified`：本次未能核实学校身份，不等于已掉线。

需要接入私聊提醒时，把结果交给 `agent/session-alert.mjs` 的 `handleHealth(status, { read, write, notify })`。前两个函数同步读取和持久化本次故障状态；`notify(id, reason)` 使用已有的私聊通知渠道，以 id 为幂等键，成功入队才返回。同一次故障只入队一次；没有续期凭据且临近到期时也会提醒。命令行本身不绑定 QQ 账号或启动后台服务。
