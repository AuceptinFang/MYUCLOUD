# MYUCLOUD

由于莫名奇妙的问题，我 Linux 下用 Firefox 死活登不进去，遂有此项目。

目前已支持：

- 课程列表与详情
- 作业列表与详情与提交

## 本地运行

本项目暂时无法静态部署，需要一个服务端，暂时只支持源码构建，方法如下

```sh
npm ci
npm run dev
```

然后打开 Vite 输出的本地地址，通常是：

```text
http://127.0.0.1:5173/
```

注意：`/api/login` 和 `/ucloud` 代理都依赖 Vite dev server。直接打开 `dist/index.html` 或只用静态托管都不能完成账号密码登录流程。

页面提供两种登录方式：

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

本项目的 Vite dev server 提供了一个本地封装接口，其他前端页面可以直接调用它，不需要自己处理 CAS cookie、隐藏字段和 ticket。

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

本项目里可以通过 Vite 代理请求：

```text
/ucloud/ykt-basics/info
```

对应远程：

```text
https://apiucloud.bupt.edu.cn/ykt-basics/info
```

### 已确认业务接口

本地开发时把远程 host 换成 `/ucloud`，由 Vite 代理到 `https://apiucloud.bupt.edu.cn`。

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

因此本地开发需要通过 Vite 代理转发：

```javascript
// vite.config.js
'/file': {
  target: 'https://fileucloud.bupt.edu.cn',
  changeOrigin: true,                        // 改写 Host 头
  rewrite: (path) => path.replace(/^\/file/, ''),  // /file/xxx → /xxx
  headers: {
    'Origin': 'https://ucloud.bupt.edu.cn',  // 伪装来源，绕过 CORS
    'Referer': 'https://ucloud.bupt.edu.cn/',
  },
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.removeHeader('Authorization'); // 剥离业务鉴权头
    });
  }
},
```

**关键点**：

- 请求走 Vite 代理后对浏览器是同源（`localhost:5173/file/...`），不存在 CORS 问题
- 在服务端设置 `Origin` / `Referer` 伪装成学校官网页面发起的请求，绕过防盗链

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
