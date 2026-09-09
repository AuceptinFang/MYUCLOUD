<script setup>
import { computed, ref, watch } from 'vue'
import VideoPreview from './VideoPreview.vue'
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
})

const emit = defineEmits(['submit'])

const fileInput = ref(null)
const pickedFiles = ref([])
const assignmentContent = ref('')
const resourceCount = computed(() => props.resources.length)
const previewingId = ref('')
const videoPreview = ref(null)
const downloadingId = ref('')

watch(
  () => props.assignment?.id,
  () => {
    assignmentContent.value = ''
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
  const resourceId = getItemResourceId(resource)
  if (!resourceId) return

  previewingId.value = resourceId
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    const { result } = await getResourcePreviewUrl(token, resourceId)
    if (!result.ok || result.body?.code !== 200) return

    const { previewUrl, onlinePreview } = pickPreviewData(result.body)
    if (!previewUrl) return
    if (isVideoResource({ ...getFileResource(resource), previewUrl, name: getResourceName(resource) })) {
      videoPreview.value = { url: buildFileUrl(previewUrl), name: getResourceName(resource) }
      return
    }

    const url = buildPreviewUrl({ previewUrl, onlinePreview })
    if (!url) return

    window.open(url, '_blank', 'noopener')
  } catch { /* 静默 */ }
  finally { previewingId.value = '' }
}

async function downloadFile(resource) {
  const resourceId = getItemResourceId(resource)
  if (!resourceId) return

  downloadingId.value = resourceId
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    const { result } = await getResourcePreviewUrl(token, resourceId)
    if (!result.ok || result.body?.code !== 200) return

    const { previewUrl } = pickPreviewData(result.body)
    if (!previewUrl) return

    const response = await fetch(previewUrl)
    if (!response.ok) return

    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = getResourceName(resource)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch { /* 静默 */ }
  downloadingId.value = ''
}

async function downloadResource(resource) {
  const url = getResourceUrl(resource)
  if (!url) return

  const isApiUrl = url.startsWith('/ucloud/') || url.includes('apiucloud.bupt.edu.cn')
  const isFileProxy = url.startsWith('/file/')

  if (isApiUrl) {
    const token = localStorage.getItem(TOKEN_KEY)
    const response = await fetch(url, {
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
    const response = await fetch(url)

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

function updatePickedFiles(event) {
  pickedFiles.value = Array.from(event.target.files || [])
}

function clearPickedFiles() {
  pickedFiles.value = []
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

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

      <form class="assignment-submit-box" @submit.prevent="submitAssignment">
        <div class="subsection-header">
          <div>
            <strong>提交作业</strong>
            <span>填写内容或添加附件后提交</span>
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
          <div v-for="file in pickedFiles" :key="`${file.name}-${file.lastModified}`" class="picked-file-row">
            <strong>{{ file.name }}</strong>
            <span>{{ formatFileSize(file.size) }}</span>
          </div>
        </div>
        <div v-else class="empty-state">未选择文件</div>

        <section v-if="submitError" class="notice error">
          {{ submitError }}
        </section>
        <section v-else-if="submitResult" class="notice success">
          提交请求已完成
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
