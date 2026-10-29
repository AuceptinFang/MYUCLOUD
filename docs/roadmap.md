# 待接入功能

[返回 README](../README.md)

## 问卷与测验

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
