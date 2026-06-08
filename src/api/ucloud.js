export const TOKEN_KEY = 'mock-ucloud-blade-auth'
export const DEFAULT_LOGIN_URL = '/api/login'
export const DEFAULT_DEBUG_URL = '/ucloud/ykt-basics/info'
export const BUSINESS_AUTH = 'Basic c3dvcmQ6c3dvcmRfc2VjcmV0'
export const TENANT_ID = '000000'

const API_PATHS = {
  userInfo: '/ucloud/ykt-basics/info',
  courses: '/ucloud/ykt-site/site/list/student/current',
  assignments: '/ucloud/ykt-site/work/student/list',
  assignmentDetail: '/ucloud/ykt-site/work/detail',
  assignmentSubmit: '/ucloud/ykt-site/work/submit',
  assignmentSubmitView: '/ucloud/ykt-site/work/submit-view',
  courseResources: '/ucloud/ykt-site/site-resource/tree/student',
  resourcesById: '/ucloud/blade-source/resource/list/byId',
  resourceUploadBiz: '/ucloud/blade-source/resource/upload/biz',
}

function parseBody(text) {
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function readResponse(response) {
  const rawText = await response.text()

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    redirected: response.redirected,
    headers: Object.fromEntries(response.headers.entries()),
    rawText,
    body: parseBody(rawText),
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
    throw new Error(`${label} HTTP ${result.status}`)
  }

  if (result.body?.code && result.body.code !== 200) {
    throw new Error(result.body?.msg || `${label} code ${result.body.code}`)
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
  const response = await fetch(loginUrl, {
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

export async function getUserInfo(token) {
  const request = {
    url: API_PATHS.userInfo,
    method: 'GET',
    headers: businessHeaders(token),
  }
  const response = await fetch(request.url, {
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
  const response = await fetch(request.url, {
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
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: JSON.stringify(request.body),
  })

  return {
    request,
    result: await readResponse(response),
  }
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
  const response = await fetch(request.url, {
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
  const response = await fetch(request.url, {
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
  const response = await fetch(request.url, {
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
  const response = await fetch(request.url, {
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
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}

export async function uploadBusinessResource(token, { file, userId, bizType = 3 }) {
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
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: formData,
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
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
  })

  return {
    request,
    result: await readResponse(response),
  }
}
