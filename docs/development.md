# 开发与运行

[返回 README](../README.md)

## 前端维护

- `App.vue` 管理登录、课程与作业请求，以及 hash 路由。界面改动集中在 `components/`，避免把请求逻辑重复放入列表组件。
- `components/layout/AppShell.vue` 统一管理导航、标题、键盘跳转和间距工具的挂载。课程与作业详情仍归属于“课程与作业”导航。
- `utils/assignment-display.js` 负责作业展示分组与相对截止文案；原始记录的状态判断和排序仍由 `utils/deadline.js` 处理。每条作业只进入一个展示组。
- `styles.css` 保留表单、详情、资源及课表共用样式；`workspace.css` 定义当前页面框架和课程、作业列表布局。已淘汰的课程卡片样式不再保留。
- `vendor/perrin/` 保留间距工具及 MIT 许可证。工具单独分包，在页面挂载后加载，组件卸载时销毁；站点适配仅作用于当前页面根元素，手机布局不应用桌面间距覆盖。

报告封面是可选外部工具，在 `.env.local` 中设置 `VITE_REPORT_COVER_URL` 后才显示入口。例如：

```dotenv
VITE_REPORT_COVER_URL=https://your-site.example/geport/
```

修改环境变量后重启开发服务；线上站点需重新构建。报告生成器需要独立部署。

## 本地运行

前端使用 Vue/Vite，后端使用 Hono。开发时由 Vite 接入同一套 Hono 路由：

```sh
npm ci
npm run dev
```

然后打开 Vite 输出的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

`npm run dev` 和 `npm run preview` 均通过 `vite.backend.js` 接入 Hono。预览构建结果时运行：

```sh
npm run build
npm run preview
```

后端也可以独立启动，默认监听 `127.0.0.1:8787`：

```sh
npm run server
# 可通过 HOST、PORT 设置监听地址
```

独立后端只提供 API 和代理，不托管前端。分开部署时，应将 `/api/*`、`/ucloud/*`、`/file/*`、`/jwgl/*`、`/office/*` 转发到后端，其余请求交给静态站点。直接打开 `dist/index.html` 或只有静态托管无法完成学校登录和接口代理。

## 后端组织

- `server/app.js`：Hono 应用工厂、统一错误处理与路由注册。
- `server/routes/`：教务 JSON/SSE 路由，以及 UCloud、文件、教务、Office 代理。
- `server/services/`：CAS/OAuth、教务登录、课表获取和评教业务流程。
- `server/parsers/timetable.js`：课表 HTML 解析。
- `server/storage/jwgl-sessions.js`：当前教务会话文件存储。
- `server/node-app.js`：为应用注入 Node 会话存储，延迟到实际请求时打开文件。
- `server/entries/node.js`：独立 Node HTTP 服务入口。
- `vite.backend.js`：使用 Hono 官方 Node 适配器接入 Vite 开发与预览服务。

路由和业务模块使用 Web Request/Response、fetch 和 Streams，Node 文件系统依赖集中在会话存储及启动适配中。项目提供本地构建与 Node 运行方式，教务登录使用 `sessionId` 协议。

```sh
npm test
```

测试使用模拟学校响应，覆盖登录、Cookie、课表缓存、HTTP 适配、视频 Range、上传代理和 SSE；不会提交真实作业或评教。

## Docker（调试模式）

容器内运行 Vite dev server，源码通过挂载同步，**改代码自动热更新，无需重启**。仅用于本地调试，非生产部署。

```sh
docker compose up -d        # 启动，访问 http://localhost:5173/
docker compose logs -f      # 查看日志
docker compose down         # 停止
```

改 `package.json` 增减依赖时需重建：`docker compose up -d --build`。

## 页面插件

在 `src/plugin/` 下创建插件目录并提供 `index.vue`，应用会自动识别并在顶部导航增加入口。插件发现逻辑位于 `src/plugin/index.js`；Pages 构建仅包含随仓库提供的教务评教插件。

## Web API 调试页

调试页在本地开发时可用，生产构建默认不展示入口，也无法通过 `#debug` 打开。
如需在生产构建中临时启用，显式设置：

```sh
VITE_ENABLE_DEBUG=true npm run build
```
