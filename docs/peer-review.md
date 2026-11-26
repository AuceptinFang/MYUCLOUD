# 查看待办并完成互评

首页待办中的「互评」是独立任务：提交自己的作业不会把评阅别人的作业标为完成。待评数只统计互评期内已交、未评且学校允许进入的记录。当前可评数为零时不列入待办，不因此标为已完成；已截止的未评任务归入往期，全部评完后归入已完成。部分接口读取失败时保留上次结果并提示刷新。

打开互评任务，或在个人作业详情中选择「作业互评」，可以查看教师规则、评阅期限、分配给你的作业、提交内容和附件，以及学校返回的收到的互评。评分与官方相同：1–5 星，评语最多 200 字。匿名记录不补查作者身份。

「一键互评」读取完整名单，只选择未评且学校允许评阅的记录。先阅读作业，再选择统一星级和评语；页面列出份数和名单，点击「核对提交」后仍需点击「确认一键互评」。已有评分不覆盖。提交逐份执行并回读学校记录；失败或结果未确认时立即停止，不自动重发写请求。名单发生变化时需要刷新并重新确认。

## 接口契约

从官方 `course.3b66a1e759c394024404.js` 引用的 `49.82497c0523bf44da63d7.js`、`55.f06acec32b69a933cc2a.js` 核对（2026-11-25）：

| 用途 | 方法与路径（经本站 `/ucloud` 代理） |
| --- | --- |
| 分配给我的互评作业 | `POST /ykt-site/work/evaluation-list?assignmentId=...&current=1&size=100` |
| 互评作业详情 | `GET /ykt-site/work/evaluation-view?id=...` |
| 提交评分 | `POST /ykt-site/work/evaluation-submit?id=...&score=...&evaluation=...` |

两项 POST 接口使用查询参数，不发送 JSON 请求体。列表在 `data.records`，总数在 `data.total`；记录使用 `id`、`isEvaluated`、`canEnter`、`score`、`evaluation`。详情使用 `assignmentContent`、`attachmentIds`、`score`、`evaluation`。作业详情的 `assignmentMutualEvaluation` 提供规则与起止时间；`submit-view` 的 `evaluationInfos` 提供收到的评语。仅 `assignmentType=0` 且 `isOpenEvaluation=1` 开放入口。

自动化测试使用上述公开代码契约构造的模拟响应；真实学校账号的互评分配、附件权限及最终写入仍须在实际开放的互评中验收。
