<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  BUSINESS_AUTH,
  DEFAULT_DEBUG_URL,
  DEFAULT_LOGIN_URL,
  TENANT_ID,
  TOKEN_KEY,
  assertUcloudOk,
  isTokenExpired,
  businessHeaders,
  getAssignments,
  getAssignmentDetail,
  getAssignmentSubmitView,
  getCourseResources,
  getResourcesById,
  getStudentCourses,
  getUserInfo,
  loginWithCredentials,
  pickToken,
  sendDebugRequest,
  submitAssignment,
  uploadBusinessResource,
} from './api/ucloud'
import AuthBar from './components/common/AuthBar.vue'
import AssignmentDetailPanel from './components/common/AssignmentDetailPanel.vue'
import CourseGrid from './components/common/CourseGrid.vue'
import CourseResourcePanel from './components/common/CourseResourcePanel.vue'
import DeadlineList from './components/common/DeadlineList.vue'
import DebugPanel from './components/common/DebugPanel.vue'
import AppShell from './components/layout/AppShell.vue'
import { normalizeAssignment, sortAssignments } from './utils/deadline'

const ASSIGNMENT_FETCH_SIZE = 9999

const activeView = ref(getViewFromHash())
const routeCourseId = ref(getRouteCourseId())
const routeAssignmentId = ref(getRouteAssignmentId())
const username = ref('')
const password = ref('')
const loginUrl = ref(DEFAULT_LOGIN_URL)
const bladeToken = ref(localStorage.getItem(TOKEN_KEY) || '')
const apiUrl = ref(DEFAULT_DEBUG_URL)
const logs = ref([])
const loggingIn = ref(false)
const requesting = ref(false)
const loadingStudy = ref(false)
const loadingCourseId = ref('')
const loadingCourseAssignments = ref(false)
const loadingAssignmentId = ref('')
const studyError = ref('')
const userInfo = ref(null)
const courses = ref([])
const selectedCourse = ref(null)
const activeCoursePanel = ref('resources')
const courseResources = ref([])
const courseResourceError = ref('')
const courseAssignments = ref([])
const courseAssignmentError = ref('')
const selectedAssignment = ref(null)
const assignmentDetail = ref(null)
const assignmentSubmitView = ref(null)
const assignmentResources = ref([])
const assignmentDetailError = ref('')
const assignmentSubmitError = ref('')
const assignmentSubmitResult = ref(null)
const submittingAssignment = ref(false)
const assignments = ref([])
const includeCompleted = ref(false)
const assignmentPageSize = ref(20)
const lastLoadedAt = ref('')
let courseResourceRequestId = 0
let courseAssignmentRequestId = 0
let assignmentDetailRequestId = 0

const pendingAssignments = computed(() =>
  assignments.value.filter((assignment) => !assignment.isCompleted),
)
const urgentAssignments = computed(() =>
  pendingAssignments.value.filter((assignment) => assignment.level === 'danger' || assignment.level === 'warning'),
)
const overdueAssignments = computed(() =>
  pendingAssignments.value.filter((assignment) => assignment.level === 'overdue'),
)
const visibleAssignments = computed(() =>
  assignments.value
    .filter((assignment) => includeCompleted.value || !assignment.isCompleted)
    .slice(0, Number(assignmentPageSize.value) || 20),
)
const userLabel = computed(
  () => userInfo.value?.realName || userInfo.value?.name || userInfo.value?.account || '未登录',
)
const authPreview = computed(() => businessHeaders(bladeToken.value))
const selectedCourseId = computed(() => getCourseId(selectedCourse.value))
const selectedAssignmentId = computed(() => getAssignmentId(selectedAssignment.value))
const shellSubtitle = computed(() => {
  if (activeView.value === 'course') return '课程资料'
  if (activeView.value === 'assignment') return '作业详情'
  if (activeView.value === 'debug') return '接口调试'

  return '课程与待办作业'
})

function setView(view) {
  activeView.value = view
  if (view === 'debug') {
    window.location.hash = '#debug'
    return
  }

  window.location.hash = '#study'
}

function getCourseId(course) {
  return String(course?.id || course?.siteId || '')
}

function getAssignmentId(assignment) {
  return String(assignment?.id || assignment?.resourceId || assignment?.raw?.id || '')
}

function getCourseName(course) {
  return course?.siteName || course?.name || '未命名课程'
}

function getViewFromHash() {
  if (window.location.hash === '#debug') return 'debug'
  if (window.location.hash.startsWith('#course/')) return 'course'
  if (window.location.hash.startsWith('#assignment/')) return 'assignment'

  return 'study'
}

function getRouteCourseId() {
  if (!window.location.hash.startsWith('#course/')) return ''

  return decodeURIComponent(window.location.hash.slice('#course/'.length))
}

function getRouteAssignmentId() {
  if (!window.location.hash.startsWith('#assignment/')) return ''

  return decodeURIComponent(window.location.hash.slice('#assignment/'.length))
}

function setCourseHash(courseId) {
  window.location.hash = `#course/${encodeURIComponent(courseId)}`
}

function setAssignmentHash(assignmentId) {
  window.location.hash = `#assignment/${encodeURIComponent(assignmentId)}`
}

function log(label, data = {}) {
  const item = {
    time: new Date().toISOString(),
    label,
    data,
  }

  logs.value.unshift(item)
  console.groupCollapsed(`[mock-ucloud] ${item.time} ${label}`)
  console.log(data)
  console.groupEnd()
}

function logError(label, error) {
  log(label, {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
  })
}

function resetCourseResources() {
  courseResourceRequestId += 1
  selectedCourse.value = null
  courseResources.value = []
  courseResourceError.value = ''
  loadingCourseId.value = ''
}

function resetCourseAssignments() {
  courseAssignmentRequestId += 1
  courseAssignments.value = []
  courseAssignmentError.value = ''
  loadingCourseAssignments.value = false
}

function resetAssignmentDetail() {
  assignmentDetailRequestId += 1
  selectedAssignment.value = null
  assignmentDetail.value = null
  assignmentSubmitView.value = null
  assignmentResources.value = []
  assignmentDetailError.value = ''
  assignmentSubmitError.value = ''
  assignmentSubmitResult.value = null
  submittingAssignment.value = false
  loadingAssignmentId.value = ''
}

function syncViewFromHash() {
  activeView.value = getViewFromHash()
  routeCourseId.value = getRouteCourseId()
  routeAssignmentId.value = getRouteAssignmentId()

  if (activeView.value === 'course' && routeCourseId.value) {
    if (getCourseId(selectedCourse.value) === routeCourseId.value) return

    const matchedCourse = courses.value.find((course) => getCourseId(course) === routeCourseId.value)
    if (matchedCourse) {
      loadCourseResources(matchedCourse)
    }
    return
  }

  if (activeView.value === 'assignment' && routeAssignmentId.value) {
    if (getAssignmentId(selectedAssignment.value) === routeAssignmentId.value) return

    const matchedAssignment = assignments.value.find(
      (assignment) => getAssignmentId(assignment) === routeAssignmentId.value,
    )
    if (matchedAssignment) {
      loadAssignmentResources(matchedAssignment)
    }
  }
}

function extractAssignmentDetailResources(body) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object') return []

  const candidates = [
    data.assignmentResource,
    data.attachmentVOs,
    data.attachmentList,
    data.attachments,
    data.submitAttachments,
    data.submitAttachmentList,
    data.workAttachments,
    data.workAttachmentList,
    data.resources,
    data.resourceList,
    data.files,
    data.fileList,
  ]

  return candidates.find((value) => Array.isArray(value)) || []
}

function extractSubmitViewAttachmentIds(body) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object' || !Array.isArray(data.attachmentIds)) return []

  return [...new Set(data.attachmentIds.map((id) => String(id)).filter(Boolean))]
}

function extractResourceList(body) {
  const data = body?.data ?? body
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.records)) return data.records
  if (typeof data === 'object') return [data]

  return []
}

function getResourceIdentity(item) {
  const resource = item?.resource || item?.file || item || {}

  return String(
    resource.id ||
      resource.resourceId ||
      resource.fileId ||
      item?.id ||
      item?.resourceId ||
      item?.fileId ||
      resource.url ||
      resource.link ||
      '',
  )
}

function mergeAssignmentResources(resources) {
  const seen = new Set()

  assignmentResources.value = [...assignmentResources.value, ...resources].filter((resource, index) => {
    const identity = getResourceIdentity(resource) || `fallback-${index}`
    if (seen.has(identity)) return false

    seen.add(identity)
    return true
  })
}

function formatBackendTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
}

function pickSubmitTime(body) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object') return ''

  return (
    data.submitTime ||
    data.commitTime ||
    data.updateTime ||
    data.createTime ||
    data.submitAt ||
    ''
  )
}

function hasSubmitViewResult(body, assignmentId) {
  const data = body?.data ?? body
  if (!data || typeof data !== 'object') return false

  if (String(data.assignmentId || '') === String(assignmentId)) return true

  return Boolean(
    data.assignmentContent ||
      data.assignmentComment ||
      (Array.isArray(data.attachmentIds) && data.attachmentIds.length > 0),
  )
}

function patchSubmittedAssignment(assignment, submitTime) {
  if (!assignment) return assignment

  return {
    ...assignment,
    submitTime: assignment.submitTime || submitTime,
    level: 'submitted',
    isCompleted: true,
    isUrgent: false,
    isOverdue: false,
    status: '已提交',
    raw: {
      ...(assignment.raw || {}),
      status: 3,
      submitTime: assignment.raw?.submitTime || submitTime,
    },
  }
}

function patchSubmittedList(list, assignmentId, submitTime) {
  return sortAssignments(
    list.map((assignment) =>
      getAssignmentId(assignment) === assignmentId
        ? patchSubmittedAssignment(assignment, submitTime)
        : assignment,
    ),
  )
}

function buildKnownAssignmentMap() {
  return new Map(
    [...assignments.value, ...courseAssignments.value, selectedAssignment.value]
      .filter(Boolean)
      .map((assignment) => [getAssignmentId(assignment), assignment]),
  )
}

function normalizeAssignmentWithKnownCourse(record, knownAssignments) {
  const assignmentId = String(record.id || '')
  const known = knownAssignments.get(assignmentId) || {}

  return normalizeAssignment({
    ...record,
    siteId: record.siteId || record.courseId || known.courseId,
    siteName: record.siteName || record.courseName || known.courseName,
  })
}

function markAssignmentSubmitted(assignmentId, submitTime) {
  assignments.value = patchSubmittedList(assignments.value, assignmentId, submitTime)
  courseAssignments.value = patchSubmittedList(courseAssignments.value, assignmentId, submitTime)

  if (getAssignmentId(selectedAssignment.value) === assignmentId) {
    selectedAssignment.value = patchSubmittedAssignment(selectedAssignment.value, submitTime)
  }

  if (assignmentDetail.value) {
    assignmentDetail.value = {
      ...assignmentDetail.value,
      status: 3,
      submitTime: assignmentDetail.value.submitTime || submitTime,
    }
  }

  lastLoadedAt.value = new Date().toLocaleString()
  log('study:assignment-submit:local-sync', {
    assignmentId,
    submitTime,
  })
}

async function refreshAssignmentsAfterSubmit(assignmentId, submitTime) {
  try {
    const knownAssignments = buildKnownAssignmentMap()
    const assignmentCall = await getAssignments(bladeToken.value, {
      current: 1,
      size: ASSIGNMENT_FETCH_SIZE,
    })

    log('study:assignments-after-submit:start', assignmentCall.request)
    log('study:assignments-after-submit:response', assignmentCall.result)
    checkAuth(assignmentCall.result, '提交后作业列表')

    assignments.value = sortAssignments(
      (assignmentCall.result.body?.data?.records || []).map((record) => {
        const normalized = normalizeAssignmentWithKnownCourse(record, knownAssignments)

        return getAssignmentId(normalized) === assignmentId && !normalized.isCompleted
          ? patchSubmittedAssignment(normalized, submitTime)
          : normalized
      }),
    )

    const refreshedAssignment = assignments.value.find(
      (assignment) => getAssignmentId(assignment) === assignmentId,
    )

    if (refreshedAssignment) {
      selectedAssignment.value = refreshedAssignment
    }

    lastLoadedAt.value = new Date().toLocaleString()
    log('study:assignments-after-submit:sync', {
      assignmentId,
      foundInList: Boolean(refreshedAssignment),
      count: assignments.value.length,
    })
  } catch (error) {
    logError('study:assignments-after-submit:error', error)
  }
}

async function buildAssignmentCourseMap(courseRecords) {
  const pairs = await Promise.all(
    courseRecords.map(async (course) => {
      const courseId = getCourseId(course)
      if (!courseId) return []

      try {
        const assignmentCall = await getAssignments(bladeToken.value, {
          current: 1,
          size: 9999,
          siteId: courseId,
        })
        log('study:assignment-course-map:start', assignmentCall.request)
        log('study:assignment-course-map:response', assignmentCall.result)
        checkAuth(assignmentCall.result, '课程作业映射')

        return (assignmentCall.result.body?.data?.records || []).map((record) => [
          String(record.id || ''),
          {
            courseId,
            courseName: getCourseName(course),
          },
        ])
      } catch (error) {
        logError('study:assignment-course-map:error', error)
        return []
      }
    }),
  )

  return new Map(pairs.flat().filter(([assignmentId]) => assignmentId))
}

function maskLoginRequest(request) {
  return {
    ...request,
    body: {
      username: request.body?.username || '',
      password: request.body?.password
        ? {
            present: true,
            length: request.body.password.length,
          }
        : {
            present: false,
            length: 0,
          },
    },
  }
}

function normalizeBladeTokenInput(value) {
  return String(value || '')
    .trim()
    .replace(/^Blade-Auth:\s*/i, '')
    .replace(/^Bearer\s+/i, '')
    .trim()
}

function saveBladeToken(nextToken, source) {
  bladeToken.value = nextToken
  localStorage.setItem(TOKEN_KEY, nextToken)
  log('auth:blade-token-saved', {
    source,
    token: nextToken,
    storageKey: TOKEN_KEY,
  })
}

async function login() {
  loggingIn.value = true

  try {
    const { request, result } = await loginWithCredentials({
      loginUrl: loginUrl.value,
      username: username.value,
      password: password.value,
    })

    log('login:start', maskLoginRequest(request))
    log('login:response', result)

    const nextToken = pickToken(result.body)
    if (!nextToken) {
      log('auth:no-token-found', {
        triedFields: [
          'token',
          'access_token',
          'accessToken',
          'data.token',
          'data.access_token',
          'data.accessToken',
          'result.token',
          'result.access_token',
          'result.accessToken',
          'tokenResponse.body.access_token',
        ],
      })
      return
    }

    saveBladeToken(nextToken, 'password-login')

    await loadStudyData()
  } catch (error) {
    logError('login:error', error)
  } finally {
    loggingIn.value = false
  }
}

async function loginWithBladeAuth() {
  const nextToken = normalizeBladeTokenInput(bladeToken.value)

  if (!nextToken) {
    studyError.value = '请先粘贴 Blade-Auth'
    log('auth:manual-token-empty')
    return
  }

  saveBladeToken(nextToken, 'manual-blade-auth')
  await loadStudyData()
}

async function loadStudyData() {
  if (!bladeToken.value) {
    studyError.value = '需要先登录或粘贴 Blade-Auth'
    return
  }

  loadingStudy.value = true
  studyError.value = ''
  resetCourseResources()
  resetCourseAssignments()
  resetAssignmentDetail()

  try {
    const userCall = await getUserInfo(bladeToken.value)
    log('study:user-info:start', userCall.request)
    log('study:user-info:response', userCall.result)
    checkAuth(userCall.result, '用户信息')

    const user = userCall.result.body?.data || null
    if (!user?.id) {
      throw new Error('用户信息里没有 id')
    }
    userInfo.value = user

    const courseCall = await getStudentCourses(bladeToken.value, user.id)
    log('study:courses:start', courseCall.request)
    log('study:courses:response', courseCall.result)
    checkAuth(courseCall.result, '课程列表')
    courses.value = courseCall.result.body?.data?.records || []
    const assignmentCourseMap = await buildAssignmentCourseMap(courses.value)

    const assignmentCall = await getAssignments(bladeToken.value, {
      current: 1,
      size: ASSIGNMENT_FETCH_SIZE,
    })
    log('study:assignments:start', assignmentCall.request)
    log('study:assignments:response', assignmentCall.result)
    checkAuth(assignmentCall.result, '作业列表')
    assignments.value = sortAssignments(
      (assignmentCall.result.body?.data?.records || []).map((record) => {
        const course = assignmentCourseMap.get(String(record.id || '')) || {}

        return normalizeAssignment({
          ...record,
          siteId: course.courseId,
          siteName: course.courseName,
        })
      }),
    )

    lastLoadedAt.value = new Date().toLocaleString()
    syncViewFromHash()
  } catch (error) {
    studyError.value = error?.message || '加载失败'
    logError('study:error', error)
  } finally {
    loadingStudy.value = false
  }
}

async function loadCourseResources(course) {
  const courseId = getCourseId(course)

  selectedCourse.value = course
  courseResources.value = []
  courseResourceError.value = ''

  if (!bladeToken.value) {
    courseResourceError.value = '需要先登录或粘贴 Blade-Auth'
    return
  }
  if (!userInfo.value?.id) {
    courseResourceError.value = '需要先加载用户信息'
    return
  }
  if (!courseId) {
    courseResourceError.value = '课程数据里没有 id'
    return
  }

  const requestId = courseResourceRequestId + 1
  courseResourceRequestId = requestId
  loadingCourseId.value = courseId

  try {
    const resourceCall = await getCourseResources(bladeToken.value, {
      siteId: courseId,
      userId: userInfo.value.id,
    })

    log('study:course-resources:start', resourceCall.request)
    log('study:course-resources:response', resourceCall.result)
    checkAuth(resourceCall.result, '课程资料')

    if (requestId !== courseResourceRequestId) return

    courseResources.value = Array.isArray(resourceCall.result.body?.data)
      ? resourceCall.result.body.data
      : []
  } catch (error) {
    if (requestId !== courseResourceRequestId) return

    courseResourceError.value = error?.message || '加载课程资料失败'
    logError('study:course-resources:error', error)
  } finally {
    if (requestId === courseResourceRequestId) {
      loadingCourseId.value = ''
    }
  }
}

async function loadCourseAssignments(course = selectedCourse.value) {
  const courseId = getCourseId(course)

  activeCoursePanel.value = 'assignments'
  selectedCourse.value = course
  courseAssignments.value = []
  courseAssignmentError.value = ''

  if (!bladeToken.value) {
    courseAssignmentError.value = '需要先登录或粘贴 Blade-Auth'
    return
  }
  if (!courseId) {
    courseAssignmentError.value = '课程数据里没有 id'
    return
  }

  const requestId = courseAssignmentRequestId + 1
  courseAssignmentRequestId = requestId
  loadingCourseAssignments.value = true

  try {
    const assignmentCall = await getAssignments(bladeToken.value, {
      current: 1,
      size: 9999,
      siteId: courseId,
    })

    log('study:course-assignments:start', assignmentCall.request)
    log('study:course-assignments:response', assignmentCall.result)
    checkAuth(assignmentCall.result, '课程作业')

    if (requestId !== courseAssignmentRequestId) return

    courseAssignments.value = sortAssignments(
      (assignmentCall.result.body?.data?.records || []).map((record) =>
        normalizeAssignment({
          ...record,
          siteId: courseId,
          siteName: getCourseName(course),
        }),
      ),
    )
  } catch (error) {
    if (requestId !== courseAssignmentRequestId) return

    courseAssignmentError.value = error?.message || '加载课程作业失败'
    logError('study:course-assignments:error', error)
  } finally {
    if (requestId === courseAssignmentRequestId) {
      loadingCourseAssignments.value = false
    }
  }
}

async function loadAssignmentSubmitView(assignmentId, requestId) {
  try {
    const submitViewCall = await getAssignmentSubmitView(bladeToken.value, assignmentId)

    log('study:assignment-submit-view:start', submitViewCall.request)
    log('study:assignment-submit-view:response', submitViewCall.result)

    if (requestId !== assignmentDetailRequestId) return

    assignmentSubmitView.value = submitViewCall.result.body?.data ?? submitViewCall.result.body ?? null

    if (!submitViewCall.result.ok) {
      return
    }

    if (hasSubmitViewResult(submitViewCall.result.body, assignmentId)) {
      const submitTime = pickSubmitTime(submitViewCall.result.body) || selectedAssignment.value?.submitTime || ''
      markAssignmentSubmitted(assignmentId, submitTime)
      await loadSubmitAttachmentResources(extractSubmitViewAttachmentIds(submitViewCall.result.body), requestId)
    }
  } catch (error) {
    logError('study:assignment-submit-view:error', error)
  }
}

async function loadAssignmentResourceDetails(rawResources, requestId) {
  assignmentResources.value = []

  const resourceIds = rawResources
    .map((r) => r.resourceId || r.id)
    .filter(Boolean)

  if (resourceIds.length === 0) {
    assignmentResources.value = rawResources
    return
  }

  try {
    const resourceCall = await getResourcesById(bladeToken.value, resourceIds.join(','))

    log('study:assignment-resource-details:start', resourceCall.request)
    log('study:assignment-resource-details:response', resourceCall.result)
    checkAuth(resourceCall.result, '作业资源详情')

    if (requestId !== assignmentDetailRequestId) return

    const fullResources = extractResourceList(resourceCall.result.body)
    assignmentResources.value = fullResources.length > 0 ? fullResources : rawResources
  } catch (error) {
    logError('study:assignment-resource-details:error', error)
    if (requestId === assignmentDetailRequestId) {
      assignmentResources.value = rawResources
    }
  }
}

async function loadSubmitAttachmentResources(attachmentIds, requestId) {
  if (attachmentIds.length === 0) return

  try {
    const resources = []

    for (const attachmentId of attachmentIds) {
      const resourceCall = await getResourcesById(bladeToken.value, attachmentId)

      log('study:submit-attachment-resource:start', resourceCall.request)
      log('study:submit-attachment-resource:response', resourceCall.result)
      checkAuth(resourceCall.result, '提交附件资源')

      resources.push(...extractResourceList(resourceCall.result.body))
    }

    if (requestId !== assignmentDetailRequestId) return

    mergeAssignmentResources(resources)
  } catch (error) {
    logError('study:submit-attachment-resource:error', error)
  }
}

async function loadAssignmentResources(assignment) {
  const assignmentId = getAssignmentId(assignment)

  selectedAssignment.value = assignment
  assignmentDetail.value = null
  assignmentSubmitView.value = null
  assignmentResources.value = []
  assignmentDetailError.value = ''
  assignmentSubmitError.value = ''
  assignmentSubmitResult.value = null

  if (!bladeToken.value) {
    assignmentDetailError.value = '需要先登录或粘贴 Blade-Auth'
    return
  }
  if (!assignmentId) {
    assignmentDetailError.value = '作业数据里没有 id'
    return
  }

  const requestId = assignmentDetailRequestId + 1
  assignmentDetailRequestId = requestId
  loadingAssignmentId.value = assignmentId

  try {
    const detailCall = await getAssignmentDetail(bladeToken.value, assignmentId)

    log('study:assignment-detail:start', detailCall.request)
    log('study:assignment-detail:response', detailCall.result)
    checkAuth(detailCall.result, '作业详情')

    if (requestId !== assignmentDetailRequestId) return

    assignmentDetail.value = detailCall.result.body?.data || null
    const rawResources = extractAssignmentDetailResources(detailCall.result.body)
    await loadAssignmentResourceDetails(rawResources, requestId)
    await loadAssignmentSubmitView(assignmentId, requestId)
  } catch (error) {
    if (requestId !== assignmentDetailRequestId) return

    assignmentDetailError.value = error?.message || '加载作业详情失败'
    logError('study:assignment-detail:error', error)
  } finally {
    if (requestId === assignmentDetailRequestId) {
      loadingAssignmentId.value = ''
    }
  }
}

function openCourse(course) {
  const courseId = getCourseId(course)

  selectedCourse.value = course
  activeCoursePanel.value = 'resources'
  resetCourseAssignments()
  activeView.value = 'course'
  routeCourseId.value = courseId
  if (courseId) {
    setCourseHash(courseId)
  }

  loadCourseResources(course)
}

function showCourseResources() {
  activeCoursePanel.value = 'resources'

  if (selectedCourse.value && courseResources.value.length === 0 && !loadingCourseId.value) {
    loadCourseResources(selectedCourse.value)
  }
}

function showCourseAssignments() {
  loadCourseAssignments(selectedCourse.value)
}

// 从作业详情返回所属课程：把 selectedCourse 对齐到当前作业的课程，
// 再切到课程视图的对应面板（资料/作业）。两个 tab 在详情页都不点亮，
// 点击即回课程列表，方便接着看同课程的下一个作业或资料。
function backToCourse(panel) {
  const assignment = selectedAssignment.value
  const courseId = assignment?.courseId || getCourseId(assignment?.raw)
  if (!courseId) {
    setView('study')
    return
  }

  selectedCourse.value = {
    id: courseId,
    siteId: courseId,
    siteName: assignment?.courseName || getCourseName(selectedCourse.value),
  }
  routeCourseId.value = courseId
  setCourseHash(courseId)
  activeCoursePanel.value = panel
  resetCourseAssignments()
  activeView.value = 'course'

  if (panel === 'assignments') {
    loadCourseAssignments(selectedCourse.value)
  } else {
    loadCourseResources(selectedCourse.value)
  }
}

function openAssignment(assignment) {
  const assignmentId = getAssignmentId(assignment)

  selectedAssignment.value = assignment
  activeView.value = 'assignment'
  routeAssignmentId.value = assignmentId
  if (assignmentId) {
    setAssignmentHash(assignmentId)
  }

  loadAssignmentResources(assignment)
}

function getSubmitAssignmentType(assignment) {
  const rawType = assignmentDetail.value?.assignmentType ?? assignment?.raw?.assignmentType ?? 0
  const type = Number(rawType)

  return Number.isFinite(type) ? type : 0
}

function getSubmitTextField(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '')

  return value === undefined ? '' : String(value)
}

function describeFile(file) {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  }
}

function pickUploadAttachmentId(body) {
  const data = body?.data ?? body

  if (typeof data === 'string' || typeof data === 'number') {
    return String(data)
  }

  if (!data || typeof data !== 'object') return ''

  const id =
    data.id ||
    data.resourceId ||
    data.resourceID ||
    data.fileId ||
    data.attachmentId ||
    data.attachId

  return id ? String(id) : ''
}

async function uploadAssignmentFiles(files) {
  const attachmentIds = []

  for (const file of files) {
    const uploadCall = await uploadBusinessResource(bladeToken.value, {
      file,
      userId: userInfo.value.id,
      bizType: 3,
    })

    log('study:attachment-upload:start', uploadCall.request)
    log('study:attachment-upload:response', uploadCall.result)
    checkAuth(uploadCall.result, '附件上传')

    const attachmentId = pickUploadAttachmentId(uploadCall.result.body)
    if (!attachmentId) {
      throw new Error('附件上传响应里没有 data')
    }

    attachmentIds.push(attachmentId)
  }

  return attachmentIds
}

async function submitSelectedAssignment({ assignment, content, files = [] }) {
  const assignmentId = getAssignmentId(assignment)

  assignmentSubmitError.value = ''
  assignmentSubmitResult.value = null

  if (!bladeToken.value) {
    assignmentSubmitError.value = '需要先登录或粘贴 Blade-Auth'
    return
  }
  if (!userInfo.value?.id) {
    assignmentSubmitError.value = '需要先加载用户信息'
    return
  }
  if (!assignmentId) {
    assignmentSubmitError.value = '作业数据里没有 id'
    return
  }

  submittingAssignment.value = true

  try {
    const uploadedAttachmentIds = files.length > 0 ? await uploadAssignmentFiles(files) : []
    const localFiles = files.map(describeFile)
    const payload = {
      attachmentIds: uploadedAttachmentIds,
      assignmentContent: content || '',
      assignmentId,
      assignmentType: getSubmitAssignmentType(assignment),
      commitId: getSubmitTextField(assignmentDetail.value?.commitId, assignment?.raw?.commitId),
      groupId: getSubmitTextField(assignmentDetail.value?.groupId, assignment?.raw?.groupId),
      userId: String(userInfo.value.id),
    }

    log('study:assignment-submit:payload', {
      payload,
      localFiles,
      uploadedAttachmentIds,
    })

    const submitCall = await submitAssignment(bladeToken.value, payload)

    log('study:assignment-submit:start', {
      ...submitCall.request,
      localFiles,
    })
    log('study:assignment-submit:response', submitCall.result)
    checkAuth(submitCall.result, '作业提交')

    assignmentSubmitResult.value = submitCall.result.body || {
      status: submitCall.result.status,
      statusText: submitCall.result.statusText,
    }

    const submitTime = pickSubmitTime(submitCall.result.body) || formatBackendTime()
    markAssignmentSubmitted(assignmentId, submitTime)
    await loadSubmitAttachmentResources(uploadedAttachmentIds, assignmentDetailRequestId)
    await refreshAssignmentsAfterSubmit(assignmentId, submitTime)
  } catch (error) {
    assignmentSubmitError.value = error?.message || '提交作业失败'
    logError('study:assignment-submit:error', error)
  } finally {
    submittingAssignment.value = false
  }
}

async function requestWithAuth() {
  requesting.value = true

  try {
    const { request, result } = await sendDebugRequest(bladeToken.value, apiUrl.value)
    log('api:start', request)
    log('api:response', result)
  } catch (error) {
    logError('api:error', error)
  } finally {
    requesting.value = false
  }
}

function clearToken() {
  bladeToken.value = ''
  userInfo.value = null
  courses.value = []
  assignments.value = []
  resetCourseResources()
  resetCourseAssignments()
  resetAssignmentDetail()
  localStorage.removeItem(TOKEN_KEY)
  log('auth:token-cleared', {
    storageKey: TOKEN_KEY,
  })
}

function handleTokenExpiry(source) {
  log('auth:token-expired', { source })
  clearToken()
  studyError.value = 'Token 已过期，请重新登录'
  setView('study')
}

function checkAuth(result, label) {
  if (isTokenExpired(result)) {
    handleTokenExpiry(label)
    throw new Error('Token 已过期，请重新登录')
  }
  assertUcloudOk(result, label)
}

function clearLogs() {
  logs.value = []
  console.clear()
  log('logs:cleared')
}

onMounted(() => {
  window.addEventListener('hashchange', syncViewFromHash)

  log('page:mounted', {
    href: window.location.href,
    origin: window.location.origin,
    savedBladeToken: bladeToken.value,
    businessAuthorization: BUSINESS_AUTH,
    tenantId: TENANT_ID,
    loginUrl: loginUrl.value,
    apiUrl: apiUrl.value,
  })

  // 刷新后若本地仍有未过期的 token，自动恢复会话，免去重新点击登录
  if (bladeToken.value) {
    log('auth:restore-session', { storageKey: TOKEN_KEY })
    loadStudyData()
  }
})

onUnmounted(() => {
  window.removeEventListener('hashchange', syncViewFromHash)
})
</script>

<template>
  <AppShell :active-view="activeView" :subtitle="shellSubtitle" @change-view="setView">
    <template v-if="activeView === 'study'">
      <AuthBar
        v-model:password="password"
        v-model:token="bladeToken"
        v-model:username="username"
        :loading-data="loadingStudy"
        :loading-login="loggingIn"
        :user-label="userLabel"
        @clear-token="clearToken"
        @blade-auth-login="loginWithBladeAuth"
        @login="login"
      />

      <section v-if="studyError" class="notice error">
        {{ studyError }}
      </section>

      <section class="metrics-grid">
        <div class="metric-card">
          <span>课程</span>
          <strong>{{ courses.length }}</strong>
        </div>
        <div class="metric-card">
          <span>待完成</span>
          <strong>{{ pendingAssignments.length }}</strong>
        </div>
        <div class="metric-card">
          <span>临近截止</span>
          <strong>{{ urgentAssignments.length }}</strong>
        </div>
        <div class="metric-card">
          <span>已逾期</span>
          <strong>{{ overdueAssignments.length }}</strong>
        </div>
      </section>

      <CourseGrid
        :courses="courses"
        :loading-course-id="loadingCourseId"
        :selected-course-id="selectedCourseId"
        @select="openCourse"
      />
      <DeadlineList
        v-model:include-completed="includeCompleted"
        v-model:page-size="assignmentPageSize"
        :assignments="visibleAssignments"
        :last-loaded-at="lastLoadedAt"
        :loading-assignment-id="loadingAssignmentId"
        :selected-assignment-id="selectedAssignmentId"
        @select="openAssignment"
      />
    </template>

    <template v-else-if="activeView === 'course'">
      <div class="detail-actions">
        <button class="button-secondary" type="button" @click="setView('study')">返回首页</button>
        <div v-if="selectedCourse" class="detail-tabs" aria-label="课程详情">
          <button
            :class="{ active: activeCoursePanel === 'resources' }"
            type="button"
            @click="showCourseResources"
          >
            资料
          </button>
          <button
            :class="{ active: activeCoursePanel === 'assignments' }"
            type="button"
            @click="showCourseAssignments"
          >
            作业
          </button>
        </div>
      </div>
      <CourseResourcePanel
        v-if="activeCoursePanel === 'resources'"
        :course="selectedCourse"
        :error="courseResourceError"
        :loading="Boolean(loadingCourseId)"
        :resources="courseResources"
      />
      <DeadlineList
        v-else
        :assignments="courseAssignments"
        empty-text="当前课程暂无作业"
        :error="courseAssignmentError"
        :include-completed="true"
        :loading="loadingCourseAssignments"
        loading-text="正在读取课程作业"
        :page-size="9999"
        :selected-assignment-id="selectedAssignmentId"
        :show-controls="false"
        :subtitle="selectedCourse?.siteName || '当前课程'"
        title="课程作业"
        @select="openAssignment"
      />
    </template>

    <template v-else-if="activeView === 'assignment'">
      <div class="detail-actions">
        <button class="button-secondary" type="button" @click="setView('study')">返回首页</button>
        <div class="detail-tabs" aria-label="课程">
          <button type="button" @click="backToCourse('resources')">资料</button>
          <button class="active" type="button" @click="backToCourse('assignments')">作业</button>
        </div>
      </div>
      <AssignmentDetailPanel
        :assignment="selectedAssignment"
        :detail="assignmentDetail"
        :error="assignmentDetailError"
        :loading="Boolean(loadingAssignmentId)"
        :resources="assignmentResources"
        :submit-error="assignmentSubmitError"
        :submit-result="assignmentSubmitResult"
        :submitting="submittingAssignment"
        @submit="submitSelectedAssignment"
      />
    </template>

    <DebugPanel
      v-else
      v-model:api-url="apiUrl"
      v-model:login-url="loginUrl"
      v-model:password="password"
      v-model:token="bladeToken"
      v-model:username="username"
      :auth-preview="authPreview"
      :loading-data="loadingStudy"
      :logging-in="loggingIn"
      :logs="logs"
      :requesting="requesting"
      @clear-logs="clearLogs"
      @clear-token="clearToken"
      @blade-auth-login="loginWithBladeAuth"
      @login="login"
      @request="requestWithAuth"
    />
  </AppShell>
</template>
