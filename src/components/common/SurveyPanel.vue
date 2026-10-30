<script setup>
import { computed, ref, watch } from 'vue'
import { assertUcloudOk, buildActivityUrl, getSurveyDetail, isTokenExpired, submitSurveyAnswers } from '../../api/ucloud.js'
import {
  SUBJECTIVE_MAX_LENGTH,
  SURVEY_QUESTION_TYPES,
  buildSurveyAnswers,
  emptySurveyAnswer,
  isSupportedSurveyQuestion,
  isSurveyAnswered,
  normalizeSurveyQuestions,
  readSurveyDraft,
  removeSurveyDraft,
  restoreSurveyAnswers,
  writeSurveyDraft,
} from '../../utils/survey.js'
import { trimSeconds } from '../../utils/deadline.js'

const props = defineProps({
  surveyId: {
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
  // 本次会话里已经提交过（例如提交后用浏览器后退回到这里），不再显示表单
  alreadySubmitted: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['loaded', 'submitted', 'expired'])

const detail = ref(null)
const questions = ref([])
const answers = ref({})
const loading = ref(false)
const error = ref('')
const showMissing = ref(false)
const confirming = ref(false)
const submitting = ref(false)
const submitError = ref('')
const submitted = ref(false)
const restoredDraft = ref(false)
let loadRequestId = 0
// 草稿恢复之后才开始写回，避免读取问卷时的空答案把草稿覆盖掉
let draftReady = false

const answeredCount = computed(
  () => questions.value.filter((question) => isSurveyAnswered(question, answers.value[question.id])).length,
)
const hasUnsupportedQuestion = computed(() => questions.value.some((question) => !isSupportedSurveyQuestion(question)))
const isSubmitted = computed(() => submitted.value || props.alreadySubmitted)
const officialUrl = computed(() => buildActivityUrl({ kind: 'survey', activityId: props.surveyId }))
const subtitle = computed(() => {
  if (!detail.value) return error.value ? '读取失败' : '正在读取问卷'

  return [
    `共 ${questions.value.length} 题`,
    Number(detail.value.style) === 1 ? '实名' : '匿名',
    detail.value.endTime ? `截止 ${trimSeconds(detail.value.endTime)}` : '',
  ]
    .filter(Boolean)
    .join(' · ')
})

function isHtml(value) {
  return typeof value === 'string' && /<\/?[a-z][\s\S]*>/i.test(value)
}

function isMissing(question) {
  return showMissing.value && !isSurveyAnswered(question, answers.value[question.id])
}

async function loadSurvey() {
  const requestId = ++loadRequestId
  detail.value = null
  questions.value = []
  answers.value = {}
  error.value = ''
  showMissing.value = false
  confirming.value = false
  submitError.value = ''
  submitted.value = false
  restoredDraft.value = false
  draftReady = false
  if (!props.surveyId) {
    error.value = '链接里没有问卷编号'
    return
  }
  if (!props.token) {
    error.value = '请先回到首页登录'
    return
  }

  loading.value = true
  try {
    const { result } = await getSurveyDetail(props.token, props.surveyId)
    if (requestId !== loadRequestId) return
    if (isTokenExpired(result)) {
      emit('expired')
      return
    }
    assertUcloudOk(result, '问卷')

    const data = result.body?.data || {}
    detail.value = data
    questions.value = normalizeSurveyQuestions(data.questionPage?.records)
    answers.value = Object.fromEntries(questions.value.map((question) => [question.id, emptySurveyAnswer(question)]))
    emit('loaded', data)
    restoreDraft()
  } catch (loadError) {
    if (requestId === loadRequestId) error.value = loadError?.message || '问卷读取失败'
  } finally {
    if (requestId === loadRequestId) loading.value = false
  }
}

// userId 可能比问卷详情晚到，两者都齐了才恢复草稿；用户已经开始作答就不再覆盖
function restoreDraft() {
  if (draftReady || !detail.value || !props.userId) return
  draftReady = true
  if (answeredCount.value > 0) return

  const draft = readSurveyDraft(localStorage, props.userId, props.surveyId)
  if (!draft) return
  answers.value = restoreSurveyAnswers(questions.value, draft)
  restoredDraft.value = answeredCount.value > 0
}

function requestSubmit() {
  submitError.value = ''
  const missing = questions.value.length - answeredCount.value
  if (missing > 0) {
    showMissing.value = true
    submitError.value = `还有 ${missing} 题没有作答`
    return
  }

  confirming.value = true
}

async function confirmSubmit() {
  submitting.value = true
  submitError.value = ''
  try {
    const { result } = await submitSurveyAnswers(
      props.token,
      buildSurveyAnswers(questions.value, answers.value, props.userId),
    )
    if (isTokenExpired(result)) {
      emit('expired')
      return
    }
    assertUcloudOk(result, '提交问卷')

    submitted.value = true
    removeSurveyDraft(localStorage, props.userId, props.surveyId)
    emit('submitted', props.surveyId)
  } catch (submitFailure) {
    submitError.value = submitFailure?.message || '提交失败'
  } finally {
    submitting.value = false
    confirming.value = false
  }
}

watch(() => [props.surveyId, props.token], loadSurvey, { immediate: true })
watch(() => props.userId, restoreDraft)
watch(
  answers,
  () => {
    if (draftReady && !isSubmitted.value) {
      writeSurveyDraft(localStorage, props.userId, props.surveyId, questions.value, answers.value)
    }
  },
  { deep: true },
)
</script>

<template>
  <section class="section-block survey-panel">
    <div class="section-header">
      <div>
        <h2>问卷内容</h2>
        <p>{{ subtitle }}</p>
      </div>
      <span v-if="questions.length && !isSubmitted" class="section-count">
        已答 {{ answeredCount }}/{{ questions.length }}
      </span>
    </div>

    <div v-if="loading" class="list-placeholder" role="status">正在读取问卷</div>
    <section v-else-if="error" class="notice error">{{ error }}</section>
    <section v-else-if="isSubmitted" class="notice success">问卷已提交。</section>

    <form v-else-if="detail" class="survey-form" @submit.prevent="requestSubmit">
      <div v-if="detail.description && isHtml(detail.description)" class="survey-description" v-html="detail.description" />
      <p v-else-if="detail.description" class="survey-description">{{ detail.description }}</p>

      <section v-if="restoredDraft" class="notice">已恢复上次没提交的答案。</section>

      <section v-if="hasUnsupportedQuestion" class="notice warning">
        问卷里有暂不支持的题型，请
        <a :href="officialUrl" rel="noopener noreferrer" target="_blank">到 UCloud 作答</a>。
      </section>

      <ol class="survey-questions">
        <li
          v-for="(question, index) in questions"
          :key="question.id"
          class="survey-question"
          :class="{ missing: isMissing(question) }"
        >
          <div class="survey-question-title">
            <span class="survey-question-index">{{ index + 1 }}.</span>
            <span class="feed-kind">{{ SURVEY_QUESTION_TYPES[question.type] || '其他' }}</span>
            <div v-if="isHtml(question.trunk)" class="survey-question-trunk" v-html="question.trunk" />
            <div v-else class="survey-question-trunk">{{ question.trunk }}</div>
          </div>

          <div v-if="question.type === 1 || question.type === 2" class="survey-options">
            <label v-for="option in question.optionVOList" :key="option.id" class="survey-option">
              <input
                v-if="question.type === 1"
                v-model="answers[question.id]"
                :disabled="submitting"
                :name="`survey-${question.id}`"
                :value="option.opt"
                type="radio"
              />
              <input
                v-else
                v-model="answers[question.id]"
                :disabled="submitting"
                :value="option.opt"
                type="checkbox"
              />
              <span>{{ option.content }}</span>
            </label>
          </div>

          <label v-else-if="question.type === 3" class="survey-text">
            <textarea
              v-model="answers[question.id]"
              :disabled="submitting"
              :maxlength="SUBJECTIVE_MAX_LENGTH"
              placeholder="请输入内容"
            />
            <span>{{ answers[question.id].length }}/{{ SUBJECTIVE_MAX_LENGTH }}</span>
          </label>
        </li>
      </ol>

      <section v-if="submitError" class="notice error">{{ submitError }}</section>

      <div v-if="confirming" class="submit-actions survey-confirm">
        <span>提交后不能修改，确认提交？</span>
        <button :disabled="submitting" type="button" @click="confirmSubmit">
          {{ submitting ? '提交中' : '确认提交' }}
        </button>
        <button class="button-secondary" :disabled="submitting" type="button" @click="confirming = false">
          再看看
        </button>
      </div>
      <div v-else class="submit-actions">
        <button :disabled="hasUnsupportedQuestion || !userId" type="submit">提交问卷</button>
        <span class="survey-draft-hint">答案会自动保存在本机，提交前离开也不会丢</span>
      </div>
    </form>
  </section>
</template>
