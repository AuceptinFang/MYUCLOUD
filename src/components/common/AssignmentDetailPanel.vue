<script setup>
import { computed, ref, watch } from 'vue'
import AssignmentStatus from './AssignmentStatus.vue'

const props = defineProps({
  assignment: {
    type: Object,
    default: null,
  },
  detail: {
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
  const size =
    file.fileSize && file.fileSizeUnit
      ? `${file.fileSize}${file.fileSizeUnit}`
      : file.size || file.fileSize || ''
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

  if (!path || typeof path !== 'string') return ''
  if (/^https?:\/\//i.test(path)) return path
  if (domain) return joinUrl(domain, path)
  if (path.startsWith('/')) return `https://apiucloud.bupt.edu.cn${path}`

  return path
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
  <section class="section-block assignment-detail-panel">
    <div class="section-header">
      <div>
        <h2>{{ assignment ? getAssignmentTitle(assignment, detail) : '作业详情' }}</h2>
        <p>{{ getAssignmentChapter(assignment, detail) }}</p>
      </div>
      <span v-if="assignment" class="section-count">{{ resourceCount }}</span>
    </div>

    <div v-if="!assignment" class="empty-state">选择作业后显示详情</div>

    <template v-else>
      <div class="assignment-summary">
        <div class="assignment-summary-main">
          <AssignmentStatus :level="assignment.level" :status="assignment.status" />
          <p v-if="getAssignmentDescription(assignment, detail)">
            {{ getAssignmentDescription(assignment, detail) }}
          </p>
        </div>
        <div class="assignment-summary-meta">
          <span>截止 {{ getAssignmentDeadline(assignment, detail) || '未设置' }}</span>
          <span v-if="getAssignmentSubmitTime(assignment, detail)">
            提交 {{ getAssignmentSubmitTime(assignment, detail) }}
          </span>
          <span v-if="getAssignmentBeginTime(assignment, detail)">
            开始 {{ getAssignmentBeginTime(assignment, detail) }}
          </span>
        </div>
      </div>

      <form class="assignment-submit-box" @submit.prevent="submitAssignment">
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

      <div v-if="loading" class="empty-state">正在读取作业详情</div>
      <section v-else-if="error" class="notice error">
        {{ error }}
      </section>
      <div v-else-if="resources.length === 0" class="empty-state">暂无作业资源</div>

      <div v-else class="attachment-list">
        <div v-for="(resource, index) in resources" :key="resource.id || index" class="attachment-row">
          <div class="attachment-main">
            <a
              v-if="getResourceUrl(resource)"
              :href="getResourceUrl(resource)"
              rel="noopener"
              target="_blank"
            >
              {{ getResourceName(resource) }}
            </a>
            <strong v-else>{{ getResourceName(resource) }}</strong>
            <span v-if="getResourceMeta(resource)">{{ getResourceMeta(resource) }}</span>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
