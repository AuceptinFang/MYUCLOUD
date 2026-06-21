<script setup>
import { computed, ref } from 'vue'
import {
  BUSINESS_AUTH,
  TENANT_ID,
  TOKEN_KEY,
  getResourcePreviewUrl,
  pickPreviewData,
} from '../../api/ucloud'

const props = defineProps({
  course: {
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
})

const flattenedResources = computed(() => flattenResources(props.resources))
const resourceCount = computed(
  () => flattenedResources.value.filter((row) => row.type === 'node').length,
)

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function flattenResources(nodes, depth = 0, prefix = '') {
  return toArray(nodes).flatMap((node, index) => {
    if (!node || typeof node !== 'object') return []

    const nodeKey = `${prefix}${node.id || node.resourceId || index}`
    const attachmentRows = toArray(node.attachmentVOs || node.attachments || node.attachmentList).map(
      (attachment, attachmentIndex) => ({
        type: 'attachment',
        key: `attachment-${nodeKey}-${getAttachmentId(attachment, attachmentIndex)}`,
        depth: depth + 1,
        attachment,
      }),
    )

    return [
      {
        type: 'node',
        key: `node-${nodeKey}`,
        depth,
        node,
      },
      ...attachmentRows,
      ...flattenResources(node.children, depth + 1, `${nodeKey}.`),
    ]
  })
}

function getAttachmentResource(attachment) {
  return attachment?.resource || attachment || {}
}

function getAttachmentId(attachment, fallback) {
  const resource = getAttachmentResource(attachment)

  return resource.id || resource.fileId || attachment?.id || fallback
}

function getCourseName(course) {
  return course?.siteName || course?.name || '课程资料'
}

function getNodeName(node) {
  return node.resourceName || node.name || node.title || '未命名资料'
}

function getNodeMeta(node) {
  const parts = [
    node.resourceTypeName || node.resourceType || '',
    node.recommendLearnTime ? `建议 ${node.recommendLearnTime}` : '',
  ].filter(Boolean)

  return parts.join(' · ')
}

function getAttachmentName(attachment) {
  const resource = getAttachmentResource(attachment)

  return resource.name || resource.fileName || attachment?.name || attachment?.fileName || '未命名附件'
}

function getAttachmentMeta(attachment) {
  const resource = getAttachmentResource(attachment)
  const ext = resource.ext || resource.fileType || ''
  const size = resource.fileSizeUnit || resource.size || ''

  return [ext, size].filter(Boolean).join(' · ')
}

function getAttachmentUrl(attachment) {
  const resource = getAttachmentResource(attachment)
  const url = resource.url || resource.fileUrl || attachment?.url || attachment?.fileUrl || ''

  if (!url || typeof url !== 'string') return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/')) return `https://apiucloud.bupt.edu.cn${url}`

  return url
}

function getDepthStyle(row) {
  return {
    paddingLeft: `${row.depth * 18}px`,
  }
}

const previewingId = ref('')
const downloadingId = ref('')

function getAttachmentResourceId(attachment) {
  const resource = getAttachmentResource(attachment)
  return resource.id || resource.resourceId || ''
}

function getAttachmentExt(attachment) {
  const resource = getAttachmentResource(attachment)
  return resource.ext || resource.fileType || ''
}

async function previewAttachment(attachment) {
  const resourceId = getAttachmentResourceId(attachment)
  if (!resourceId) return

  previewingId.value = resourceId
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return

    const { result } = await getResourcePreviewUrl(token, resourceId)
    if (!result.ok || result.body?.code !== 200) return

    const { previewUrl, onlinePreview } = pickPreviewData(result.body)

    const params = new URLSearchParams()
    if (onlinePreview) params.set('onlinePreview', onlinePreview)
    if (previewUrl) params.set('previewUrl', previewUrl)
    params.set('resourceId', resourceId)
    const ext = getAttachmentExt(attachment)
    if (ext) params.set('ext', ext)

    window.open(
      `https://ucloud.bupt.edu.cn/uclass/course.html#/resourceLearn?${params.toString()}`,
      '_blank',
      'noopener',
    )
  } catch { /* 静默 */ }
  previewingId.value = ''
}

async function downloadAttachment(attachment) {
  const resourceId = getAttachmentResourceId(attachment)
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
    a.download = getAttachmentName(attachment)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch { /* 静默 */ }
  downloadingId.value = ''
}
</script>

<template>
  <section class="section-block resource-panel">
    <div class="section-header">
      <div>
        <h2>{{ course ? getCourseName(course) : '课程资料' }}</h2>
        <p>{{ course ? '资料' : '选择课程后显示资料' }}</p>
      </div>
      <span v-if="course" class="section-count">{{ resourceCount }}</span>
    </div>

    <div v-if="!course" class="empty-state">选择课程后显示资料</div>
    <div v-else-if="loading" class="empty-state">正在读取资料</div>
    <section v-else-if="error" class="notice error">
      {{ error }}
    </section>
    <div v-else-if="flattenedResources.length === 0" class="empty-state">暂无课程资料</div>

    <div v-else class="resource-list">
      <div
        v-for="row in flattenedResources"
        :key="row.key"
        class="resource-row"
        :class="`resource-${row.type}`"
        :style="getDepthStyle(row)"
      >
        <div class="resource-main">
          <template v-if="row.type === 'node'">
            <strong>{{ getNodeName(row.node) }}</strong>
            <span v-if="getNodeMeta(row.node)">{{ getNodeMeta(row.node) }}</span>
          </template>
          <template v-else>
            <a
              v-if="getAttachmentUrl(row.attachment)"
              :class="{ 'link-loading': previewingId === getAttachmentResourceId(row.attachment) }"
              href="#"
              rel="noopener"
              @click.prevent="previewAttachment(row.attachment)"
            >
              {{ getAttachmentName(row.attachment) }}
            </a>
            <span v-else>{{ getAttachmentName(row.attachment) }}</span>
          </template>
        </div>
        <span v-if="row.type === 'attachment'" class="resource-extra">
          {{ getAttachmentMeta(row.attachment) }}
          <button
            v-if="getAttachmentUrl(row.attachment)"
            :disabled="downloadingId === getAttachmentResourceId(row.attachment)"
            class="download-btn"
            title="下载"
            type="button"
            @click.stop="downloadAttachment(row.attachment)"
          >↓</button>
        </span>
      </div>
    </div>
  </section>
</template>
