import { fetchBackend, readBackendPayload, responseErrorMessage } from './http.js'
import { STATIC_PREVIEW, PREVIEW_MESSAGE, backendUrl } from '../utils/runtime.js'
import { uploadWithProgress } from './upload.js'

export const TOKEN_KEY = 'mock-ucloud-blade-auth'
export const DEFAULT_LOGIN_URL = '/api/login'
export const DEFAULT_DEBUG_URL = '/ucloud/ykt-basics/info'
export const BUSINESS_AUTH = 'Basic c3dvcmQ6c3dvcmRfc2VjcmV0'
export const TENANT_ID = '000000'

const API_PATHS = {
  userInfo: '/ucloud/ykt-basics/info',
  courses: '/ucloud/ykt-site/site/list/student/current',
  assignments: '/ucloud/ykt-site/work/student/list',
  surveyTodo: '/ucloud/ykt-activity/survey/page/todo',
  surveyDetail: '/ucloud/ykt-activity/survey/detail',
  surveySubmit: '/ucloud/ykt-activity/survey/submit-answer',
  quizzes: '/ucloud/ykt-site/examination/list-stu',
  assignmentDetail: '/ucloud/ykt-site/work/detail',
  assignmentSubmit: '/ucloud/ykt-site/work/submit',
  assignmentSubmitView: '/ucloud/ykt-site/work/submit-view',
  courseResources: '/ucloud/ykt-site/site-resource/tree/student',
  resourcesById: '/ucloud/blade-source/resource/list/byId',
  resourceUploadBiz: '/ucloud/blade-source/resource/upload/biz',
  resourcePreviewUrl: '/ucloud/blade-source/resource/preview-url',
}

export async function readResponse(response, options) {
  const { rawText, body } = await readBackendPayload(response, options)

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    redirected: response.redirected,
    headers: Object.fromEntries(response.headers.entries()),
    rawText,
    body,
  }
}

export function businessHeaders(token, extra = {}) {
  return {
    Accept: 'application/json',
    'Blade-Auth': token,
    Authorization: BUSINESS_AUTH,
    'Tenant-Id': TENANT_ID,
    ...extra,
  }
}

export function assertUcloudOk(result, label) {
  if (!result.ok) {
    throw new Error(responseErrorMessage(result, result.body, label))
  }

  if (result.body?.success === false || (result.body?.code && result.body.code !== 200)) {
    throw new Error(responseErrorMessage(result, result.body, label))
  }
}

export async function loginWithCredentials({ loginUrl = DEFAULT_LOGIN_URL, username, password }) {
  const request = {
    url: loginUrl,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: {
      username,
      password,
    },
  }
  const response = await fetchBackend(loginUrl, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export function pickToken(body) {
  const candidates = [
    body?.token,
    body?.access_token,
    body?.accessToken,
    body?.data?.token,
    body?.data?.access_token,
    body?.data?.accessToken,
    body?.result?.token,
    body?.result?.access_token,
    body?.result?.accessToken,
    body?.tokenResponse?.body?.access_token,
    body?.tokenResponse?.body?.accessToken,
  ]

  return candidates.find((value) => typeof value === 'string' && value.length > 0) || ''
}

export function isTokenExpired(result) {
  return !!(result && (result.status === 401 || result.body?.code === 401))
}

export async function getUserInfo(token) {
  const request = {
    url: API_PATHS.userInfo,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function getStudentCourses(token, userId) {
  const params = new URLSearchParams({
    userId,
    siteRoleCode: '2',
    current: '1',
    size: '9999',
  })
  const request = {
    url: `${API_PATHS.courses}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function getAssignments(token, { current = 1, size = 100, siteId = '' } = {}) {
  const body = {
    current,
    size,
  }
  if (siteId) {
    body.siteId = siteId
  }

  const request = {
    url: API_PATHS.assignments,
    method: 'POST',
    headers: businessHeaders(token, { 'Content-Type': 'application/json' }),
    body,
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  return {
    request,
    result: await readResponse(response),
  }
}

// 待填问卷。level 必填：1 课堂级、2 平台级；不带 siteId 时返回本人所有课程的问卷
export async function getTodoSurveys(token, { userId, level }) {
  const params = new URLSearchParams({
    level: String(level),
    current: '1',
    size: '9999',
    userId,
  })
  const request = {
    url: `${API_PATHS.surveyTodo}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

// 问卷详情，题目在 data.questionPage.records；官方页面每页 5 题，这里一次取完
export async function getSurveyDetail(token, surveyId) {
  const params = new URLSearchParams({
    id: surveyId,
    current: '1',
    size: '999',
  })
  const request = {
    url: `${API_PATHS.surveyDetail}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

// 提交整份问卷的答案，格式见 buildSurveyAnswers；提交后不能修改
export async function submitSurveyAnswers(token, answers) {
  const request = {
    url: API_PATHS.surveySubmit,
    method: 'POST',
    headers: businessHeaders(token, { 'Content-Type': 'application/json' }),
    body: answers,
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  return {
    request,
    result: await readResponse(response),
  }
}

// 测验列表必须带 siteId，只能按课程逐个查；statusSelf 只滤未提交，已经结束的也会返回
export async function getUnsubmittedQuizzes(token, siteId) {
  const params = new URLSearchParams({
    current: '1',
    size: '9999',
    status: '-1',
    state: '-1',
    statusSelf: '未提交',
    siteId,
  })
  const request = {
    url: `${API_PATHS.quizzes}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

const UCLASS_URL = 'https://ucloud.bupt.edu.cn/uclass'

// 问卷和测验要在官方页面作答，跳转地址和官方首页待办的一致
export function buildActivityUrl(item) {
  const id = encodeURIComponent(item?.activityId || '')
  if (!id) return ''
  if (item.kind === 'survey') return `${UCLASS_URL}/index.html#/student/survey/participateSurvey_fullpage?id=${id}`
  if (item.kind === 'quiz') return `${UCLASS_URL}/course.html#/answer?id=${id}`

  return ''
}

export async function getCourseResources(token, { siteId, userId }) {
  const params = new URLSearchParams({
    siteId,
    userId,
  })
  const request = {
    url: `${API_PATHS.courseResources}?${params}`,
    method: 'POST',
    headers: businessHeaders(token, { 'Content-Type': 'application/json' }),
    body: {},
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function getAssignmentDetail(token, assignmentId) {
  const params = new URLSearchParams({
    assignmentId,
  })
  const request = {
    url: `${API_PATHS.assignmentDetail}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function getResourcesById(token, resourceId) {
  const params = new URLSearchParams({
    resourceIds: resourceId,
  })
  const request = {
    url: `${API_PATHS.resourcesById}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function submitAssignment(token, payload) {
  const request = {
    url: API_PATHS.assignmentSubmit,
    method: 'POST',
    headers: businessHeaders(token, { 'Content-Type': 'application/json' }),
    body: payload,
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function getAssignmentSubmitView(token, assignmentId) {
  const params = new URLSearchParams({
    assignmentId,
  })
  const request = {
    url: `${API_PATHS.assignmentSubmitView}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function uploadBusinessResource(token, { file, userId, bizType = 3, onProgress, signal }) {
  if (STATIC_PREVIEW) throw new Error(PREVIEW_MESSAGE)
  const formData = new FormData()
  formData.append('file', file)
  formData.append('userId', String(userId))
  formData.append('userld', String(userId))
  formData.append('bizType', String(bizType))

  const request = {
    url: API_PATHS.resourceUploadBiz,
    method: 'POST',
    headers: businessHeaders(token),
    body: {
      file: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified,
      },
      userId: String(userId),
      userld: String(userId),
      bizType: String(bizType),
    },
  }
  const response = await uploadWithProgress(request.url, {
    headers: request.headers,
    body: formData,
    onProgress,
    signal,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export function pickPreviewData(body) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object') return { previewUrl: '', onlinePreview: '' }

  return {
    previewUrl: typeof data.previewUrl === 'string' ? data.previewUrl : '',
    onlinePreview: typeof data.onlinePreview === 'string' ? data.onlinePreview : '',
  }
}

export function isVideoResource({ previewUrl = '', ext = '', mimeType = '', name = '' } = {}) {
  if (/^video\//i.test(mimeType)) return true

  const videoExtension = /\.(mp4|m4v|webm|ogv|ogg|mov|avi|mkv|wmv|flv|mpeg|mpg|3gp)$/i
  return videoExtension.test(`.${String(ext).replace(/^\./, '')}`)
    || videoExtension.test(name)
    || videoExtension.test(previewUrl.split(/[?#]/, 1)[0])
}

// 保留路径和查询参数，由配置的后端代理设置来源头。
export function buildFileUrl(url = '') {
  return backendUrl(url.replace(/^https?:\/\/fileucloud\.bupt\.edu\.cn(?=\/)/i, '/file'))
}

// 把后端返回的 onlinePreview / previewUrl 拼成本站可直开的预览地址。
// onlinePreview 形如 https://ucloud.bupt.edu.cn/office/?ssl=1&n=1&bclr=000&furl=
// 经后端 /office 代理转发，绕开 course.html 的强制登录与跨域。
export function buildPreviewUrl({ previewUrl, onlinePreview } = {}) {
  if (!previewUrl) return ''

  const base = (
    onlinePreview || 'https://ucloud.bupt.edu.cn/office/?ssl=1&n=1&bclr=000&furl='
  ).replace('https://ucloud.bupt.edu.cn', '')

  return backendUrl(`${base}${encodeURIComponent(previewUrl)}`)
}

export async function getResourcePreviewUrl(token, resourceId) {
  const params = new URLSearchParams({ resourceId })
  const request = {
    url: `${API_PATHS.resourcePreviewUrl}?${params}`,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function sendDebugRequest(token, url) {
  const request = {
    url,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetchBackend(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response, { allowText: true }),
  }
}
