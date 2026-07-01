<script>
export const meta = { name: '评教', view: 'jwgl-eval' }
</script>

<script setup>
import { computed, ref } from 'vue'

const JWGL_CREDS_KEY = 'jwgl_creds'

function loadCreds() {
  try {
    const raw = localStorage.getItem(JWGL_CREDS_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return {}
}

function saveCreds(u, p) {
  try {
    localStorage.setItem(JWGL_CREDS_KEY, JSON.stringify({ username: u, password: p }))
  } catch { /* ignore */ }
}

const saved = loadCreds()
const username = ref(saved.username || '')
const password = ref(saved.password || '')
const targetScore = ref(85)
const commentGood = ref('')
const commentImprove = ref('')
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
// 教务规则：超过90分必填亮点，低于80分必填改进建议
const needGood = computed(() => targetScore.value > 90)
const needImprove = computed(() => targetScore.value < 80)
const canEvaluate = computed(() => {
  if (!hasCourses.value || selectedCount.value === 0) return false
  if (needGood.value && !commentGood.value.trim()) return false
  if (needImprove.value && !commentImprove.value.trim()) return false
  if (evaluating.value) return false
  return true
})
const evalDone = computed(() => Boolean(evalResult.value))
const submitDisabled = computed(() => {
  if (!hasCourses.value) return '暂无课程'
  if (selectedCount.value === 0) return '请先选择课程'
  if (needGood.value && !commentGood.value.trim()) return '请填写「工作中的亮点」'
  if (needImprove.value && !commentImprove.value.trim()) return '请填写「需要改进的地方」'
  if (evaluating.value) return '提交中…'
  return ''
})

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
    saveCreds(username.value, password.value)
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
    // auto-select all courses
    selectedSet.value = new Set(courses.value.map((c) => c.editLink))
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
  if (!canEvaluate.value) return
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
        targetScore: targetScore.value,
        comment: commentGood.value,
        commentImprove: commentImprove.value,
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

function resetEval() {
  steps.value = []
  evalResult.value = null
  evalError.value = ''
}

function doLogout() {
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
      <div style="display:flex;gap:8px">
        <button
          v-if="loggedIn"
          :disabled="!canEvaluate"
          class="button-primary"
          type="button"
          @click="doEvaluate"
        >
          {{ evaluating ? '提交中…' : submitDisabled ? submitDisabled : `提交 (${selectedCount})` }}
        </button>
        <button v-if="loggedIn" class="button-secondary" type="button" @click="doLogout">退出</button>
      </div>
    </div>

    <!-- 未登录 -->
    <div v-if="!loggedIn" class="panel" style="margin-top:12px">
      <label>学号 <input v-model="username" placeholder="学号" /></label>
      <label>密码 <input v-model="password" type="password" placeholder="教务密码（默认8位出生日期）" /></label>
      <button :disabled="loggingIn || !username || !password" class="button-primary" type="button" @click="doLogin">
        {{ loggingIn ? '登录中…' : '登录教务系统' }}
      </button>
      <div v-if="loginError" class="notice error">{{ loginError }}</div>
    </div>

    <!-- 登录后的所有内容 -->
    <template v-if="loggedIn">
      <!-- 课程列表 -->
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
          style="cursor:pointer;grid-template-columns:auto 1fr auto;gap:8px;align-items:center"
          @click="toggleCourse(c.editLink)"
        >
          <input
            type="checkbox"
            :checked="selectedSet.has(c.editLink)"
            style="width:16px;height:16px;pointer-events:none"
          />
          <div>
            <strong style="font-size:14px">{{ c.courseName || `课程 ${i + 1}` }}</strong>
            <span v-if="c.teacherName" style="color:var(--muted);font-size:12px;margin-left:8px">{{ c.teacherName }}</span>
          </div>
          <div style="text-align:right;font-size:14px;white-space:nowrap">
            <span v-if="c.totalScore && c.totalScore !== '0'" style="color:var(--cloud-blue);font-weight:650;margin-right:8px">{{ c.totalScore }}分</span>
            <span :style="{color: c.evaluated === '是' ? '#228760' : 'var(--muted)', marginRight:'8px'}">{{ c.evaluated === '是' ? '已评' : '未评' }}</span>
            <span :style="{color: c.submitted === '是' ? '#228760' : 'var(--muted)'}">{{ c.submitted === '是' ? '已提交' : '未提交' }}</span>
          </div>
        </div>
      </div>

      <div v-if="coursesError" class="notice error" style="margin-top:12px">{{ coursesError }}</div>

      <!-- 评分配置 -->
      <div v-if="hasCourses" class="panel" style="margin-top:12px">
        <label>
          评分
          <div style="display:flex;gap:8px;align-items:center">
            <input v-model.number="targetScore" type="range" min="0" max="100" step="5" style="flex:1;padding:0" />
            <strong style="font-size:18px;min-width:28px;text-align:center">{{ targetScore }}</strong>
            <span style="color:var(--muted);font-size:12px;white-space:nowrap">注: 生成得分会随机波动</span>
          </div>
        </label>
        <label>
          工作中的亮点
          <textarea v-model="commentGood" :placeholder="needGood ? '>90 分时必填' : '任课教师在教学工作中的亮点（可选）'" />
        </label>
        <label>
          需要改进的地方
          <textarea v-model="commentImprove" :placeholder="needImprove ? '<80 分时必填' : '需要改进的地方（可选）'" />
        </label>
        <label class="check-control">
          <input v-model="submit" type="checkbox" />
          保存后统一提交
        </label>
      </div>

      <!-- 评教进度浮窗 -->
      <Teleport to="body">
        <div v-if="hasSteps || evaluating || evalDone || evalError" class="eval-overlay" @click.self="resetEval">
          <div class="eval-toast">
            <div class="eval-toast-header">
              <strong>{{ evaluating ? '评教中…' : evalDone ? '评教完成' : evalError ? '评教出错' : '评教进度' }}</strong>
              <button v-if="!evaluating" class="eval-toast-close" @click="resetEval">✕</button>
            </div>
            <div class="eval-toast-body">
              <div v-for="(step, i) in steps" :key="i" class="eval-toast-step" :class="{ error: step.type === 'course-error' }">
                {{ stepIcon(step) }} {{ step.message }}
              </div>
              <div v-if="evaluating" class="eval-toast-step muted">⟳ 处理中…</div>
              <div v-if="evalDone" class="eval-toast-step success">✓ {{ evalResult.message }}</div>
              <div v-if="evalError" class="eval-toast-step error">✕ {{ evalError }}</div>
            </div>
          </div>
        </div>
      </Teleport>
    </template>
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

<style>
.eval-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 12vh;
}
.eval-toast {
  background: #fff; border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.18);
  min-width: 360px; max-width: 480px; width: 90vw;
  overflow: hidden;
}
.eval-toast-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid #e6e8ee;
  font-size: 15px;
}
.eval-toast-close {
  border: 0; background: none; color: #999; cursor: pointer;
  font-size: 16px; padding: 2px 6px; min-height: 0;
}
.eval-toast-close:hover { color: #333; }
.eval-toast-body {
  padding: 14px 18px; display: grid; gap: 8px;
  max-height: 50vh; overflow-y: auto;
}
.eval-toast-step {
  font-size: 13px; line-height: 1.5;
}
.eval-toast-step.muted { color: #999; }
.eval-toast-step.success { color: #228760; font-weight: 650; }
.eval-toast-step.error { color: #c84444; font-weight: 650; }
</style>
