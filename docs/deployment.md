# 前端部署

[返回 README](../README.md)

## GitHub Pages 前端

仓库包含 `.github/workflows/pages.yml`：推送到 `master` 后，自动安装依赖、运行测试并构建、发布前端。首次使用需要在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

根目录 `CNAME` 指定前端域名 `u.aucept.in`，Pages 构建会将其写入 `dist/CNAME`。使用 Actions 发布时，还需在 **Settings → Pages → Custom domain** 中设置 `u.aucept.in`，并将 DNS 的 `u` CNAME 指向 `auceptinfang.github.io`。后端域名 `myu.aucept.in` 单独指向实际后端服务。

Pages 使用独立的 `pages` 模式，静态资源使用相对路径，适配仓库子路径和自定义域名。登录、业务请求、文件、视频和 Office 预览均通过统一后端地址访问。该构建不包含本地签到插件、调试页或自行提供的字体。已有的本地课表仍可查看；GitHub Pages 与本机站点属于不同来源，不共享 localStorage。

后端地址由构建时的 `VITE_BACKEND_URL` 指定，只填写来源地址，例如 `https://myu.aucept.in`，不带路径。Pages 默认使用此地址，本地开发和普通构建默认同源。GitHub Actions 中可以通过仓库变量 **VITE_BACKEND_URL** 覆盖默认地址；修改后需要重新构建发布。

```sh
VITE_BACKEND_URL=https://myu.aucept.in npm run build:pages
```

如需不连接任何后端的只读界面预览，显式设为空：

```sh
VITE_BACKEND_URL='' npm run build:pages
npm run preview -- --mode pages
```

只读模式会显示“此预览未连接后端，登录及同步暂不可用”，禁用登录与同步请求，同时允许查看已有课表缓存。配置了后端地址但服务尚未部署或网络不可达时，显示连接错误并保留缓存。

### 后端跨域配置

将 `myu.aucept.in` 的 HTTPS 请求转发到实际 Hono 后端，例如本机 `127.0.0.1:8787`。域名本身不提供后端服务，需要独立部署并保持路径转发。

后端默认允许 `https://u.aucept.in` 和 `https://auceptinfang.github.io` 跨域访问。可通过 `CORS_ORIGINS` 设置允许的来源，多个来源用逗号分隔；来源只包含协议、域名和端口，不包含 `/MYUCLOUD/` 路径。若部署时显式设置了此变量，应包含新的前端来源。

```sh
CORS_ORIGINS=https://u.aucept.in,https://auceptinfang.github.io npm run server
```

如果需要从本机预览连接远程后端，应在远程后端允许对应的本机来源（例如 `http://localhost:4173`）。跨域支持覆盖 JSON、鉴权头、SSE 和视频 Range；登录凭证通过请求头或请求体发送，不依赖跨站 Cookie。

`npm run dev`、`npm run build` 与普通 `npm run preview` 默认仍使用本地应用模式。网络中断、后端接口缺失或返回非 JSON 错误页时，页面会显示可理解的错误；附件预览和下载失败会提示并恢复按钮状态，不会清空已保存课表。
