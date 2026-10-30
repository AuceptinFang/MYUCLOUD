<script setup>
import { computed, ref, watch } from 'vue'
import VideoPreview from './VideoPreview.vue'
import { fetchBackend, friendlyError, responseErrorMessage } from '../../api/http.js'
import { assertUcloudOk } from '../../api/ucloud.js'
import { allowsLateSubmission, parseBeijingTime } from '../../utils/deadline.js'
import { BUSINESS_AUTH, TENANT_ID, TOKEN_KEY, buildPreviewUrl, buildFileUrl, isVideoResource, getResourcePreviewUrl, pickPreviewData } from '../../api/ucloud'

const props = defineProps({
  assignment: {
    type: Object,
    default: null,
  },
  detail: {
    type: Object,
    default: null,
  },
  submitView: {
    type: Object,
    default: null,
  },
  resources: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  submitting: {
    type: Boolean,
    default: false,
  },
  submitError: {
    type: String,
    default: '',
  },
  submitResult: {
    type: [Object, String],
    default: null,
  },
  uploadProgress: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['submit'])

const fileInput = ref(null)
const pickedFiles = ref([])
const assignmentContent = ref('')
const resourceCount = computed(() => props.resources.length)
const attachmentError = ref('')
const previewingId = ref('')
const videoPreview = ref(null)
const downloadingId = ref('')
const dragDepth = ref(0)
const dragActive = computed(() => dragDepth.value > 0)

watch(
  () => props.assignment?.id,
  () => {
    assignmentContent.value = ''
    dragDepth.value = 0
    clearPickedFiles()
  },
)

function getAssignmentTitle(assignment, detail) {
  return detail?.assignmentTitle || detail?.title || assignment?.title || assignment?.raw?.assignmentTitle || '作业详情'
}

function getAssignmentDescription(assignment, detail) {
  return (
    detail?.assignmentDescription ||
    detail?.description ||
    detail?.content ||
    assignment?.raw?.assignmentDescription ||
    assignment?.raw?.description ||
    assignment?.raw?.content ||
    ''
  )
}

function getAssignmentChapter(assignment, detail) {
  return detail?.chapterName || detail?.chapter || assignment?.chapter || '选择作业后显示详情'
}

function getObjectValue(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)

    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function getAssignmentClassName(assignment, detail) {
  const detailContent = getObjectValue(detail?.assignmentContent)
  const rawContent = getObjectValue(assignment?.raw?.assignmentContent)

  return (
    detailContent?.className ||
    detail?.className ||
    detail?.assignmentClassName ||
    rawContent?.className ||
    assignment?.raw?.className ||
    assignment?.raw?.assignmentClassName ||
    assignment?.className ||
    ''
  )
}

function getAssignmentContent(assignment, detail) {
  return detail?.assignmentContent ?? assignment?.raw?.assignmentContent ?? assignment?.assignmentContent ?? ''
}

function getAssignmentComment(assignment, detail, submitView) {
  return (
    submitView?.assignmentComment ||
    detail?.assignmentComment ||
    assignment?.raw?.assignmentComment ||
    ''
  )
}

function hasCommentText(value) {
  if (value === null || value === undefined) return false
  const text = String(value).trim()

  return text !== '' && text !== 'null' && text !== 'undefined' && text !== '-'
}

function formatAssignmentContent(assignment, detail) {
  const content = getAssignmentContent(assignment, detail)
  const objectContent = getObjectValue(content)

  if (objectContent) return JSON.stringify(objectContent, null, 2)
  if (content === null || content === undefined || content === '') return ''
  if (typeof content === 'object') return JSON.stringify(content, null, 2)

  return String(content)
}

function shouldRenderAssignmentContentHtml(assignment, detail) {
  const content = getAssignmentContent(assignment, detail)

  return typeof content === 'string' && /<\/?[a-z][\s\S]*>/i.test(content)
}

function getAssignmentBeginTime(assignment, detail) {
  return detail?.assignmentBeginTime || detail?.beginTime || assignment?.beginTime || ''
}

function getAssignmentDeadline(assignment, detail) {
  return detail?.assignmentEndTime || detail?.deadline || assignment?.deadline || ''
}

function getAssignmentSubmitTime(assignment, detail) {
  return detail?.submitTime || assignment?.submitTime || ''
}

function getFileResource(item) {
  return item?.resource || item?.file || item?.attach || item || {}
}

function getResourceName(item) {
  const file = getFileResource(item)

  return (
    file.name ||
    file.fileName ||
    file.originalName ||
    file.resourceName ||
    item?.name ||
    item?.fileName ||
    item?.resourceName ||
    '未命名资源'
  )
}

function getResourceMeta(item) {
  const file = getFileResource(item)
  const ext = file.ext || file.fileType || file.suffix || ''
  const size = file.fileSizeUnit || file.size || file.fileSize || ''
  const mime = file.mimeType || file.contentType || ''

  return [ext, size, mime].filter(Boolean).join(' · ')
}

function joinUrl(domain, path) {
  if (!domain || !path) return ''

  return `${domain.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

function getResourceUrl(item) {
  const file = getFileResource(item)
  const path =
    file.url ||
    file.fileUrl ||
    file.downloadUrl ||
    file.link ||
    item?.url ||
    item?.fileUrl ||
    item?.downloadUrl ||
    item?.link ||
    ''
  const domain = file.domain || file.fileDomain || item?.domain || item?.fileDomain || ''

  if (path && typeof path === 'string') {
    if (/^https?:\/\//i.test(path)) return path
    if (domain) return joinUrl(domain, path)
    if (path.startsWith('/')) return `https://apiucloud.bupt.edu.cn${path}`
    return path
  }

  const storageId = file.storageId || item?.storageId || ''
  const ext = file.ext || item?.ext || ''

  if (storageId) {
    return `/file/ucloud/document/${storageId}.${ext}`
  }

  return ''
}

function getItemResourceId(item) {
  const file = getFileResource(item)
  return file.id || file.resourceId || ''
}

async function previewResource(resource) {
  attachmentError.value = ''
  const resourceId = getItemResourceId(resource)
  if (!resourceId) { attachmentError.value = '附件信息不完整，暂时无法打开。'; return }

  previewingId.value = resourceId
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) throw new Error('请先登录，再访问附件。')

    const { result } = await getResourcePreviewUrl(token, resourceId)
    assertUcloudOk(result, '获取附件')

    const { previewUrl, onlinePreview } = pickPreviewData(result.body)
    if (!previewUrl) throw new Error('暂时无法获取附件地址，请稍后重试。')
    if (isVideoResource({ ...getFileResource(resource), previewUrl, name: getResourceName(resource) })) {
      videoPreview.value = { url: buildFileUrl(previewUrl), name: getResourceName(resource) }
      return
    }

    const url = buildPreviewUrl({ previewUrl, onlinePreview })
    if (!url) throw new Error('暂时无法获取预览地址，请稍后重试。')

    window.open(url, '_blank', 'noopener')
  } catch (error) { attachmentError.value = friendlyError(error) }
  finally { previewingId.value = '' }
}

async function downloadFile(resource) {
  attachmentError.value = ''
  const resourceId = getItemResourceId(resource)
  if (!resourceId) { attachmentError.value = '附件信息不完整，暂时无法打开。'; return }

  downloadingId.value = resourceId
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) throw new Error('请先登录，再访问附件。')

    const { result } = await getResourcePreviewUrl(token, resourceId)
    assertUcloudOk(result, '获取附件')

    const { previewUrl } = pickPreviewData(result.body)
    if (!previewUrl) throw new Error('暂时无法获取附件地址，请稍后重试。')

    const response = await fetchBackend(buildFileUrl(previewUrl), {}, { timeoutMs: 120000, streaming: true })
    if (!response.ok) throw new Error(responseErrorMessage(response, null, '下载'))

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = getResourceName(resource)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (error) { attachmentError.value = friendlyError(error) }
  finally { downloadingId.value = '' }
}

async function downloadResource(resource) {
  const url = getResourceUrl(resource)
  if (!url) return

  const isApiUrl = url.startsWith('/ucloud/') || url.includes('apiucloud.bupt.edu.cn')
  const isFileProxy = url.startsWith('/file/')

  if (isApiUrl) {
    const token = localStorage.getItem(TOKEN_KEY)
    const response = await fetchBackend(url, {
      headers: {
        'Blade-Auth': token,
        Authorization: BUSINESS_AUTH,
        'Tenant-Id': TENANT_ID,
      },
    })

    if (!response.ok) {
      throw new Error(`下载失败 HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = getResourceName(resource)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
    return
  }

  if (isFileProxy) {
    const response = await fetchBackend(url)

    if (!response.ok) {
      throw new Error(`下载失败 HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = getResourceName(resource)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
    return
  }

  window.open(url, '_blank', 'noopener')
}

function formatFileSize(size) {
  if (!Number.isFinite(size)) return ''
  if (size < 1024) return `${size}B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`

  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

function fileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`
}

function addPickedFiles(files) {
  const known = new Set(pickedFiles.value.map(fileKey))
  const added = []
  for (const file of files || []) {
    const key = fileKey(file)
    if (known.has(key)) continue
    known.add(key)
    added.push(file)
  }
  if (added.length > 0) {
    pickedFiles.value = [...pickedFiles.value, ...added]
  }
}

function updatePickedFiles(event) {
  addPickedFiles(event.target.files)
  event.target.value = ''
}

function removePickedFile(file) {
  pickedFiles.value = pickedFiles.value.filter((item) => item !== file)
}

function hasDraggedFiles(event) {
  return Array.from(event.dataTransfer?.types || []).includes('Files')
}

function onDragEnter(event) {
  if (!hasDraggedFiles(event)) return
  dragDepth.value += 1
}

function onDragOver(event) {
  if (!hasDraggedFiles(event)) return
  event.dataTransfer.dropEffect = props.submitting ? 'none' : 'copy'
}

function onDragLeave(event) {
  if (!hasDraggedFiles(event)) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

function onDrop(event) {
  dragDepth.value = 0
  if (!props.submitting) {
    addPickedFiles(event.dataTransfer?.files)
  }
}

function clearPickedFiles() {
  pickedFiles.value = []
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

// 截止后能否提交只看学校的 isOvertimeCommit；submit-view 与详情都会带，未知时不拦，只提示
const isPastDeadline = computed(() => {
  const deadline = parseBeijingTime(getAssignmentDeadline(props.assignment, props.detail))
  return deadline !== null && deadline < Date.now()
})
const lateSubmissionAllowed = computed(() => allowsLateSubmission(props.submitView) ?? allowsLateSubmission(props.detail))
const submissionClosed = computed(() => isPastDeadline.value && lateSubmissionAllowed.value === false)

const LARGE_UPLOAD_BYTES = 20 * 1024 * 1024

const pickedTotalSize = computed(() => pickedFiles.value.reduce((sum, file) => sum + (file.size || 0), 0))

const uploadProgressText = computed(() => {
  const progress = props.uploadProgress
  if (!progress) return ''

  const prefix = progress.count > 1 ? `附件 ${progress.index}/${progress.count}「${progress.name}」` : `附件「${progress.name}」`
  const retry = progress.attempt > 1 ? '（网络中断，正在重试）' : ''
  if (progress.sent) return `${prefix}已发送，等待学校服务器处理…${retry}`

  const total = progress.total || progress.size || 0
  const percent = total ? Math.floor((progress.loaded / total) * 100) : 0
  const seconds = (progress.elapsedMs || 0) / 1000
  const speed = seconds > 1 ? `，${formatFileSize(progress.loaded / seconds)}/s` : ''

  return `正在上传${prefix} ${percent}%（${formatFileSize(progress.loaded)} / ${formatFileSize(total)}${speed}）${retry}`
})

const uploadPercent = computed(() => {
  const progress = props.uploadProgress
  if (!progress) return 0
  if (progress.sent) return 100
  const total = progress.total || progress.size || 0
  return total ? Math.min(100, Math.floor((progress.loaded / total) * 100)) : 0
})

function submitAssignment() {
  emit('submit', {
    assignment: props.assignment,
    content: assignmentContent.value,
    files: pickedFiles.value,
  })
}
</script>

<template>
  <VideoPreview
    v-if="videoPreview"
    :key="videoPreview.url"
    :url="videoPreview.url"
    :name="videoPreview.name"
    @close="videoPreview = null"
  />
  <section class="section-block assignment-detail-panel">
    <p v-if="attachmentError" class="notice error" role="alert">{{ attachmentError }}</p>
    <div class="section-header">
      <div>
        <h2>作业内容</h2>
        <p>{{ assignment ? `${getAssignmentTitle(assignment, detail)} · ${getAssignmentChapter(assignment, detail)}` : '选择作业后显示详情' }}</p>
      </div>
      <span v-if="assignment" class="section-count">{{ resourceCount }} 个附件</span>
    </div>

    <div v-if="!assignment" class="empty-state empty-state-card">
      <span class="empty-cloud" aria-hidden="true"><i /><i /></span>
      <strong>尚未选择作业</strong>
      <p>从待办列表进入一项作业后即可查看详情</p>
    </div>

    <div v-else-if="loading" class="detail-skeleton" aria-label="正在读取作业详情">
      <div class="skeleton-facts">
        <i v-for="index in 3" :key="index" />
      </div>
      <i class="skeleton-content-block" />
      <div class="skeleton-row">
        <div>
          <i class="skeleton-line" />
          <i class="skeleton-line skeleton-line-short" />
        </div>
      </div>
    </div>

    <section v-else-if="error" class="notice error">
      {{ error }}
    </section>

    <template v-else>
      <div class="assignment-summary">
        <div class="assignment-facts">
          <div class="assignment-fact deadline-fact" :class="`level-${assignment.level}`">
            <span>截止时间</span>
            <strong>{{ getAssignmentDeadline(assignment, detail) || '未设置' }}</strong>
          </div>
          <div v-if="getAssignmentBeginTime(assignment, detail)" class="assignment-fact">
            <span>开始时间</span>
            <strong>{{ getAssignmentBeginTime(assignment, detail) }}</strong>
          </div>
          <div v-if="getAssignmentSubmitTime(assignment, detail)" class="assignment-fact submitted-fact">
            <span>提交时间</span>
            <strong>{{ getAssignmentSubmitTime(assignment, detail) }}</strong>
          </div>
          <div v-if="getAssignmentClassName(assignment, detail)" class="assignment-fact">
            <span>班级</span>
            <strong>{{ getAssignmentClassName(assignment, detail) }}</strong>
          </div>
        </div>

        <div class="assignment-summary-main">
          <div
            v-if="formatAssignmentContent(assignment, detail) && shouldRenderAssignmentContentHtml(assignment, detail)"
            class="assignment-content-box"
            v-html="formatAssignmentContent(assignment, detail)"
          />
          <pre
            v-else-if="formatAssignmentContent(assignment, detail)"
            class="assignment-content-box"
          >{{ formatAssignmentContent(assignment, detail) }}</pre>
          <p v-if="getAssignmentDescription(assignment, detail)">
            {{ getAssignmentDescription(assignment, detail) }}
          </p>
          <div
            v-if="hasCommentText(getAssignmentComment(assignment, detail, submitView))"
            class="assignment-comment-box"
          >
            <span class="assignment-comment-label">教师评语</span>
            {{ getAssignmentComment(assignment, detail, submitView) }}
          </div>
        </div>
      </div>

      <section v-if="submissionClosed" class="notice warning submission-closed">
        <strong>已截止，不能再提交</strong>
        <span>{{ assignment.isCompleted ? '截止时间已过，学校不允许修改已提交的内容。' : '截止时间已过，教师没有开放补交。如需补交请联系老师。' }}</span>
      </section>

      <form
        v-else
        class="assignment-submit-box"
        :class="{ 'drag-active': dragActive }"
        @submit.prevent="submitAssignment"
        @dragenter.prevent="onDragEnter"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div class="subsection-header">
          <div>
            <strong>{{ isPastDeadline ? '补交作业' : '提交作业' }}</strong>
            <span v-if="isPastDeadline && lateSubmissionAllowed">已过截止时间，教师允许补交，提交后会记为补交</span>
            <span v-else-if="isPastDeadline">已过截止时间，未能确认是否允许补交，学校可能拒绝这次提交</span>
            <span v-else>填写内容或添加附件后提交，可直接把文件拖到这里</span>
          </div>
        </div>

        <label class="submit-content">
          提交内容
          <textarea
            v-model="assignmentContent"
            placeholder="输入本次作业提交内容"
            spellcheck="false"
          />
        </label>

        <div class="submit-actions">
          <label class="file-picker">
            <input ref="fileInput" multiple type="file" @change="updatePickedFiles" />
            <span>选择文件</span>
          </label>
          <button :disabled="submitting" type="submit">
            {{ submitting ? '提交中' : '提交' }}
          </button>
          <button
            v-if="pickedFiles.length > 0"
            class="button-secondary"
            type="button"
            @click="clearPickedFiles"
          >
            清空
          </button>
        </div>

        <div v-if="pickedFiles.length > 0" class="picked-file-list">
          <div v-for="file in pickedFiles" :key="fileKey(file)" class="picked-file-row">
            <strong>{{ file.name }}</strong>
            <span>{{ formatFileSize(file.size) }}</span>
            <button
              :disabled="submitting"
              class="picked-file-remove"
              title="移除"
              type="button"
              @click="removePickedFile(file)"
            >×</button>
          </div>
        </div>
        <button
          v-else
          :disabled="submitting"
          class="file-drop-zone"
          type="button"
          @click="fileInput?.click()"
        >
          <strong>拖拽文件到此处</strong>
          <span>或点击选择文件，支持多个</span>
        </button>

        <div v-if="dragActive" class="drop-overlay" aria-hidden="true">
          <strong>松开即可添加附件</strong>
        </div>

        <p v-if="pickedTotalSize >= LARGE_UPLOAD_BYTES && !submitting" class="upload-hint">
          附件共 {{ formatFileSize(pickedTotalSize) }}，网络较慢时可能需要几分钟，上传期间请不要离开此页面。
        </p>

        <section v-if="submitting && uploadProgress" class="upload-progress" aria-live="polite">
          <div class="upload-progress-bar"><span :style="{ width: `${uploadPercent}%` }" /></div>
          <span>{{ uploadProgressText }}</span>
        </section>

        <section v-if="submitError" class="notice error">
          {{ submitError }}
          <template v-if="pickedFiles.length > 0">已上传成功的附件再次提交时不会重复上传。</template>
        </section>
        <section v-else-if="submitResult?.confirmed" class="notice success">
          学校已确认收到提交{{ submitResult.submitTime ? `（${submitResult.submitTime}）` : '' }}{{ submitResult.attachmentCount ? `，附件 ${submitResult.attachmentCount} 个` : '' }}。
        </section>
        <section v-else-if="submitResult" class="notice warning">
          提交请求已发出，但暂未在学校查到提交记录。请稍后刷新作业列表确认，必要时在企业微信云邮中核对。
        </section>
      </form>

      <section class="assignment-resources">
        <div class="subsection-header">
          <div>
            <strong>作业附件</strong>
            <span>{{ resources.length ? `共 ${resources.length} 项` : '教师暂未添加附件' }}</span>
          </div>
        </div>

        <div v-if="resources.length === 0" class="empty-state empty-state-card compact">
          <span class="empty-cloud" aria-hidden="true"><i /><i /></span>
          <strong>暂无作业附件</strong>
          <p>本次作业没有需要下载的资源</p>
        </div>

        <div v-else class="attachment-list">
          <div v-for="(resource, index) in resources" :key="resource.id || index" class="attachment-row">
            <div class="attachment-main">
              <a
                v-if="getResourceUrl(resource)"
                :class="{ 'link-loading': previewingId === getItemResourceId(resource) }"
                href="#"
                rel="noopener"
                @click.prevent="previewResource(resource)"
              >
                {{ getResourceName(resource) }}
              </a>
              <strong v-else>{{ getResourceName(resource) }}</strong>
              <span v-if="getResourceMeta(resource)">{{ getResourceMeta(resource) }}</span>
              <button
                v-if="getResourceUrl(resource)"
                :disabled="downloadingId === getItemResourceId(resource)"
                class="download-btn"
                title="下载"
                type="button"
                @click.stop="downloadFile(resource)"
              >↓</button>
            </div>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>
