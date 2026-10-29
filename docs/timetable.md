# 课表与教务登录

[返回 README](../README.md)

## 登录与同步

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
