import { computed, onScopeDispose, ref, watch } from 'vue'
import { friendlyError } from '../api/http.js'
import { assertUcloudOk, isTokenExpired } from '../api/ucloud.js'
import { getPeerReview, getPeerReviews, submitPeerReview } from '../api/peer-review.js'
import { canReview, reviewPayload } from '../utils/peer-review.js'

export function usePeerReview({ token, assignmentId, rules, expired = () => {}, api = { getPeerReview, getPeerReviews, submitPeerReview } }) {
  const rows = ref([])
  const page = ref(1)
  const total = ref(0)
  const loading = ref(false)
  const error = ref('')
  const selected = ref(null)
  const detail = ref(null)
  const detailLoading = ref(false)
  const detailError = ref('')
  const score = ref(0)
  const evaluation = ref('')
  const saving = ref(false)
  const saveError = ref('')
  const saved = ref(false)
  const needsCheck = ref(false)
  const now = ref(Date.now())
  const editable = computed(() => !!detail.value && !detailLoading.value && !detailError.value && canReview(selected.value, rules.value, now.value))
  const controllers = new Set()
  let generation = 0
  let listRequest = 0
  let detailRequest = 0
  const timer = typeof window === 'undefined' ? null : setInterval(() => { now.value = Date.now() }, 1000)
  onScopeDispose(() => { clearInterval(timer); generation++; controllers.forEach((controller) => controller.abort()) })

  async function call(work, label) {
    const context = generation
    const controller = new AbortController()
    controllers.add(controller)
    try {
      const { result } = await work(controller.signal)
      if (isTokenExpired(result) && context === generation) expired()
      assertUcloudOk(result, label)
      return result.body?.data
    } finally { controllers.delete(controller) }
  }

  async function loadList(next = page.value) {
    if (!token.value || !assignmentId.value) return
    const context = generation
    const request = ++listRequest
    loading.value = true
    error.value = ''
    try {
      const data = await call((signal) => api.getPeerReviews(token.value, assignmentId.value, { current: next, size: 8, signal }), '读取互评列表')
      if (context !== generation || request !== listRequest) return
      if (!Array.isArray(data?.records) || !Number.isFinite(Number(data.total))) throw new Error('互评列表格式异常，请到原站核对。')
      rows.value = data.records
      total.value = Number(data.total)
      page.value = next
    } catch (cause) {
      if (context === generation && request === listRequest) error.value = friendlyError(cause)
    } finally { if (context === generation && request === listRequest) loading.value = false }
  }

  function closeReview() {
    if (saving.value) return
    detailRequest++
    selected.value = null
    detail.value = null
    detailError.value = ''
    detailLoading.value = false
    score.value = 0
    evaluation.value = ''
    saved.value = false
    saveError.value = ''
    needsCheck.value = false
  }

  async function openReview(row) {
    if (saving.value || !row?.id) return
    closeReview()
    selected.value = row
    const context = generation
    const request = ++detailRequest
    detailLoading.value = true
    try {
      const data = await call((signal) => api.getPeerReview(token.value, String(row.id), { signal }), '读取互评作业')
      if (context !== generation || request !== detailRequest) return
      if (!data || typeof data !== 'object') throw new Error('互评作业格式异常，请刷新重试。')
      detail.value = data
      score.value = Number(data.score) || 0
      evaluation.value = data.evaluation || ''
    } catch (cause) {
      if (context === generation && request === detailRequest) detailError.value = friendlyError(cause)
    } finally { if (context === generation && request === detailRequest) detailLoading.value = false }
  }

  async function verifySaved() {
    if (!selected.value || saving.value) return
    const context = generation
    const request = detailRequest
    const id = String(selected.value.id)
    saving.value = true
    saveError.value = ''
    try {
      const data = await call((signal) => api.getPeerReview(token.value, id, { signal }), '核对互评结果')
      if (context !== generation || request !== detailRequest) return
      if (Number(data?.score) !== Number(score.value) || String(data?.evaluation ?? '') !== evaluation.value) {
        needsCheck.value = false
        throw new Error('学校记录与本次填写不一致，请核对后再提交。')
      }
      detail.value = data
      selected.value = { ...selected.value, isEvaluated: 1, score: data.score, evaluation: data.evaluation }
      saved.value = true
      needsCheck.value = false
      await loadList()
    } catch (cause) {
      if (context === generation && request === detailRequest) saveError.value = friendlyError(cause)
    } finally { if (context === generation && request === detailRequest) saving.value = false }
  }

  async function saveReview() {
    now.value = Date.now()
    if (!editable.value || saving.value || needsCheck.value) return
    saveError.value = ''
    saved.value = false
    let payload
    try { payload = reviewPayload(selected.value.id, score.value, evaluation.value) }
    catch (cause) { saveError.value = cause.message; return }
    const context = generation
    const request = detailRequest
    saving.value = true
    try {
      await call((signal) => api.submitPeerReview(token.value, payload.id, payload.score, payload.evaluation, { signal }), '提交互评')
    } catch (cause) {
      if (context === generation && request === detailRequest) {
        // 写请求可能已抵达学校：先核对，不能自动重试或把网络失败当作未提交。
        needsCheck.value = true
        saveError.value = `${friendlyError(cause)} 请先核对学校记录。`
      }
      return
    } finally { if (context === generation && request === detailRequest) saving.value = false }
    if (context !== generation || request !== detailRequest) return
    needsCheck.value = true
    await verifySaved()
  }

  watch([token, assignmentId], () => {
    generation++
    controllers.forEach((controller) => controller.abort())
    saving.value = false
    closeReview()
    rows.value = []
    total.value = 0
    page.value = 1
    error.value = ''
    loading.value = false
    if (token.value && assignmentId.value) loadList(1)
  }, { immediate: true, flush: 'sync' })

  return { rows, page, total, loading, error, selected, detail, detailLoading, detailError, score, evaluation, saving, saveError, saved, needsCheck, now, editable, loadList, openReview, closeReview, saveReview, verifySaved }
}
