# MYUCLOUD

由于莫名奇妙的问题，我 Linux 下用 Firefox 死活登不进去，遂有此项目。

目前已支持：

- 课程列表与详情
- 作业列表与详情与提交
- 课表（浏览器本地缓存）

## 使用

GitHub Pages 托管前端，Pages 构建默认连接 `https://u.aucept.in` 后端。也可以拉取源码，在本机运行完整应用。

## GitHub Pages 前端

仓库包含 `.github/workflows/pages.yml`：推送到 `master` 后，自动安装依赖、运行测试并构建、发布前端。首次使用需要在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

Pages 使用独立的 `pages` 模式，静态资源使用相对路径，适配仓库子路径和自定义域名。登录、业务请求、文件、视频和 Office 预览均通过统一后端地址访问。该构建不包含本地签到插件、调试页或自行提供的字体。已有的本地课表仍可查看；GitHub Pages 与本机站点属于不同来源，不共享 localStorage。

后端地址由构建时的 `VITE_BACKEND_URL` 指定，只填写来源地址，例如 `https://u.aucept.in`，不带路径。Pages 默认使用此地址，本地开发和普通构建默认同源。GitHub Actions 中可以通过仓库变量 **VITE_BACKEND_URL** 覆盖默认地址；修改后需要重新构建发布。

```sh
VITE_BACKEND_URL=https://u.aucept.in npm run build:pages
```

如需不连接任何后端的只读界面预览，显式设为空：

```sh
VITE_BACKEND_URL='' npm run build:pages
npm run preview -- --mode pages
```

只读模式会显示“此预览未连接后端，登录及同步暂不可用”，禁用登录与同步请求，同时允许查看已有课表缓存。配置了后端地址但服务尚未部署或网络不可达时，显示连接错误并保留缓存。

### 后端跨域配置

将 `u.aucept.in` 的 HTTPS 请求转发到实际 Hono 后端，例如本机 `127.0.0.1:8787`。域名本身不提供后端服务，需要独立部署并保持路径转发。

后端默认允许 `https://auceptinfang.github.io` 跨域访问。可通过 `CORS_ORIGINS` 设置允许的来源，多个来源用逗号分隔；来源只包含协议、域名和端口，不包含 `/MYUCLOUD/` 路径。

```sh
CORS_ORIGINS=https://auceptinfang.github.io,https://frontend.example.com npm run server
```

如果需要从本机预览连接远程后端，应在远程后端允许对应的本机来源（例如 `http://localhost:4173`）。跨域支持覆盖 JSON、鉴权头、SSE 和视频 Range；登录凭证通过请求头或请求体发送，不依赖跨站 Cookie。

`npm run dev`、`npm run build` 与普通 `npm run preview` 默认仍使用本地应用模式。网络中断、后端接口缺失或返回非 JSON 错误页时，页面会显示可理解的错误；附件预览和下载失败会提示并恢复按钮状态，不会清空已保存课表。

## 课表与教务登录

顶部“课表”或 `#timetable` 可直接打开课表页，无需先登录 UCloud。课表和评教共用教务登录状态，使用同一个登录组件，支持账号密码或已有教务凭证登录；教务凭证与 UCloud 的 Blade-Auth 各自独立。

首次登录后同步本学期所有周次，每成功获取一周立即写入当前浏览器的 `localStorage`。即使首次同步中途断网或登录过期，也可以继续查看已保存的周次。再次进入课表页直接读取本地数据，查看和切换已保存的周次不请求教务系统，也不要求登录成功。教务登录状态和账号显示在页面上方；重新同步、节次模式位于页面底部默认收起的“课表设置”中。

重新同步按周更新，同一账号、学期和节次模式下，尚未重新获取的周次继续保留旧数据；登录失败、网络错误或取消不会清空已有缓存。部分周次尚未同步时会标注数量。节次模式在重新同步后应用。

教务凭证保存在 `mock-ucloud-jwgl-auth`，课表保存在 `mock-ucloud-timetable-v1`。退出或凭证过期会清除登录状态，保留本地课表。新登录保存凭证，不再保存教务密码，并删除旧版 `jwgl_creds`。刷新页面和切换课表/评教时复用已有凭证。

服务端会话保存在项目目录的 `.jwgl-sessions.local`（已由 `*.local` 忽略，权限为 `0600`，Vite 禁止通过 HTTP 读取），开发服务重启后可恢复。凭证最长保留 7 天；教务系统的上游会话可能提前失效，届时会提示重新登录。

本地接口：

| 方法 | 路径 | 请求内容 |
|---|---|---|
| POST | `/api/jwgl/login` | `{ username, password }`，返回 `sessionId`、`username`、`expiresAt` |
| POST | `/api/jwgl/session` | `{ sessionId }`，校验已有凭证 |
| POST | `/api/jwgl/logout` | `{ sessionId }`，撤销凭证 |
| POST | `/api/jwgl/timetable` | `{ sessionId, week?, mode? }`，返回解析后的周课表 |

课表上游为 `GET /jsxsd/framework/xsdPerson.jsp`，`week` 对应 `xkzc`，`mode` 对应 `kbjcmsid`。按页面提供的周次列表同步，并合并重复的连堂课记录。

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

## plugin

放在 src/plugin 目录下即可识别，页面右上角会增加一个链接过去的按钮

## Web API 调试页

调试页在本地开发时可用，生产构建默认不展示入口，也无法通过 `#debug` 打开。
如需在生产构建中临时启用，显式设置：

```sh
VITE_ENABLE_DEBUG=true npm run build
```

## 鉴权

云平台的 `Blade-Auth` token 来自 UCloud OAuth 接口。真实流程是：

1. 向 BUPT CAS 登录页发起登录，拿到 CAS `ticket`
2. 用 `ticket` 调 UCloud OAuth token 接口
3. OAuth 返回的 `access_token` 就是后续业务接口使用的 `Blade-Auth`

固定配置：

```text
CAS service: https://ucloud.bupt.edu.cn
API host: https://apiucloud.bupt.edu.cn
OAuth client: portal:portal_secret
OAuth Authorization header: Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=
Business Authorization header: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

## 本项目封装接口

本项目的 Hono 后端提供了一个登录封装接口，其他前端页面可以直接调用它，不需要自己处理 CAS cookie、隐藏字段和 ticket。

```http
POST /api/login
Content-Type: application/json

{
  "username": "学号",
  "password": "统一认证密码"
}
```

成功响应：

```json
{
  "success": true,
  "token": "<access_token>",
  "access_token": "<access_token>",
  "refresh_token": "<refresh_token>",
  "tokenResponse": {},
  "userInfo": {},
  "authHeaders": {
    "Blade-Auth": "<access_token>",
    "Authorization": "Basic c3dvcmQ6c3dvcmRfc2VjcmV0",
    "Tenant-Id": "000000"
  }
}
```

失败响应会包含 `stage`，用于判断卡在哪一步：

```json
{
  "success": false,
  "stage": "cas-login",
  "msg": "CAS login did not return ticket"
}
```

`stage` 可能值：

- `cas-login`：CAS 登录失败，通常是账号密码、验证码、风控或隐藏字段问题
- `oauth-token`：CAS 成功但 UCloud token 交换失败

## 原始远程接口

如果要在其他项目里自己实现，可以按下面的 HTTP 流程走。

### 1. 获取 CAS 登录页

```http
GET https://auth.bupt.edu.cn/authserver/login?service=https%3A%2F%2Fucloud.bupt.edu.cn
```

需要保存响应 cookie，并从 HTML 表单里提取：

```text
type
execution
_eventId
```

通常：

```text
type=username_password
_eventId=submit
```

但 `execution` 每次页面都会变，必须实时取。

### 2. 提交 CAS 登录

不要自动跟随跳转，因为要读取 `302 Location` 里的 `ticket`。

```http
POST https://auth.bupt.edu.cn/authserver/login?service=https%3A%2F%2Fucloud.bupt.edu.cn
Content-Type: application/x-www-form-urlencoded
Cookie: <上一步保存的 CAS cookie>

username=<学号>&password=<统一认证密码>&type=username_password&execution=<execution>&_eventId=submit&submit=LOGIN
```

成功时响应是 `302`，`Location` 类似：

```text
https://ucloud.bupt.edu.cn?ticket=ST-xxxxxx
```

取出 `ticket`，它是一次性的，换完 token 后不能复用。

### 3. 用 ticket 换 Blade-Auth

```http
POST https://apiucloud.bupt.edu.cn/ykt-basics/oauth/token
Authorization: Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=
Tenant-Id: 000000
Content-Type: application/x-www-form-urlencoded

ticket=<CAS ticket>&grant_type=third
```

成功响应：

```json
{
  "access_token": "<Blade-Auth token>",
  "token_type": "bearer",
  "refresh_token": "<refresh_token>",
  "expires_in": 7199,
  "scope": "all",
  "tenant_id": "000000",
  "user_name": "学号",
  "real_name": "姓名",
  "currentRole": "JS005",
  "account": "学号"
}
```

其中 `access_token` 就是后续接口要用的 `Blade-Auth`。

### 4. 刷新 token

`access_token` 有效期约 2 小时。可以用 `refresh_token` 刷新：

```http
POST https://apiucloud.bupt.edu.cn/ykt-basics/oauth/token
Authorization: Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=
Tenant-Id: 000000
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&refresh_token=<refresh_token>
```

## 调用云平台业务接口

`apiucloud.bupt.edu.cn` 上的业务接口通常需要携带：

```http
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

示例：

```http
GET https://apiucloud.bupt.edu.cn/ykt-basics/info
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

本项目里可以通过 Hono 代理请求：

```text
/ucloud/ykt-basics/info
```

对应远程：

```text
https://apiucloud.bupt.edu.cn/ykt-basics/info
```

### 已确认业务接口

本地开发时把远程 host 换成 `/ucloud`，由 Hono 后端代理到 `https://apiucloud.bupt.edu.cn`。

#### 用户信息

```http
GET /ucloud/ykt-basics/info
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

远程路径：

```text
GET https://apiucloud.bupt.edu.cn/ykt-basics/info
```

#### 课程列表

```http
GET /ucloud/ykt-site/site/list/student/current?userId=<userId>&siteRoleCode=2&current=1&size=9999
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

远程路径：

```text
GET https://apiucloud.bupt.edu.cn/ykt-site/site/list/student/current?userId=<userId>&siteRoleCode=2&current=1&size=9999
```

返回的课程数组在 `data.records`，课程 ID 通常取 `id`。

#### 作业列表

```http
POST /ucloud/ykt-site/work/student/list
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
Content-Type: application/json

{
  "current": 1,
  "size": 100,
  "siteId": "课程 ID，可选"
}
```

远程路径：

```text
POST https://apiucloud.bupt.edu.cn/ykt-site/work/student/list
```

返回的作业数组在 `data.records`。不传 `siteId` 返回全部作业；传 `siteId` 返回单个课程下的作业。

#### 作业详情

```http
GET /ucloud/ykt-site/work/detail?assignmentId=<assignmentId>
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

远程路径：

```text
GET https://apiucloud.bupt.edu.cn/ykt-site/work/detail?assignmentId=<assignmentId>
```

`assignmentId` 使用作业列表返回项的 `id`。当前作业详情页使用这个接口加载详情，并把完整响应写入调试日志。

#### 资源元数据

```http
GET /ucloud/blade-source/resource/list/byId?resourceIds=<resourceId>
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

远程路径：

```text
GET https://apiucloud.bupt.edu.cn/blade-source/resource/list/byId?resourceIds=<resourceId>
```

`resourceIds` 是资源/文件 ID，不是作业 ID。虽然路径名是 `byId`，但请求参数必须是复数 `resourceIds`；使用 `resourceId` 会返回 HTTP 400。返回的资源数组在 `data`，常见字段包括 `id`、`name`、`fileSize`、`fileSizeUnit`、`ext`、`storageId`、`link`、`mimeType`、`url`。

#### 资源预览链接

```http
GET /ucloud/blade-source/resource/preview-url?resourceId=<resourceId>
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

远程路径：

```text
GET https://apiucloud.bupt.edu.cn/blade-source/resource/preview-url?resourceId=<resourceId>
```

返回预览所需参数：

```json
{
  "code": 200,
  "success": true,
  "data": {
    "previewUrl": "https://fileucloud.bupt.edu.cn/ucloud/document/<storageId>.<ext>?...",
    "onlinePreview": "https://ucloud.bupt.edu.cn/office/?ssl=1&n=1&bclr=000&furl="
  },
  "msg": "操作成功"
}
```

- `previewUrl` — 文件直链，带 `response-content-disposition=attachment` 参数，用于下载
- `onlinePreview` — Office 在线预览基础地址

本项目预览视频时根据文件后缀、文件名或 MIME 类型识别视频，在页面内使用浏览器播放器打开，不交给 Office 预览服务。视频直链通过 `/file` 同源代理加载，保留原始路径和查询参数，支持浏览器分段请求；浏览器不支持的视频编码可使用播放器下方的下载入口。

拿到这两个字段后拼接 ucloud 预览页 URL：

```text
https://ucloud.bupt.edu.cn/uclass/course.html#/resourceLearn
  ?onlinePreview=<onlinePreview>
  &previewUrl=<previewUrl>
  &resourceId=<resourceId>
  &ext=<文件后缀>
```

四个参数值都需要 URL encode。这个页面支持 PDF 内嵌预览以及 Office 文档在线查看。

注意：参数名是单数 `resourceId`（不是 `resourceIds`），和资源元数据接口不一样。

#### 作业附件下载

作业详情接口 (`/ykt-site/work/detail`) 返回的 `data.assignmentResource` 只包含文件元数据摘要（`resourceId`、`resourceName`、`resourceType`），没有下载链接。完整流程分两步：

1. 用 `resourceId` 调资源元数据接口拿 `storageId` 和 `ext`
2. 用 `storageId` + `ext` 构造下载 URL

```http
GET /file/ucloud/document/<storageId>.<ext>
```

远程路径：

```text
GET https://fileucloud.bupt.edu.cn/ucloud/document/<storageId>.<ext>
```

这个域名是 S3 兼容存储，有两层限制：

- **CORS 白名单**：只允许 `Origin: https://ucloud.bupt.edu.cn`，本地 `localhost` 直接请求会被浏览器拦截
- **防盗链检查**：校验 `Origin` / `Referer`，同时拒绝携带 `Authorization` / `Blade-Auth` 等业务鉴权头（收到非 AWS4 签名会报 `InvalidRequest`）

文件请求通过 `server/routes/proxy.js` 中的 `/file` 路由转发。后端移除 `/file` 前缀，将来源头设为学校站点，并剥离 `Authorization`、`Blade-Auth` 和 `Tenant-Id`。

请求和响应体以流的形式转发，保留 `Range`、`Content-Range`、`206` 状态和原始查询参数。开发、预览和独立后端使用同一套代理逻辑。

#### 作业提交

当前作业详情页的提交按钮会请求这个接口。`assignmentId` 使用作业列表返回项的 `id`，`userId` 来自 `/ykt-basics/info` 返回的用户 `id`。

```http
POST /ucloud/ykt-site/work/submit
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
Content-Type: application/json

{
  "assignmentContent": "提交内容",
  "assignmentId": "<assignmentId>",
  "assignmentType": 0,
  "attachmentIds": ["<attachmentId>"],
  "commitId": "",
  "groupId": "",
  "userId": "<userId>"
}
```

远程路径：

```text
POST https://apiucloud.bupt.edu.cn/ykt-site/work/submit
```

`attachmentIds` 是附件上传后得到的资源/附件 ID 数组。当前页面会先上传本地选择的文件，再把上传返回的 ID 放进 `attachmentIds` 提交。

#### 作业提交状态

```http
GET /ucloud/ykt-site/work/submit-view?assignmentId=<assignmentId>
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
```

远程路径：

```text
GET https://apiucloud.bupt.edu.cn/ykt-site/work/submit-view?assignmentId=<assignmentId>
```

打开作业详情时会请求这个接口，完整响应写入调试日志。实测 `OPTIONS` 只返回允许的方法和空 body；业务数据来自 `GET`。参数必须是 `assignmentId`，单独使用 `assignmentld` 会返回缺少参数。

已提交作业返回上一次提交结果，示例：

```json
{
  "code": 200,
  "success": true,
  "data": {
    "attachmentIds": ["<attachmentId>"],
    "assignmentId": "<assignmentId>",
    "assignmentContent": "",
    "assignmentComment": "",
    "score": -1,
    "evaluation": "",
    "groupScore": 0,
    "assignmentScore": 0,
    "status": 2,
    "isOvertimeCommit": 1,
    "assignmentStatus": 0,
    "evaluateRule": "",
    "evaluationAverageScore": 0,
    "evaluationInfos": []
  },
  "msg": "操作成功"
}
```

未提交作业也会返回 `code: 200`，但 `data.assignmentId` 是 `-1`，`attachmentIds` 为空。

`submit-view.data.attachmentIds` 只是资源 ID。当前页面会继续调用 `/blade-source/resource/list/byId?resourceIds=<attachmentId>` 获取文件元数据，并把返回的附件放进作业详情附件列表；附件预览链接需要另接资源预览接口。

#### 附件上传

```http
POST /ucloud/blade-source/resource/upload/biz
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
Content-Type: multipart/form-data

file=<binary>
userId=<userId>
userld=<userId>
bizType=3
```

远程路径：

```text
POST https://apiucloud.bupt.edu.cn/blade-source/resource/upload/biz
```

返回示例：

```json
{
  "code": 200,
  "success": true,
  "data": "<attachmentId>",
  "msg": "操作成功"
}
```

`data` 就是提交作业时放入 `attachmentIds` 的 ID。当前实现会同时带 `userId` 和兼容字段 `userld`，用于对齐抓包里看到的字段名。

#### 课程资料树

```http
POST /ucloud/ykt-site/site-resource/tree/student?siteId=<courseId>&userId=<userId>
Blade-Auth: <access_token>
Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0
Tenant-Id: 000000
Content-Type: application/json

{}
```

远程路径：

```text
POST https://apiucloud.bupt.edu.cn/ykt-site/site-resource/tree/student?siteId=<courseId>&userId=<userId>
```

注意参数名是 `siteId` 和 `userId`。抓包里容易把 `I` 看成 `l`，写成 `siteld/userld` 会被后端当作缺少参数。

返回的资料树在 `data`。目录节点常见字段包括 `id`、`resourceName`、`resourceType`、`children`、`attachmentVOs`；附件文件信息在 `attachmentVOs[].resource`，常见字段包括 `name`、`ext`、`fileSize`、`fileSizeUnit`、`mimeType`、`url`。

外部链接附件的 `type` 为 `2`，`resource` 可以是空对象，标题和地址分别在 `siteResourceLink.title` 与 `siteResourceLink.link`。页面显示链接标题并在新标签页打开，不调用文件预览或下载接口。`recommendLearnTime` 为 `-1` 等非正数时不显示建议学习时长。

## curl 示例

下面示例只展示流程。不要把真实密码写进脚本仓库。

```bash
LOGIN_URL='https://auth.bupt.edu.cn/authserver/login?service=https%3A%2F%2Fucloud.bupt.edu.cn'
COOKIE=/tmp/ucloud-cas-cookie.txt
HTML=/tmp/ucloud-cas-login.html
HEADERS=/tmp/ucloud-cas-post.headers

USER='你的学号'
PASS='你的统一认证密码'

curl -sS -c "$COOKIE" -b "$COOKIE" "$LOGIN_URL" -o "$HTML"

EXECUTION=$(sed -n 's/.*name="execution" value="\([^"]*\)".*/\1/p' "$HTML" | head -n1)
TYPE=$(sed -n 's/.*name="type" value="\([^"]*\)".*/\1/p' "$HTML" | head -n1)
EVENT_ID=$(sed -n 's/.*name="_eventId" value="\([^"]*\)".*/\1/p' "$HTML" | head -n1)

curl -sS \
  -b "$COOKIE" \
  -c "$COOKIE" \
  -D "$HEADERS" \
  -o /tmp/ucloud-cas-post.html \
  -X POST "$LOGIN_URL" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "username=$USER" \
  --data-urlencode "password=$PASS" \
  --data-urlencode "type=${TYPE:-username_password}" \
  --data-urlencode "execution=$EXECUTION" \
  --data-urlencode "_eventId=${EVENT_ID:-submit}" \
  --data-urlencode "submit=LOGIN"

LOCATION=$(sed -n 's/^Location: //p' "$HEADERS" | tr -d '\r')
TICKET=$(printf '%s\n' "$LOCATION" | sed -n 's/.*[?&]ticket=\([^&]*\).*/\1/p')

curl -sS 'https://apiucloud.bupt.edu.cn/ykt-basics/oauth/token' \
  -X POST \
  -H 'Authorization: Basic cG9ydGFsOnBvcnRhbF9zZWNyZXQ=' \
  -H 'Tenant-Id: 000000' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "ticket=$TICKET" \
  --data-urlencode 'grant_type=third'
```

拿到 `access_token` 后调用接口：

```bash
BLADE_AUTH='<access_token>'

curl -sS 'https://apiucloud.bupt.edu.cn/ykt-basics/info' \
  -H "Blade-Auth: $BLADE_AUTH" \
  -H 'Authorization: Basic c3dvcmQ6c3dvcmRfc2VjcmV0' \
  -H 'Tenant-Id: 000000'
```

## TODO

目前已支持作业（bizType / type = 3），云平台还有另外两种任务类型未接入：

| 类型 | bizType | 说明 | 接口 |
|---|---|---|---|
| 问卷 | 2 | 待完成调查问卷 | `GET /ucloud/ykt-activity/survey/page/todo?level=1&size=9999999&userId=<userId>&siteId=<siteId>` |
| 测验 | 4 | 待完成在线测验 | `GET /ucloud/ykt-site/examination/list-stu?current=1&size=999999&status=-1&siteId=<siteId>&statusSelf=未提交&state=-1` |

此外还有一个聚合接口，可以一次性拉回三种类型的待办列表：

```text
GET /ucloud/ykt-site/site/student/undone?userId=<userId>
```

返回 `data.undoneList`，每条含 `activityId`、`type`（2/3/4）、`endTime`、`activityName`，已经关联好 `courseInfo`（`id`、`name`、`teachers`），不需要像 `/search` 那样遍历课程反向匹配。

远程路径：

| 代理路径 | 远程 |
|---|---|
| `/ucloud/ykt-site/site/student/undone?...` | `https://apiucloud.bupt.edu.cn/ykt-site/site/student/undone?...` |
| `/ucloud/ykt-activity/survey/page/todo?...` | `https://apiucloud.bupt.edu.cn/ykt-activity/survey/page/todo?...` |
| `/ucloud/ykt-site/examination/list-stu?...` | `https://apiucloud.bupt.edu.cn/ykt-site/examination/list-stu?...` |

## 致谢

以下内容已被隐匿。欢迎pr
