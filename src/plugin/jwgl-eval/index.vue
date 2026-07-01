<script>
export const meta = { name: '评教', view: 'jwgl-eval' }
</script>

<script setup>
import { computed, ref } from 'vue'

const username = ref('')
const password = ref('')
const degree = ref(3)
const comment = ref('')
const submit = ref(false)
const sessionId = ref('')

const loggingIn = ref(false)
const loadingCourses = ref(false)
const evaluating = ref(false)
const loginError = ref('')
const coursesError = ref('')
const evalError = ref('')
const steps = ref([])
const evalResult = ref(null)

const courses = ref([])
const selectedSet = ref(new Set())

const allSelected = computed({
  get: () => courses.value.length > 0 && selectedSet.value.size === courses.value.length,
  set: (v) => {
    selectedSet.value = v ? new Set(courses.value.map((c) => c.editLink)) : new Set()
  },
})
const selectedCount = computed(() => selectedSet.value.size)
const loggedIn = computed(() => Boolean(sessionId.value))
const hasCourses = computed(() => courses.value.length > 0)
const hasSteps = computed(() => steps.value.length > 0)
const canEvaluate = computed(() => hasCourses.value && selectedCount.value > 0 && !evalResult.value && !hasSteps.value)

// ── login ──────────────────────────────────────────────────────────────────

async function doLogin() {
  loginError.value = ''
  loggingIn.value = true
  try {
    const resp = await fetch('/api/jwgl/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.value, password: password.value }),
    })
    const data = await resp.json()
    if (!data.success) { loginError.value = data.msg || '登录失败'; return }
    sessionId.value = data.sessionId
    await doLoadCourses()
  } catch (e) {
    loginError.value = e.message || '网络错误'
  } finally {
    loggingIn.value = false
  }
}

// ── load courses ───────────────────────────────────────────────────────────

async function doLoadCourses() {
  coursesError.value = ''
  loadingCourses.value = true
  try {
    const resp = await fetch('/api/jwgl/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId.value }),
    })
    const data = await resp.json()
    if (!data.success) { coursesError.value = data.msg || '获取课程失败'; return }
    courses.value = data.courses || []
    selectedSet.value = new Set()
  } catch (e) {
    coursesError.value = e.message || '网络错误'
  } finally {
    loadingCourses.value = false
  }
}

function toggleCourse(editLink) {
  const next = new Set(selectedSet.value)
  next.has(editLink) ? next.delete(editLink) : next.add(editLink)
  selectedSet.value = next
}

// ── evaluate ───────────────────────────────────────────────────────────────

async function doEvaluate() {
  steps.value = []
  evalError.value = ''
  evalResult.value = null
  evaluating.value = true
  try {
    const resp = await fetch('/api/jwgl/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId.value,
        degree: degree.value,
        comment: comment.value,
        submit: submit.value,
        selectedCourses: [...selectedSet.value],
      }),
    })
    if (!resp.ok) { const d = await resp.json(); evalError.value = d.msg || `HTTP ${resp.status}`; return }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const e = JSON.parse(line.slice(6))
          if (e.type === 'error') { evalError.value = e.message; return }
          if (e.type === 'done') { evalResult.value = e; return }
          steps.value.push(e)
        } catch { /* skip */ }
      }
    }
  } catch (e) {
    evalError.value = e.message || '网络错误'
  } finally {
    evaluating.value = false
  }
}

function resetSession() {
  sessionId.value = ''
  courses.value = []
  selectedSet.value = new Set()
  steps.value = []
  evalResult.value = null
  evalError.value = ''
  loginError.value = ''
  coursesError.value = ''
}

function stepIcon(step) {
  if (step.type === 'course-error') return '✕'
  if (step.type === 'course') return '⋯'
  if (step.step === 'batches') return '⟳'
  if (step.step === 'courses') return '⊡'
  if (step.step === 'submit') return '↑'
  if (step.step === 'submitted') return '✓'
  if (step.step === 'submit-error') return '✕'
  if (step.step === 'submit-skip') return '−'
  return ''
}
</script>

<template>
  <section class="jwgl-eval-panel">
    <div class="section-header" style="border-bottom: 2px solid var(--cloud-blue)">
      <h2><span style="color: var(--cloud-blue)">✦</span> 评教</h2>
      <button
        v-if="canEvaluate"
        :disabled="evaluating"
        class="button-primary"
        type="button"
        @click="doEvaluate"
      >
        {{ evaluating ? '评教中…' : `开始评教 (${selectedCount})` }}
      </button>
      <button v-if="evalResult" class="button-secondary" type="button" @click="resetSession">重新开始</button>
    </div>

    <!-- 未登录 -->
    <div v-if="!loggedIn" class="panel" style="margin-top:12px">
      <label>学号 <input v-model="username" placeholder="学号" /></label>
      <label>密码 <input v-model="password" type="password" placeholder="密码" /></label>
      <button :disabled="loggingIn || !username || !password" class="button-primary" type="button" @click="doLogin">
        {{ loggingIn ? '登录中…' : '登录教务系统' }}
      </button>
      <div v-if="loginError" class="notice error">{{ loginError }}</div>
    </div>

    <!-- 课程列表 + 配置（登录后自动加载） -->
    <div v-if="loggedIn && !hasSteps && !evalResult">
      <div v-if="loadingCourses" class="panel" style="margin-top:12px;color:var(--muted)">
        ⟳ 正在获取待评课程…
      </div>

      <div v-if="hasCourses" class="panel" style="margin-top:12px">
        <label class="check-control">
          <input v-model="allSelected" type="checkbox" />
          全选 / 取消全选（共 {{ courses.length }} 门）
        </label>
        <div
          v-for="(c, i) in courses"
          :key="c.editLink"
          class="deadline-item"
          style="cursor:pointer;grid-template-columns:auto 1fr;gap:8px;align-items:center"
          @click="toggleCourse(c.editLink)"
        >
          <input
            type="checkbox"
            :checked="selectedSet.has(c.editLink)"
            style="width:16px;height:16px"
            @click.stop
          />
          <div>
            <strong style="font-size:14px">{{ c.courseName || `课程 ${i + 1}` }}</strong>
            <span v-if="c.teacherName" style="color:var(--muted);font-size:12px;margin-left:8px">{{ c.teacherName }}</span>
          </div>
        </div>
      </div>

      <div v-if="coursesError" class="notice error" style="margin-top:12px">{{ coursesError }}</div>

      <div v-if="hasCourses" class="panel" style="margin-top:12px">
        <label>
          评分
          <div style="display:flex;gap:8px;align-items:center">
            <input v-model.number="degree" type="range" min="1" max="5" style="flex:1;padding:0" />
            <strong style="font-size:18px;min-width:20px;text-align:center">{{ degree }}</strong>
            <span style="color:var(--muted);font-size:12px;white-space:nowrap">1 最好 → 5 最差</span>
          </div>
        </label>
        <label>
          评语
          <textarea v-model="comment" placeholder="输入自定义评语（可选）" />
        </label>
        <label class="check-control">
          <input v-model="submit" type="checkbox" />
          保存后统一提交
        </label>
      </div>
    </div>

    <!-- 进度 / 结果 / 错误 -->
    <div v-if="hasSteps" class="panel" style="margin-top:12px">
      <div v-for="(step, i) in steps" :key="i" class="deadline-item" :style="step.type === 'course-error' ? { color: 'var(--deadline-red)' } : {}">
        <div class="deadline-main"><strong>{{ stepIcon(step) }} {{ step.message }}</strong></div>
        <div v-if="step.totalCourses" class="deadline-time"><span>{{ step.courseIndex || '' }}/{{ step.totalCourses }}</span></div>
      </div>
      <div v-if="evaluating" class="deadline-item" style="color:var(--muted);opacity:0.7">
        <div class="deadline-main"><strong>⟳ 处理中…</strong></div>
      </div>
    </div>
    <div v-if="evalResult" class="notice success" style="margin-top:12px">{{ evalResult.message }}</div>
    <div v-if="evalError" class="notice error" style="margin-top:12px">{{ evalError }}</div>
  </section>
</template>

<style scoped>
.jwgl-eval-panel .section-header { padding-bottom: 8px; flex-wrap: wrap; }
.jwgl-eval-panel .panel { display: grid; gap: 12px; }
.jwgl-eval-panel .deadline-item { grid-template-columns: 1fr; padding: 6px 0; }
.jwgl-eval-panel .deadline-item .deadline-time { justify-items: start; text-align: left; }
.jwgl-eval-panel .deadline-item:not(:disabled):hover { background: #f8fafc; }
.button-primary { background: var(--cloud-blue); color: #ffffff; }
</style>
