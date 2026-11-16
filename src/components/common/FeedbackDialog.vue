<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { FEEDBACK_CATEGORIES, submitFeedback } from '../../api/feedback.js'

// 反馈对话框。诊断报告由父组件按需生成（buildReport），已在浏览器里脱敏；
// “查看将要发送的内容”展示的就是实际提交的 JSON。
const props = defineProps({
  buildReport: { type: Function, required: true },
  initialCategory: { type: String, default: 'display' },
})
const emit = defineEmits(['close'])

const dialog = ref(null)
const category = ref(props.initialCategory)
const message = ref('')
const contact = ref('')
const includeReport = ref(true)
const report = ref(null)
const reportError = ref('')
const sending = ref(false)
const error = ref('')
const sentId = ref('')

const payload = computed(() => ({
  category: category.value,
  message: message.value.trim(),
  contact: contact.value.trim(),
  report: includeReport.value ? report.value : null,
}))
const preview = computed(() => JSON.stringify(payload.value, null, 2))
const reportSize = computed(() => (report.value ? new Blob([JSON.stringify(report.value)]).size : 0))

async function refreshReport() {
  reportError.value = ''
  try {
    report.value = await props.buildReport()
  } catch (reason) {
    report.value = null
    reportError.value = `诊断报告生成失败：${reason?.message || reason}`
  }
}

async function send() {
  if (!payload.value.message || sending.value) return
  sending.value = true
  error.value = ''
  try {
    sentId.value = await submitFeedback(payload.value)
  } catch (reason) {
    error.value = reason?.message || '提交失败，请稍后重试'
  } finally {
    sending.value = false
  }
}

watch(includeReport, (value) => { if (value && !report.value) refreshReport() })

onMounted(() => {
  dialog.value.showModal()
  refreshReport()
})
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="feedback-dialog" aria-labelledby="feedback-title" @close="emit('close')">
      <header class="feedback-header">
        <strong id="feedback-title">反馈问题</strong>
        <button type="button" class="button-secondary" @click="dialog.close()">关闭</button>
      </header>

      <section v-if="sentId" class="notice success feedback-sent" role="status">
        <strong>已收到，谢谢！</strong>
        <span>反馈编号 <code>{{ sentId }}</code>，需要跟进时可以提这个编号。</span>
      </section>

      <form v-else class="feedback-form" @submit.prevent="send">
        <fieldset class="feedback-categories">
          <legend>问题类型</legend>
          <label v-for="item in FEEDBACK_CATEGORIES" :key="item.value" class="feedback-category">
            <input v-model="category" type="radio" name="feedback-category" :value="item.value" />
            <span>{{ item.label }}</span>
          </label>
        </fieldset>
        <label>
          遇到了什么问题
          <textarea v-model="message" maxlength="2000" required placeholder="例如：已经交了的作业还显示未交；点提交后一直转圈……" />
        </label>
        <label>
          联系方式（选填）
          <input v-model="contact" maxlength="100" type="text" placeholder="QQ、邮箱等，需要回复时使用" />
        </label>

        <label class="toggle-control feedback-report-toggle">
          <input v-model="includeReport" type="checkbox" />
          <span class="toggle-track" aria-hidden="true"><i /></span>
          <span>附带诊断报告（已脱敏）</span>
        </label>
        <p class="feedback-hint">
          报告只包含页面版本、浏览器类型、各作业的状态码与截止天数、当前作业的字段结构和最近的错误信息；不包含姓名、学号、作业标题、课程名、提交内容、文件和登录凭证。作业编号已替换为不可反推的短引用。
        </p>
        <p v-if="reportError" class="notice warning">{{ reportError }}</p>

        <details class="feedback-preview">
          <summary>查看将要发送的内容<template v-if="includeReport && report">（报告约 {{ Math.ceil(reportSize / 1024) }} KB）</template></summary>
          <pre>{{ preview }}</pre>
        </details>

        <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        <div class="feedback-actions">
          <button :disabled="sending || !payload.message" type="submit">{{ sending ? '提交中' : '提交反馈' }}</button>
        </div>
      </form>
    </dialog>
  </Teleport>
</template>

<style scoped>
.feedback-dialog {
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  box-sizing: border-box;
  padding: 20px;
  border: 0;
  border-radius: 16px;
  color: var(--ink);
}
.feedback-dialog::backdrop {
  background: rgb(15 23 42 / 45%);
}
.feedback-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}
.feedback-form {
  display: grid;
  gap: 12px;
}
.feedback-form > label:not(.toggle-control) {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 0.92em;
}
/* 问题类型是一排单选标签：选项少，直接点选比下拉框少一步 */
.feedback-categories {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
  padding: 0;
  border: 0;
}
.feedback-categories legend {
  margin-bottom: 6px;
  padding: 0;
  color: var(--muted);
  font-size: 0.92em;
  font-weight: 700;
}
.feedback-category {
  display: inline-flex;
  position: relative;
}
.feedback-category input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  padding: 0;
  border: 0;
}
.feedback-category span {
  padding: 6px 12px;
  border: 1px solid #d4d8df;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.feedback-category span:hover {
  background: #f8fafc;
}
.feedback-category input:checked + span {
  border-color: var(--cloud-blue);
  background: var(--cloud-blue-soft);
  color: var(--cloud-blue);
  font-weight: 650;
}
.feedback-category input:focus-visible + span {
  outline: 2px solid #7496bc;
  outline-offset: 2px;
}
.feedback-form textarea {
  min-height: 110px;
  resize: vertical;
}
.feedback-form .feedback-report-toggle {
  justify-self: start;
}
.feedback-hint {
  margin: -4px 0 0;
  color: var(--muted);
  font-size: 0.85em;
  line-height: 1.6;
}
.feedback-preview summary {
  cursor: pointer;
  color: var(--cloud-blue);
}
.feedback-preview pre {
  max-height: 260px;
  overflow: auto;
  margin: 8px 0 0;
  padding: 10px;
  border-radius: 8px;
  background: var(--paper-subtle);
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.feedback-actions {
  display: flex;
  justify-content: flex-end;
}
.feedback-sent {
  display: grid;
  gap: 4px;
}
</style>
