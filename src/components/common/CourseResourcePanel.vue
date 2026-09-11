<script setup>
import { computed, ref } from 'vue'
import VideoPreview from './VideoPreview.vue'
import { fetchBackend, friendlyError, responseErrorMessage } from '../../api/http.js'
import { assertUcloudOk } from '../../api/ucloud.js'
import {
  TOKEN_KEY,
  buildPreviewUrl,
  buildFileUrl,
  isVideoResource,
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
    node.resourceTypeName || '',
    Number(node.recommendLearnTime) > 0 ? `建议 ${node.recommendLearnTime}` : '',
  ].filter(Boolean)

  return parts.join(' · ')
}

function getAttachmentName(attachment) {
  if (isLinkAttachment(attachment)) {
    return attachment.siteResourceLink?.title || getAttachmentLinkUrl(attachment) || '外部链接'
  }

  const resource = getAttachmentResource(attachment)

  return resource.name || resource.fileName || attachment?.name || attachment?.fileName || '未命名附件'
}

function getAttachmentMeta(attachment) {
  if (isLinkAttachment(attachment)) return '外部链接'

  const resource = getAttachmentResource(attachment)
  const ext = resource.ext || resource.fileType || ''
  const size = resource.fileSizeUnit || resource.size || ''

  return [ext, size].filter(Boolean).join(' · ')
}

function isLinkAttachment(attachment) {
  return String(attachment?.type) === '2' || Boolean(attachment?.siteResourceLink?.link)
}

function getAttachmentLinkUrl(attachment) {
  const link = attachment?.siteResourceLink?.link
  if (typeof link !== 'string') return ''

  try {
    const url = new URL(link)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
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

const attachmentError = ref('')
const previewingId = ref('')
const videoPreview = ref(null)
const downloadingId = ref('')

function getAttachmentResourceId(attachment) {
  const resource = getAttachmentResource(attachment)
  return resource.id || resource.resourceId || ''
}

async function previewAttachment(attachment) {
  attachmentError.value = ''
  const resourceId = getAttachmentResourceId(attachment)
  if (!resourceId) { attachmentError.value = '附件信息不完整，暂时无法打开。'; return }

  previewingId.value = resourceId
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) throw new Error('请先登录，再访问附件。')

    const { result } = await getResourcePreviewUrl(token, resourceId)
    assertUcloudOk(result, '获取附件')

    const { previewUrl, onlinePreview } = pickPreviewData(result.body)
    if (!previewUrl) throw new Error('暂时无法获取附件地址，请稍后重试。')
    if (isVideoResource({ ...getAttachmentResource(attachment), previewUrl, name: getAttachmentName(attachment) })) {
      videoPreview.value = { url: buildFileUrl(previewUrl), name: getAttachmentName(attachment) }
      return
    }
    const url = buildPreviewUrl({ previewUrl, onlinePreview })
    if (!url) throw new Error('暂时无法获取预览地址，请稍后重试。')

    window.open(url, '_blank', 'noopener')
  } catch (error) { attachmentError.value = friendlyError(error) }
  finally { previewingId.value = '' }
}

async function downloadAttachment(attachment) {
  attachmentError.value = ''
  const resourceId = getAttachmentResourceId(attachment)
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
    a.download = getAttachmentName(attachment)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch (error) { attachmentError.value = friendlyError(error) }
  finally { downloadingId.value = '' }
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
  <section class="section-block resource-panel">
    <p v-if="attachmentError" class="notice error" role="alert">{{ attachmentError }}</p>
    <div class="section-header">
      <div>
        <h2>课程资料</h2>
        <p>{{ course ? `按课程结构浏览 · ${getCourseName(course)}` : '选择课程后显示资料' }}</p>
      </div>
      <span v-if="course" class="section-count">{{ resourceCount }}</span>
    </div>

    <div v-if="!course" class="empty-state empty-state-card">
      <span class="empty-cloud" aria-hidden="true"><i /><i /></span>
      <strong>尚未选择课程</strong>
      <p>从首页进入一门课程后即可浏览资料</p>
    </div>
    <div v-else-if="loading" class="skeleton-list" aria-label="正在读取资料">
      <div v-for="index in 4" :key="index" class="skeleton-row">
        <div>
          <i class="skeleton-line" />
          <i class="skeleton-line skeleton-line-short" />
        </div>
        <i class="skeleton-chip" />
      </div>
    </div>
    <section v-else-if="error" class="notice error">
      {{ error }}
    </section>
    <div v-else-if="flattenedResources.length === 0" class="empty-state empty-state-card">
      <span class="empty-cloud" aria-hidden="true"><i /><i /></span>
      <strong>暂无课程资料</strong>
      <p>教师发布的课件与附件会显示在这里</p>
    </div>

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
            <template v-if="isLinkAttachment(row.attachment)">
              <a
                v-if="getAttachmentLinkUrl(row.attachment)"
                :href="getAttachmentLinkUrl(row.attachment)"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ getAttachmentName(row.attachment) }}
              </a>
              <span v-else>{{ getAttachmentName(row.attachment) }}（链接不可用）</span>
            </template>
            <a
              v-else-if="getAttachmentUrl(row.attachment)"
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
            v-if="!isLinkAttachment(row.attachment) && getAttachmentUrl(row.attachment)"
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
