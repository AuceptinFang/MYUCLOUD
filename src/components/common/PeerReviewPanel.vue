<script setup>
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { usePeerReview } from '../../composables/usePeerReview.js'
import { assertUcloudOk, buildPreviewUrl, getResourcePreviewUrl, getResourcesById, isTokenExpired } from '../../api/ucloud.js'
import { friendlyError } from '../../api/http.js'
import { buildPeerReviewUrl, canReview, receivedReviews, reviewAttachmentIds, reviewStatus, reviewWindow } from '../../utils/peer-review.js'
import SafeReviewContent from './SafeReviewContent.vue'
import StarRating from './StarRating.vue'
import { batchReviewCandidates, getAllPeerReviews, submitReviewBatch } from '../../services/peer-review.js'

const props = defineProps({
  assignmentId: { type: String, required: true },
  title: { type: String, default: '' },
  token: { type: String, default: '' },
  rules: { type: Object, default: () => ({}) },
  submitView: { type: Object, default: null },
  batchRequested: { type: Boolean, default: false },
})
const emit = defineEmits(['expired', 'updated', 'batch-opened'])
const {
  rows, page, total, loading, error, selected, detail, detailLoading, detailError,
  score, evaluation, saving, saveError, saved, needsCheck, now, editable,
  loadList, openReview, closeReview, saveReview, verifySaved,
} = usePeerReview({ token: toRef(props, 'token'), assignmentId: toRef(props, 'assignmentId'), rules: toRef(props, 'rules'), expired: () => emit('expired') })
const officialUrl = computed(() => buildPeerReviewUrl(props.assignmentId, props.title))
const windowState = computed(() => reviewWindow(props.rules, now.value))
const received = computed(() => receivedReviews(props.submitView))
const confirming = ref(false)
const files = ref([])
const fileError = ref('')
const filesLoading = ref(false)
const previewing = ref('')
const batchOpen = ref(false)
const batchLoading = ref(false)
const batchRows = ref([])
const batchScore = ref(0)
const batchEvaluation = ref('')
const batchConfirming = ref(false)
const batchSaving = ref(false)
const batchError = ref('')
const batchResult = ref(null)
const batchProgress = ref({ completed: 0, skipped: 0, total: 0 })
let batchController
let fileRequest = 0
let alive = true
onBeforeUnmount(() => { alive = false; fileRequest++; batchController?.abort() })

watch(selected, () => { confirming.value = false })
watch([score, evaluation], () => { confirming.value = false; saved.value = false })
watch(detail, () => { loadFiles() })
watch(() => props.batchRequested, (value) => { if (value) prepareBatch() }, { immediate: true })
watch([batchScore, batchEvaluation], () => { batchConfirming.value = false })
watch([() => props.token, () => props.assignmentId], () => {
  batchController?.abort()
  batchOpen.value = false
  batchRows.value = []
  batchEvaluation.value = ''
  batchScore.value = 0
  batchResult.value = null
})

async function loadFiles() {
  const request = ++fileRequest
  files.value = []
  fileError.value = ''
  previewing.value = ''
  filesLoading.value = false
  const ids = reviewAttachmentIds(detail.value?.attachmentIds)
  if (!ids.length) return
  files.value = ids.map((id, index) => ({ id, name: `附件 ${index + 1}` }))
  filesLoading.value = true
  const token = props.token
  try {
    const { result } = await getResourcesById(token, ids.join(','))
    if (request !== fileRequest || !alive) return
    if (isTokenExpired(result)) emit('expired')
    assertUcloudOk(result, '读取互评附件')
    const data = result.body?.data
    const resources = Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : []
    files.value = files.value.map((file) => {
      const resource = resources.find((item) => String(item.id || item.resourceId) === file.id)
      return { ...file, name: resource?.name || resource?.fileName || file.name }
    })
  } catch (cause) {
    if (request === fileRequest && alive) fileError.value = friendlyError(cause)
  } finally { if (request === fileRequest && alive) filesLoading.value = false }
}

async function previewFile(file) {
  const request = fileRequest
  previewing.value = file.id
  fileError.value = ''
  try {
    const { result } = await getResourcePreviewUrl(props.token, file.id)
    if (request !== fileRequest || !alive) return
    if (isTokenExpired(result)) emit('expired')
    assertUcloudOk(result, '获取互评附件')
    const data = result.body?.data || result.body
    const previewUrl = data?.previewUrl
    if (!previewUrl) throw new Error('暂时无法获取附件地址，请稍后重试。')
    // 固定使用本站 Office 预览，避免把提交者提供的地址用作顶层跳转。
    file.preview = buildPreviewUrl({ previewUrl })
  } catch (cause) {
    if (request === fileRequest && alive) fileError.value = friendlyError(cause)
  } finally { if (request === fileRequest && alive) previewing.value = '' }
}

function startConfirmation() {
  if (!editable.value || saving.value || needsCheck.value) return
  confirming.value = true
}

async function submitOne() {
  await saveReview()
  if (saved.value) emit('updated')
}

async function checkOne() {
  await verifySaved()
  if (saved.value) emit('updated')
}

async function prepareBatch() {
  if (batchLoading.value || batchSaving.value) return
  batchOpen.value = true
  batchLoading.value = true
  batchError.value = ''
  batchResult.value = null
  batchConfirming.value = false
  batchRows.value = []
  batchController?.abort()
  batchController = new AbortController()
  const token = props.token
  try {
    const rows = await getAllPeerReviews(token, props.assignmentId, { signal: batchController.signal })
    if (!alive || token !== props.token) return
    batchRows.value = batchReviewCandidates(rows, props.rules)
  } catch (cause) {
    if (alive && token === props.token) batchError.value = friendlyError(cause)
  } finally {
    if (alive && token === props.token) { batchLoading.value = false; emit('batch-opened') }
  }
}

async function confirmBatch() {
  if (batchSaving.value || !batchConfirming.value || !batchRows.value.length) return
  batchSaving.value = true
  batchProgress.value = { completed: 0, skipped: 0, total: batchRows.value.length }
  batchError.value = ''
  batchController = new AbortController()
  const token = props.token
  try {
    const result = await submitReviewBatch({ token, assignmentId: props.assignmentId, plannedIds: batchRows.value.map((row) => row.id), rules: props.rules, score: batchScore.value, evaluation: batchEvaluation.value, signal: batchController.signal, onProgress: (progress) => { if (alive && token === props.token) batchProgress.value = progress } })
    if (!alive || token !== props.token) return
    batchResult.value = result
    batchConfirming.value = false
    if (result.error) batchError.value = `${result.error} 已停止后续评分，请先刷新名单核对学校记录。`
    await loadList(1)
    emit('updated')
  } catch (cause) {
    if (alive && token === props.token) { batchError.value = friendlyError(cause); batchConfirming.value = false }
  } finally { if (alive && token === props.token) batchSaving.value = false }
}
</script>

<template>
  <section class="section-block peer-review-panel">
    <div class="section-header">
      <div><h2>作业互评</h2><p>{{ title }}</p></div>
      <a :href="officialUrl" target="_blank" rel="noopener noreferrer">在 UCloud 打开 ↗</a>
    </div>

    <div class="review-rules">
      <dl>
        <div v-if="rules.evaluateAmount"><dt>每人评阅</dt><dd>{{ rules.evaluateAmount }} 份</dd></div>
        <div v-if="rules.evaluateStartTime"><dt>开始时间</dt><dd>{{ rules.evaluateStartTime }}</dd></div>
        <div v-if="rules.evaluateEndTime"><dt>截止时间</dt><dd>{{ rules.evaluateEndTime }}</dd></div>
        <div v-if="rules.isEvaluatorAnonymous !== undefined"><dt>评阅方式</dt><dd>{{ Number(rules.isEvaluatorAnonymous) === 1 ? '匿名评阅' : '非匿名评阅' }}</dd></div>
      </dl>
      <details v-if="rules.evaluateRule"><summary>互评规则</summary><SafeReviewContent :content="rules.evaluateRule" /></details>
    </div>
    <p v-if="windowState === 'not-started'" class="notice" role="status">互评尚未开始。</p>
    <p v-else-if="windowState === 'closed'" class="notice" role="status">互评已截止，可查看列表中的评分和评语。</p>
    <p v-if="!token" class="notice" role="status">请先登录，再查看分配给你的互评作业。</p>

    <template v-else-if="!selected">
      <div class="review-list-heading"><h3>我评阅的作业</h3><div class="review-actions"><button class="button-secondary" type="button" :disabled="loading || batchSaving" @click="loadList()">{{ loading ? '读取中…' : '刷新列表' }}</button><button type="button" :disabled="batchLoading || batchSaving || windowState !== 'open'" @click="prepareBatch">一键互评</button></div></div>
      <section v-if="batchOpen" class="review-batch" aria-label="一键互评设置">
        <h3>统一评分</h3><p>只处理未评且当前可评的作业，已有评分不会覆盖。请先阅读作业，再决定是否使用相同评分。</p>
        <p v-if="batchLoading" role="status">正在读取全部待评名单…</p>
        <template v-else>
          <p>本次 {{ batchRows.length }} 份作业</p>
          <ul v-if="batchRows.length" class="batch-targets"><li v-for="(row, index) in batchRows" :key="row.id">{{ row.realName || `匿名作业 ${index + 1}` }}</li></ul>
          <form v-if="batchRows.length && !batchResult" class="review-form" @submit.prevent="batchConfirming = true">
            <fieldset :disabled="batchSaving"><legend>统一星级</legend><StarRating v-model="batchScore" name="batch-review-score" :disabled="batchSaving" /></fieldset>
            <label class="review-comment">统一评语<textarea v-model="batchEvaluation" :disabled="batchSaving" maxlength="200" rows="3" placeholder="填写本次统一使用的评语" /><span class="review-meta">{{ batchEvaluation.length }} / 200</span></label>
            <button v-if="!batchConfirming" type="submit" :disabled="batchSaving || !batchScore">核对提交</button>
            <div v-else class="review-confirm"><p>将给 {{ batchRows.length }} 份作业提交 {{ batchScore }} 星及上方评语，确认继续？</p><div class="review-actions"><button type="button" :disabled="batchSaving" @click="confirmBatch">{{ batchSaving ? '正在逐份提交…' : '确认一键互评' }}</button><button class="button-secondary" type="button" :disabled="batchSaving" @click="batchConfirming = false">继续修改</button></div></div>
          </form>
          <p v-if="batchSaving" role="status">学校已确认 {{ batchProgress.completed }} 份，跳过 {{ batchProgress.skipped }} 份</p>
          <p v-if="batchResult" role="status">学校已确认 {{ batchResult.completed.length }} 份，跳过已有评分 {{ batchResult.skipped.length }} 份{{ batchResult.stopped ? '，其余未继续提交' : '' }}。</p>
          <p v-if="!batchRows.length && !batchError" class="notice">暂无可批量提交的未评作业。</p>
        </template>
        <p v-if="batchError" class="notice error" role="alert">{{ batchError }}</p>
        <div class="review-actions"><button class="button-secondary" type="button" :disabled="batchLoading || batchSaving" @click="prepareBatch">刷新待评名单</button><button class="button-secondary" type="button" :disabled="batchSaving" @click="batchOpen = false">关闭一键互评</button></div>
      </section>
      <p v-if="error" class="notice error" role="alert">{{ error }}</p>
      <p v-if="loading" role="status">正在读取互评作业…</p>
      <p v-else-if="!error && !rows.length" class="notice">暂无分配给你的互评作业。</p>
      <ol v-else-if="rows.length" class="review-list" :start="(page - 1) * 8 + 1">
        <li v-for="(row, index) in rows" :key="row.id" class="review-row">
          <div class="review-row-copy">
            <strong>作业 {{ String((page - 1) * 8 + index + 1).padStart(2, '0') }}<span v-if="row.realName">　{{ row.realName }}</span></strong>
            <p class="review-meta"><span>{{ reviewStatus(row) }}</span><span v-if="row.submitTime">提交于 {{ row.submitTime }}</span><span v-if="row.attachmentCount !== undefined">{{ row.attachmentCount }} 个附件</span></p>
            <p v-if="Number(row.isEvaluated) === 1">我的评分 {{ row.score }} / 5<span v-if="row.evaluation">　{{ row.evaluation }}</span></p>
          </div>
          <button type="button" :disabled="!canReview(row, rules, now)" @click="openReview(row)">{{ Number(row.isEvaluated) === 1 ? '查看与修改' : '开始评阅' }}</button>
        </li>
      </ol>
      <nav v-if="total > 8" class="review-pagination" aria-label="互评作业分页">
        <button class="button-secondary" type="button" :disabled="loading || page <= 1" @click="loadList(page - 1)">上一页</button>
        <span>第 {{ page }} / {{ Math.ceil(total / 8) }} 页</span>
        <button class="button-secondary" type="button" :disabled="loading || page * 8 >= total" @click="loadList(page + 1)">下一页</button>
      </nav>
    </template>

    <section v-else class="review-editor">
      <div class="review-list-heading"><h3>{{ selected.realName || '匿名作业' }}</h3><button class="button-secondary" type="button" :disabled="saving" @click="closeReview">返回互评列表</button></div>
      <p v-if="detailLoading" role="status">正在读取作业内容…</p>
      <div v-else-if="detailError" class="notice error" role="alert">{{ detailError }} <button class="button-secondary" type="button" @click="openReview(selected)">重试</button></div>
      <template v-else-if="detail">
        <section class="review-submission"><h4>提交内容</h4><SafeReviewContent v-if="detail.assignmentContent" :content="detail.assignmentContent" /><p v-else>未填写文字内容</p></section>
        <section class="review-attachments">
          <h4>作业附件</h4>
          <p v-if="filesLoading" role="status">正在读取附件信息…</p>
          <p v-else-if="!files.length">无附件</p>
          <div v-for="file in files" :key="file.id" class="review-file"><span>{{ file.name }}</span><a v-if="file.preview" :href="file.preview" target="_blank" rel="noopener noreferrer">打开预览 ↗</a><button v-else class="button-secondary" type="button" :disabled="previewing === file.id" @click="previewFile(file)">{{ previewing === file.id ? '获取中…' : '获取预览' }}</button></div>
          <p v-if="fileError" class="notice error" role="alert">{{ fileError }} <button class="button-secondary" type="button" @click="loadFiles">重新读取附件</button></p>
        </section>
        <form class="review-form" @submit.prevent="startConfirmation">
          <fieldset :disabled="!editable || saving || needsCheck"><legend>我的评分</legend><StarRating v-model="score" name="peer-review-score" :disabled="!editable || saving || needsCheck" /></fieldset>
          <label class="review-comment">评语<textarea v-model="evaluation" :disabled="!editable || saving || needsCheck" maxlength="200" rows="5" placeholder="写下你的评阅意见" /><span class="review-meta">{{ evaluation.length }} / 200</span></label>
          <p v-if="!editable" class="notice">当前作业不可编辑，请刷新互评列表或到 UCloud 核对。</p>
          <p v-if="saveError" class="notice error" role="alert">{{ saveError }}</p>
          <p v-if="saved" class="notice success" role="status">学校已保存本次评分和评语。</p>
          <div v-if="needsCheck" class="review-actions"><button type="button" :disabled="saving" @click="checkOne">{{ saving ? '正在核对…' : '核对学校记录' }}</button></div>
          <div v-else-if="confirming" class="review-confirm" role="group" aria-label="确认互评提交"><p>本次评分 {{ score }} / 5，确认将评分和评语提交到学校？</p><div class="review-actions"><button type="button" :disabled="saving || !editable" @click="submitOne">{{ saving ? '提交中…' : '确认提交互评' }}</button><button class="button-secondary" type="button" :disabled="saving" @click="confirming = false">继续修改</button></div></div>
          <button v-else type="submit" :disabled="!editable || saving || !score">提交互评</button>
        </form>
      </template>
    </section>

    <section v-if="received.length" class="received-reviews"><h3>我收到的互评</h3><p v-if="submitView.evaluationAverageScore !== undefined">平均评分 {{ submitView.evaluationAverageScore }} / 5</p><article v-for="(review, index) in received" :key="index"><strong>评阅 {{ index + 1 }}<span v-if="review.score > 0">　{{ review.score }} / 5</span></strong><p>{{ review.evaluation || '未填写评语' }}</p></article></section>
  </section>
</template>

<style scoped>
.peer-review-panel { display: grid; gap: 24px; }
.review-rules dl { display: flex; flex-wrap: wrap; gap: 18px 32px; margin: 0; }
.review-rules dt, .review-meta { color: var(--muted); font-size: 13px; line-height: 1.7; }
.review-rules dd { margin: 4px 0 0; font-size: 14px; }
.review-rules details { margin-top: 16px; }
.review-rules summary { cursor: pointer; color: var(--cloud-blue); margin-bottom: 12px; }
.review-list-heading, .review-file, .review-actions, .review-pagination { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.review-list { list-style: none; margin: 0; padding: 0; }
.review-row { display: flex; align-items: center; gap: 24px; justify-content: space-between; padding: 22px 0; border-bottom: 1px solid var(--line); }
.review-row-copy { min-width: 0; overflow-wrap: anywhere; }
.review-row button { flex-shrink: 0; }
.review-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; }
.review-row p { margin-top: 8px; }
.review-pagination { justify-content: center; }
.review-editor, .review-form, .review-submission, .review-attachments, .received-reviews { display: grid; gap: 16px; }
.review-submission, .review-attachments, .review-form { border-top: 1px solid var(--line); padding-top: 20px; }
.review-form fieldset { border: 0; padding: 0; margin: 0; }
.review-form legend { font-weight: 650; margin-bottom: 12px; }
.review-comment { display: grid; gap: 10px; font-weight: 650; }
.review-comment textarea { width: 100%; resize: vertical; font-weight: 400; }
.review-actions { justify-content: flex-start; flex-wrap: wrap; }
.review-form > button { justify-self: start; }
.review-confirm { padding: 16px; background: var(--cloud-blue-soft); border-radius: 10px; display: grid; gap: 16px; }
.review-batch { display: grid; gap: 16px; padding: 20px; border: 1px solid var(--line); border-radius: 10px; }
.batch-targets { display: flex; flex-wrap: wrap; gap: 8px 24px; padding: 0; list-style: none; }
.received-reviews article { border-top: 1px solid var(--line); padding-top: 16px; overflow-wrap: anywhere; }
.received-reviews article p { white-space: pre-wrap; margin-top: 10px; }
@media (max-width: 640px) { .review-row { align-items: flex-start; flex-direction: column; gap: 12px; } .review-list-heading, .section-header { align-items: flex-start; flex-wrap: wrap; } .review-file { flex-wrap: wrap; } }
</style>
