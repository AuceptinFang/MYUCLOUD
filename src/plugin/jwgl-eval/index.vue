<script>
export const meta = { name: '评教', view: 'jwgl-eval' }
</script>

<script setup>
import { computed, ref } from 'vue'

// ── reactive state ─────────────────────────────────────────────────────────

const username = ref('')
const password = ref('')
const degree = ref(3)
const comment = ref('')
const submit = ref(false)
const sessionId = ref('')

const loggingIn = ref(false)
const evaluating = ref(false)
const loginError = ref('')
const evalError = ref('')
const steps = ref([])
const evalResult = ref(null)

const loggedIn = computed(() => Boolean(sessionId.value))
const hasSteps = computed(() => steps.value.length > 0)

// ── login ──────────────────────────────────────────────────────────────────

async function doLogin() {
  loginError.value = ''
  loggingIn.value = true

  try {
    const resp = await fetch('/api/jwgl/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        password: password.value,
      }),
    })

    const data = await resp.json()
    if (!data.success) {
      loginError.value = data.msg || '登录失败'
      return
    }

    sessionId.value = data.sessionId
  } catch (e) {
    loginError.value = e.message || '网络错误'
  } finally {
    loggingIn.value = false
  }
}

// ── evaluate (SSE streaming) ───────────────────────────────────────────────

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
      }),
    })

    if (!resp.ok) {
      const data = await resp.json()
      evalError.value = data.msg || `HTTP ${resp.status}`
      return
    }

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
        const payload = line.slice(6)
        if (payload === '[DONE]') continue

        try {
          const event = JSON.parse(payload)
          if (event.type === 'error') {
            evalError.value = event.message
            return
          }
          if (event.type === 'done') {
            evalResult.value = event
            return
          }
          steps.value.push(event)
        } catch {
          // skip unparseable lines
        }
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
  steps.value = []
  evalResult.value = null
  evalError.value = ''
  loginError.value = ''
}

// ── helpers ────────────────────────────────────────────────────────────────

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
        v-if="loggedIn && !evalResult"
        :disabled="evaluating"
        class="button-primary"
        type="button"
        @click="doEvaluate"
      >
        {{ evaluating ? '评教中…' : '开始评教' }}
      </button>
      <button
        v-if="loggedIn && evalResult"
        class="button-secondary"
        type="button"
        @click="resetSession"
      >
        重新开始
      </button>
    </div>

    <!-- 未登录：登录表单 -->
    <div v-if="!loggedIn" class="panel" style="margin-top:12px">
      <label>学号 <input v-model="username" autocomplete="username" placeholder="学号" /></label>
      <label>密码 <input v-model="password" type="password" autocomplete="current-password" placeholder="密码" /></label>
      <button :disabled="loggingIn || !username || !password" class="button-primary" type="button" @click="doLogin">
        {{ loggingIn ? '登录中…' : '登录教务系统' }}
      </button>
      <div v-if="loginError" class="notice error">{{ loginError }}</div>
    </div>

    <!-- 已登录未评教：配置 -->
    <div v-if="loggedIn && !evalResult && !hasSteps" class="panel" style="margin-top:12px">
      <label>
        评分
        <div style="display:flex;gap:8px;align-items:center">
          <input
            v-model.number="degree"
            type="range"
            min="1"
            max="5"
            style="flex:1;padding:0"
          />
          <strong style="font-size:18px;min-width:24px;text-align:center">{{ degree }}</strong>
          <span style="color:var(--muted);font-size:12px;white-space:nowrap">1 最好 → 5 最差</span>
        </div>
      </label>
      <label>
        评语
        <textarea v-model="comment" placeholder="输入自定义评语（可选）" />
      </label>
      <label class="check-control">
        <input v-model="submit" type="checkbox" />
        保存后统一提交所有课程
      </label>
      <p style="color:var(--muted);font-size:12px;margin-top:4px">
        建议首次使用时先不勾选，确认保存结果无误后再手动提交
      </p>
    </div>

    <!-- 进度 -->
    <div v-if="hasSteps" class="panel" style="margin-top:12px">
      <div
        v-for="(step, i) in steps"
        :key="i"
        class="deadline-item"
        :style="step.type === 'course-error' ? { color: 'var(--deadline-red)' } : {}"
      >
        <div class="deadline-main">
          <strong>{{ stepIcon(step) }} {{ step.message }}</strong>
        </div>
        <div v-if="step.totalCourses" class="deadline-time">
          <span>{{ step.courseIndex || '' }}/{{ step.totalCourses }}</span>
        </div>
      </div>

      <!-- 进行中的 spinner（当最后一条是 step/course 类型时） -->
      <div
        v-if="evaluating && steps.length > 0 && steps[steps.length - 1].type !== 'done'"
        class="deadline-item"
        style="color:var(--muted);opacity:0.7"
      >
        <div class="deadline-main">
          <strong>⟳ 处理中…</strong>
        </div>
      </div>
    </div>

    <!-- 结果 -->
    <div v-if="evalResult" class="notice success" style="margin-top:12px">
      {{ evalResult.message }}
    </div>

    <!-- 错误 -->
    <div v-if="evalError" class="notice error" style="margin-top:12px">{{ evalError }}</div>
  </section>
</template>

<style scoped>
.jwgl-eval-panel .section-header {
  padding-bottom: 8px;
}
.jwgl-eval-panel .panel {
  display: grid;
  gap: 12px;
}

/* override deadline-item for progress list — remove hover effect, add spacing */
.jwgl-eval-panel .deadline-item {
  grid-template-columns: 1fr;
  padding: 8px 0;
}
.jwgl-eval-panel .deadline-item .deadline-time {
  justify-items: start;
  text-align: left;
}
.jwgl-eval-panel .deadline-item:not(:disabled):hover {
  background: transparent;
}

.button-primary {
  background: var(--cloud-blue);
  color: #ffffff;
}
</style>
