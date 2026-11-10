<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  assertUcloudOk,
  buildActivityUrl,
  enterQuizPaper,
  getQuizInfo,
  getQuizResult,
  getQuizUnsaved,
  getServerClock,
  isTokenExpired,
  saveQuizAnswer,
  submitQuiz,
} from '../../api/ucloud.js'
import {
  QUIZ_QUESTION_TYPES,
  flattenQuizPaper,
  formatCountdown,
  initialQuizAnswer,
  isChoiceQuestion,
  isMultipleChoice,
  isQuizAnswered,
  parseQuizTime,
  quizAnswerValues,
  quizDeadline,
  quizQuestionResult,
} from '../../utils/quiz.js'
import { trimSeconds } from '../../utils/deadline.js'

const props = defineProps({
  quizId: {
    type: String,
    default: '',
  },
  token: {
    type: String,
    default: '',
  },
  userId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['loaded', 'submitted', 'expired'])

const TEXT_SAVE_DELAY = 800
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// phase: loading → intro（未进入）/ answering（作答中）/ result（已交卷的卷面）
const phase = ref('loading')
const info = ref(null)
const error = ref('')
const paper = ref(null)
const questions = ref([])
const answers = ref({})
const saveStates = ref({})
const starting = ref(false)
const confirmingStart = ref(false)
const confirmingSubmit = ref(null)
const submitting = ref(false)
const submitError = ref('')
const result = ref(null)
const resultQuestions = ref([])
const now = ref(Date.now())
let clockOffset = 0
let ticker = null
let loadRequestId = 0
const textTimers = new Map()
const inflight = new Map()
const dirty = new Set()

const officialUrl = computed(() => buildActivityUrl({ kind: 'quiz', activityId: props.quizId }))
const deadline = computed(() => quizDeadline(paper.value))
// 服务器时间接口本身有几秒误差，剩余时间不超过限时
const remaining = computed(() => {
  if (deadline.value === null) return null
  const limit = Number(paper.value?.examTime) > 0 ? Number(paper.value.examTime) * 60000 : Infinity
  return Math.min(deadline.value - now.value, limit)
})
const answeredCount = computed(
  () => questions.value.filter((question) => isQuizAnswered(question, answers.value[question.id])).length,
)
const hasUnsupported = computed(() => questions.value.some((question) => !QUIZ_QUESTION_TYPES[question.type]))
const isOpen = computed(() => {
  const start = parseQuizTime(info.value?.startAt)
  const end = parseQuizTime(info.value?.endAt)
  return (start === null || start <= now.value) && (end === null || now.value < end)
})
const subtitle = computed(() => {
  if (!info.value) return error.value ? '读取失败' : '正在读取测验'
  return [
    info.value.duration ? `限时 ${info.value.duration} 分钟` : '',
    info.value.isAllowRepet ? '允许重复提交' : '不允许重复提交',
    info.value.endAt ? `截止 ${trimSeconds(info.value.endAt)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

function startedKey() {
  return `mock-ucloud-quiz-started:${props.userId}:${props.quizId}`
}

function markStarted(started) {
  try {
    if (started) localStorage.setItem(startedKey(), '1')
    else localStorage.removeItem(startedKey())
  } catch {
    // 忽略
  }
}

function wasStarted() {
  try {
    return localStorage.getItem(startedKey()) === '1'
  } catch {
    return false
  }
}

function isHtml(value) {
  return typeof value === 'string' && /<\/?[a-z][\s\S]*>/i.test(value)
}

// 登录过期时通知外层并中断后续流程；其他错误照常抛出
function check(response, label) {
  if (isTokenExpired(response.result)) {
    emit('expired')
    throw new Error('登录已过期')
  }
  assertUcloudOk(response.result, label)
  return response.result.body?.data
}

function stopTicker() {
  clearInterval(ticker)
  ticker = null
}

function resetAnswering() {
  stopTicker()
  for (const timer of textTimers.values()) clearTimeout(timer)
  textTimers.clear()
  dirty.clear()
  paper.value = null
  questions.value = []
  answers.value = {}
  saveStates.value = {}
  confirmingSubmit.value = null
  submitError.value = ''
}

async function loadQuiz() {
  const requestId = ++loadRequestId
  resetAnswering()
  phase.value = 'loading'
  info.value = null
  error.value = ''
  result.value = null
  confirmingStart.value = false
  if (!props.quizId) {
    error.value = '链接里没有测验编号'
    return
  }
  if (!props.token) {
    error.value = '请先回到首页登录'
    return
  }

  try {
    const data = check(await getQuizInfo(props.token, props.quizId), '测验')
    if (requestId !== loadRequestId) return
    info.value = data
    emit('loaded', data)
    if (data.submit) await loadResult(requestId)
    else phase.value = 'intro'
  } catch (loadError) {
    if (requestId === loadRequestId) error.value = loadError?.message || '测验读取失败'
  }
}

async function loadResult(requestId = loadRequestId) {
  const data = check(await getQuizResult(props.token, props.quizId), '测验成绩')
  if (requestId !== loadRequestId) return
  result.value = data
  resultQuestions.value = flattenQuizPaper(data)
  phase.value = 'result'
}

function requestStart() {
  if (wasStarted() && !info.value?.submit) {
    startQuiz()
    return
  }
  confirmingStart.value = true
}

async function startQuiz() {
  starting.value = true
  error.value = ''
  try {
    const data = check(await enterQuizPaper(props.token, props.quizId), '进入测验')
    // 进入之后再取服务器时间，否则时钟会比 startAt 早，倒计时多出几秒
    const serverNow = parseQuizTime(check(await getServerClock(props.token), '服务器时间')?.data)
    clockOffset = serverNow === null ? 0 : serverNow - Date.now()
    markStarted(true)

    resetAnswering()
    paper.value = data
    questions.value = flattenQuizPaper(data)
    answers.value = Object.fromEntries(questions.value.map((question) => [question.id, initialQuizAnswer(question)]))
    saveStates.value = Object.fromEntries(
      questions.value.map((question) => [question.id, isQuizAnswered(question, answers.value[question.id]) ? 'saved' : '']),
    )
    phase.value = 'answering'
    now.value = Date.now() + clockOffset
    ticker = setInterval(tick, 1000)
  } catch (startError) {
    error.value = startError?.message || '进入测验失败'
  } finally {
    starting.value = false
    confirmingStart.value = false
  }
}

function tick() {
  now.value = Date.now() + clockOffset
  if (remaining.value !== null && remaining.value <= 0 && !submitting.value) {
    stopTicker()
    submit(true)
  }
}

// 每题的保存串行执行：保存途中又改了答案，等这次结束后再存一次最新的
function saveQuestion(question) {
  dirty.add(question.id)
  if (inflight.has(question.id)) return inflight.get(question.id)

  const run = (async () => {
    while (dirty.has(question.id)) {
      dirty.delete(question.id)
      const values = quizAnswerValues(question, answers.value[question.id])
      // 官方页面不保存空答案，服务器上会保留之前存的内容
      if (!values.some(Boolean)) {
        saveStates.value[question.id] = ''
        continue
      }
      saveStates.value[question.id] = 'saving'
      try {
        check(await saveQuizAnswer(props.token, props.quizId, question.id, values), '保存答案')
        saveStates.value[question.id] = 'saved'
      } catch {
        saveStates.value[question.id] = 'error'
      }
    }
  })().finally(() => inflight.delete(question.id))
  inflight.set(question.id, run)
  return run
}

function chooseSingle(question, optionId) {
  answers.value[question.id] = [optionId]
  saveQuestion(question)
}

function toggleMultiple(question, optionId, checked) {
  const selected = new Set(answers.value[question.id])
  if (checked) selected.add(optionId)
  else selected.delete(optionId)
  answers.value[question.id] = question.options.map((option) => option.id).filter((id) => selected.has(id))
  saveQuestion(question)
}

function editText(question) {
  saveStates.value[question.id] = 'pending'
  clearTimeout(textTimers.get(question.id))
  textTimers.set(
    question.id,
    setTimeout(() => {
      textTimers.delete(question.id)
      saveQuestion(question)
    }, TEXT_SAVE_DELAY),
  )
}

function flushText(question) {
  if (!textTimers.has(question.id)) return
  clearTimeout(textTimers.get(question.id))
  textTimers.delete(question.id)
  saveQuestion(question)
}

async function flushAll() {
  for (const question of questions.value) flushText(question)
  await Promise.all([...inflight.values()])
}

async function requestSubmit() {
  submitError.value = ''
  submitting.value = true
  try {
    await flushAll()
    const unsavedIds = new Set((check(await getQuizUnsaved(props.token, props.quizId), '检查漏答') || []).map(String))
    const failed = questions.value.filter(
      (question) => unsavedIds.has(question.id) || saveStates.value[question.id] === 'error',
    )
    confirmingSubmit.value = { labels: failed.map((question) => question.label) }
  } catch (checkError) {
    submitError.value = checkError?.message || '检查漏答失败'
  } finally {
    submitting.value = false
  }
}

async function submit(auto = false) {
  submitting.value = true
  submitError.value = ''
  try {
    await flushAll()
    check(await submitQuiz(props.token, props.quizId, auto), '交卷')
    markStarted(false)
    stopTicker()
    emit('submitted', props.quizId)
    info.value = { ...info.value, submit: true }
    resetAnswering()
    await loadResult()
  } catch (submitFailure) {
    submitError.value = `${auto ? '时间已到，自动交卷失败：' : ''}${submitFailure?.message || '交卷失败'}`
  } finally {
    submitting.value = false
    confirmingSubmit.value = null
  }
}

function saveStateText(question) {
  return { saving: '保存中', saved: '已保存', error: '保存失败', pending: '待保存' }[saveStates.value[question.id]] || ''
}

function isSelected(answer, optionId) {
  return Array.isArray(answer) && answer.includes(optionId)
}

watch(() => [props.quizId, props.token], loadQuiz, { immediate: true })
onBeforeUnmount(() => {
  stopTicker()
  for (const question of questions.value) flushText(question)
})
</script>

<template>
  <section class="section-block survey-panel quiz-panel">
    <div class="section-header">
      <div>
        <h2>测验内容</h2>
        <p>{{ subtitle }}</p>
      </div>
      <span v-if="phase === 'answering'" class="section-count">已答 {{ answeredCount }}/{{ questions.length }}</span>
      <span v-else-if="phase === 'result' && result" class="section-count">
        {{ Number(result.score) >= 0 ? `${result.score} / ${result.totalPoints} 分` : '待评分' }}
      </span>
    </div>

    <div v-if="phase === 'loading' && !error" class="list-placeholder" role="status">正在读取测验</div>
    <section v-if="error" class="notice error">{{ error }}</section>

    <div v-if="phase === 'intro'" class="quiz-intro">
      <p v-if="info.description" class="survey-description">{{ info.description }}</p>
      <dl class="quiz-facts">
        <div><dt>开放时间</dt><dd>{{ trimSeconds(info.startAt) }} — {{ trimSeconds(info.endAt) }}</dd></div>
        <div><dt>限时</dt><dd>{{ info.duration ? `${info.duration} 分钟` : '不限' }}</dd></div>
        <div><dt>重复提交</dt><dd>{{ info.isAllowRepet ? '允许' : '不允许，交卷后不能再进入作答' }}</dd></div>
      </dl>
      <section v-if="!isOpen" class="notice">测验不在开放时间内。</section>
      <div v-else-if="confirmingStart" class="submit-actions survey-confirm">
        <span>开始后计时 {{ info.duration }} 分钟，离开页面不会暂停。</span>
        <button :disabled="starting" type="button" @click="startQuiz">{{ starting ? '进入中' : '开始' }}</button>
        <button class="button-secondary" :disabled="starting" type="button" @click="confirmingStart = false">取消</button>
      </div>
      <div v-else class="submit-actions">
        <button :disabled="starting" type="button" @click="requestStart">{{ wasStarted() ? '继续作答' : '开始作答' }}</button>
        <a class="survey-draft-hint" :href="officialUrl" rel="noopener noreferrer" target="_blank">在 UCloud 作答</a>
      </div>
    </div>

    <form
      v-if="phase === 'answering' || phase === 'result'"
      class="survey-form"
      :class="{ 'quiz-result': phase === 'result' }"
      @submit.prevent="requestSubmit"
    >
      <div v-if="phase === 'answering'" class="quiz-bar" :class="{ urgent: remaining !== null && remaining < 5 * 60000 }">
        <strong>{{ remaining === null ? '不限时' : `剩余 ${formatCountdown(remaining)}` }}</strong>
        <span>答案逐题保存到 UCloud，离开页面不会暂停计时</span>
      </div>

      <section v-if="hasUnsupported" class="notice warning">
        有暂不支持的题型，请
        <a :href="officialUrl" rel="noopener noreferrer" target="_blank">到 UCloud 作答</a>。
      </section>

      <ol class="survey-questions">
        <li
          v-for="question in phase === 'answering' ? questions : resultQuestions"
          :key="question.id"
          class="survey-question"
          :class="phase === 'result' ? quizQuestionResult(question) : ''"
        >
          <div class="survey-question-title">
            <span class="survey-question-index">{{ question.label }}.</span>
            <span class="feed-kind">{{ QUIZ_QUESTION_TYPES[question.type] || '其他' }}</span>
            <div v-if="isHtml(question.stem)" class="survey-question-trunk" v-html="question.stem" />
            <div v-else class="survey-question-trunk">{{ question.stem }}</div>
            <span v-if="phase === 'answering'" class="quiz-save-state" :class="saveStates[question.id]">{{ saveStateText(question) }}</span>
            <span v-else class="quiz-score" :class="quizQuestionResult(question)">
              {{ { correct: '正确', partial: '部分正确', wrong: '错误' }[quizQuestionResult(question)] || '' }}
              {{ Number(question.score) >= 0 ? question.score : '-' }}/{{ question.points }}
            </span>
          </div>

          <div v-if="isChoiceQuestion(question)" class="survey-options">
            <label
              v-for="(option, index) in question.options"
              :key="option.id"
              class="survey-option"
              :class="phase === 'result' && { picked: isSelected(question.initialAnswer, option.id), right: option.isRight }"
            >
              <input
                v-if="isMultipleChoice(question)"
                :checked="isSelected(phase === 'answering' ? answers[question.id] : question.initialAnswer, option.id)"
                :disabled="phase !== 'answering' || submitting"
                type="checkbox"
                @change="toggleMultiple(question, option.id, $event.target.checked)"
              />
              <input
                v-else
                :checked="isSelected(phase === 'answering' ? answers[question.id] : question.initialAnswer, option.id)"
                :disabled="phase !== 'answering' || submitting"
                :name="`quiz-${question.id}`"
                type="radio"
                @change="chooseSingle(question, option.id)"
              />
              <span class="quiz-option-letter">{{ LETTERS[index] }}.</span>
              <span v-if="isHtml(option.content)" class="survey-question-trunk" v-html="option.content" />
              <span v-else>{{ option.content }}</span>
              <span v-if="phase === 'result' && isSelected(question.initialAnswer, option.id)" class="quiz-option-tag">你的答案</span>
              <span v-if="phase === 'result' && option.isRight" class="quiz-option-tag right">正确答案</span>
            </label>
          </div>

          <div v-else-if="question.type === 4" class="quiz-blanks">
            <label v-for="index in question.blankCount" :key="index" class="survey-text">
              <span class="quiz-blank-label">第 {{ index }} 空</span>
              <input
                v-if="phase === 'answering'"
                v-model="answers[question.id][index - 1]"
                :disabled="submitting"
                type="text"
                @blur="flushText(question)"
                @input="editText(question)"
              />
              <input v-else :value="question.initialAnswer[index - 1] || ''" disabled type="text" />
            </label>
          </div>

          <label v-else-if="question.type === 6" class="survey-text">
            <textarea
              v-if="phase === 'answering'"
              v-model="answers[question.id]"
              :disabled="submitting"
              @blur="flushText(question)"
              @input="editText(question)"
            />
            <textarea v-else :value="question.initialAnswer[0] || ''" disabled />
            <span v-if="phase === 'answering'">需要上传附件的话请到 UCloud 作答</span>
          </label>

          <div v-if="phase === 'result' && question.analysis" class="quiz-analysis">
            <strong>解析</strong>
            <div v-if="isHtml(question.analysis)" v-html="question.analysis" />
            <div v-else>{{ question.analysis }}</div>
          </div>
        </li>
      </ol>

      <section v-if="submitError" class="notice error">{{ submitError }}</section>

      <template v-if="phase === 'answering'">
        <div v-if="confirmingSubmit" class="submit-actions survey-confirm">
          <span v-if="confirmingSubmit.labels.length">第 {{ confirmingSubmit.labels.join('、') }} 题没有保存答案，仍要交卷？</span>
          <span v-else>{{ info?.isAllowRepet ? '确认交卷？' : '本测验不允许重复提交，交卷后不能再进入作答。确认交卷？' }}</span>
          <button :disabled="submitting" type="button" @click="submit(false)">{{ submitting ? '交卷中' : '交卷' }}</button>
          <button class="button-secondary" :disabled="submitting" type="button" @click="confirmingSubmit = null">继续答题</button>
        </div>
        <div v-else class="submit-actions">
          <button :disabled="submitting" type="submit">{{ submitting ? '检查中' : '交卷' }}</button>
        </div>
      </template>
      <div v-else-if="info?.isAllowRepet && isOpen" class="submit-actions">
        <template v-if="confirmingStart">
          <span class="survey-draft-hint">重新作答会重新计时，需要再次交卷。</span>
          <button :disabled="starting" type="button" @click="startQuiz">{{ starting ? '进入中' : '开始' }}</button>
          <button class="button-secondary" :disabled="starting" type="button" @click="confirmingStart = false">取消</button>
        </template>
        <button v-else class="button-secondary" type="button" @click="confirmingStart = true">重新作答</button>
      </div>
    </form>
  </section>
</template>
