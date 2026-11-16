// `myu guide` 打印的说明，写给 agent 看
export const GUIDE = `# MYUCLOUD 命令行（给 agent 用）

用这个工具代替网页操作北邮 UCloud（课程、作业、问卷、测验）。所有命令输出 JSON；出错时向 stderr 输出 {"error": ...} 并以状态码 1 退出。
请求经 MYUCLOUD 后端转发到学校接口，凭证保存在 ~/.myucloud/session.json，过期时会自动用 refresh_token 续期。

调用方式：node ~/.myucloud/myu.mjs <命令> [参数]

## 必须遵守

1. 凭证只用于这个工具。不要打印、转发 token，也不要写进其他文件。
2. 带 --confirm 的命令会真实提交（作业、问卷、交卷）或开始测验计时，而且无法撤回。先不加 --confirm 运行一遍预演，把将要提交的内容给用户看；得到用户明确同意后，再加 --confirm 运行。
3. 测验和问卷的答案要由用户决定或确认，不要擅自替用户作答后提交。
4. 凭证失效（提示重新登录）时，请用户在 MYUCLOUD 网页重新登录，再点「复制给 Agent」。不要索要密码。

## 命令

账户
- whoami：当前账号
- auth <token> [--refresh <refresh_token>] [--backend <地址>]：保存凭证
- logout：删除本地凭证

浏览
- courses：本学期课程 [{id, name, teachers, term}]
- todo [--all]：待办，作业、问卷、测验合在一起按紧急程度排序。kind 为 assignment/survey/quiz，id 用于下面的命令；加 --all 时也列出已完成和往期未交的
- resources <课程id>：课程资料，展平成 [{path, kind: file|link, name, resourceId, url}]
- download <资源id> [--out 目录或文件]：下载课程资料或作业附件，默认存到当前目录

作业
- assignment <作业id>：作业要求、附件和本人的提交情况
- assignment-submit <作业id> [--content 文本] [--file 路径]... [--confirm]：提交作业，--file 可重复。重新提交会覆盖上一次。提交后会查询提交记录确认

问卷
- survey <问卷id>：题目。type 为 单选/多选/主观，选项用 opt 字母表示
- survey-submit <问卷id> --answers '{"题目id":"B","题目id2":["A","C"],"题目id3":"文字"}' [--confirm]：必须全部作答，主观题不超过 200 字，提交后不能修改

测验
- quiz <测验id>：时长、是否允许重复作答、是否已提交、成绩。不会开始计时
- quiz-start <测验id> [--confirm]：进入试卷，开始计时，返回题目和剩余秒数。作答中再次进入不会重新计时；已提交且允许重复作答的测验会开始新的一次作答
- quiz-save <测验id> --answers '{"题目id":["A"],"题目id2":["A","C"],"填空题id":["空1","空2"],"主观题id":"文字"}'：逐题保存，可多次运行，后一次覆盖前一次。选择题传选项 key（A、B…）或选项 id，判断题同样选 A/B。返回仍未保存的题目
- quiz-submit <测验id> [--confirm] [--allow-incomplete]：交卷。有未保存的题目时默认拒绝
- quiz-result <测验id>：已交测验的卷面，包括得分、每题对错和正确选项（老师开放时才有）

其他
- api <GET|POST> <路径> [--body JSON] [--query k=v]...：直接调用学校接口，路径不带 /ucloud 前缀，例如 api GET /ykt-basics/info。只读查询可以直接用；会改动数据的请求同样要先征得用户同意
- guide：显示本说明

## 说明

- 时间都是北京时间。daysLeft 为负表示已截止
- 主观题附件、不支持的题型，请用户到官方页面完成：
  问卷 https://ucloud.bupt.edu.cn/uclass/index.html#/student/survey/participateSurvey_fullpage?id=<问卷id>
  测验 https://ucloud.bupt.edu.cn/uclass/course.html#/answer?id=<测验id>
- 环境变量：MYU_BACKEND 指定后端地址，MYU_HOME 指定凭证目录
`
