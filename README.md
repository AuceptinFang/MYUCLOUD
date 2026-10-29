# MYUCLOUD

面向北邮 UCloud 的学习工具，集中查看课程资料、作业和课表。项目最初用于解决 Linux 下 Firefox 无法登录 UCloud 的问题。

**在线使用：[u.aucept.in](https://u.aucept.in)**

## 功能

| 功能 | 说明 |
| --- | --- |
| 课程 | 查看本学期课程、课程详情与资料 |
| 作业 | 按截止时间分组，查看详情、上传附件和提交 |
| 课表 | 同步周课表并缓存在浏览器，断网或退出后仍可查看已同步内容 |
| 登录 | UCloud 支持统一认证或 Blade-Auth；教务系统使用独立凭证 |
| 界面 | 桌面端课程、待办分栏，窄屏自动纵向排列；支持保存桌面间距设置 |

问卷和在线测验尚未接入，见[待接入功能](docs/roadmap.md)。

## 本地启动

需要 **Node.js 20.x（20.19 起）或 22.12 及以上版本**，以 [package.json](package.json) 中的 engines 为准。

```sh
git clone https://github.com/AuceptinFang/MYUCLOUD.git
cd MYUCLOUD
npm ci
npm run dev
```

打开终端显示的地址，通常为 `http://localhost:5173/`。开发服务已接入 Hono 后端，可直接登录并使用学校接口。

Windows PowerShell 如果禁止运行 `npm.ps1`，可将命令中的 `npm` 换为 `npm.cmd`。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动前端及本地后端，支持热更新 |
| `npm test` | 运行测试，使用模拟学校响应 |
| `npm run build` | 构建本地应用前端，输出到 `dist/` |
| `npm run preview` | 预览构建结果，同时提供本地后端 |
| `npm run build:pages` | 构建 GitHub Pages 前端，默认连接远程后端 |
| `npm run server` | 单独启动后端，默认监听 `127.0.0.1:8787` |

普通静态托管或直接打开 `dist/index.html` 无法提供登录及接口代理。完整部署方式见[前端部署](docs/deployment.md)。

## 使用说明

- **课程与作业**：登录 UCloud 后加载数据，点击课程或作业进入详情。Blade-Auth 登录位于登录区域的展开项中。
- **课表**：顶部“课表”可独立打开，教务登录与 UCloud 登录分开。首次同步按周保存；重新同步失败不会清空已有缓存。
- **间距设置**：右下角“间距”支持即时预览、保存、取消和恢复默认，只调整桌面布局，设置保存在当前浏览器。
- **报告封面入口**：默认隐藏。若另有报告生成工具，可在 `.env.local` 中设置 `VITE_REPORT_COVER_URL=https://your-site.example/geport/` 后重启或重新构建。此仓库不包含报告工具或其部署配置。

浏览器缓存按来源隔离，本机和在线站点不会共享登录状态、课表或界面设置。教务凭证过期或退出后，已缓存课表仍保留。更多说明见[课表与教务登录](docs/timetable.md)。

## 部署与配置

GitHub Pages 的前端地址为 `https://u.aucept.in`，默认后端为 `https://myu.aucept.in`。仓库包含自动发布工作流，推送到 `master` 后会运行测试、构建并发布。

| 配置 | 用途 |
| --- | --- |
| `VITE_BACKEND_URL` | 构建时指定后端来源地址，不带路径；Pages 模式默认使用远程后端 |
| `VITE_REPORT_COVER_URL` | 可选报告工具链接，支持 HTTP(S) 地址或站内绝对路径；未设置时不显示入口 |
| `VITE_ENABLE_DEBUG` | 普通生产构建设为 `true` 可启用调试页；Pages 构建始终排除 |
| `CORS_ORIGINS` | 后端允许访问的前端来源，多个来源用逗号分隔 |

Pages 域名、DNS、只读预览和跨域配置见[部署说明](docs/deployment.md)。本地预览、独立后端、Docker 和插件开发见[开发说明](docs/development.md)。

## 项目结构

```text
src/
  components/common/   登录、课程、作业、课表等组件
  components/layout/   页面框架和导航
  api/                 前端请求与上传
  utils/               截止时间、作业展示、缓存及反馈工具
  vendor/perrin/       间距控制器和样式变量（保留 MIT 许可证）
  workspace.css        当前界面的布局及组件样式
server/                Hono 后端、学校接口代理和教务会话存储
tests/                 自动化测试和模拟响应
docs/                  部署、开发、课表与接口参考
```

## 进一步阅读

- [部署说明](docs/deployment.md)：GitHub Pages、后端地址、CORS 和只读预览。
- [开发说明](docs/development.md)：本地运行、后端结构、Docker、插件与调试页。
- [课表与教务登录](docs/timetable.md)：同步、缓存、凭证和本地接口。
- [接口与鉴权参考](docs/api.md)：CAS/OAuth、业务接口、附件和 curl 示例。
- [待接入功能](docs/roadmap.md)：问卷、在线测验和聚合待办接口。

界面间距工具来源于 [Perrin UI Kit](https://github.com/94yi/perrin-ui-kit)，许可证位于 [src/vendor/perrin/LICENSE](src/vendor/perrin/LICENSE)。
