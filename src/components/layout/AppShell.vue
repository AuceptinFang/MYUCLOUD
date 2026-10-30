<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import UcloudCreatures from '../common/UcloudCreatures.vue'
import { PREVIEW_MESSAGE, STATIC_PREVIEW } from '../../utils/runtime.js'
import { normalizeReportCoverUrl } from '../../utils/report-cover-url.js'

const props = defineProps({
  userLabel: { type: String, default: '未登录' },
  authenticated: { type: Boolean, default: false },
  activeView: {
    type: String,
    required: true,
  },
  debugEnabled: {
    type: Boolean,
    default: false,
  },
  plugins: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['change-view', 'feedback'])
const shell = ref(null)
const content = ref(null)
const reportCoverUrl = normalizeReportCoverUrl(import.meta.env.VITE_REPORT_COVER_URL)
const navigationItems = computed(() => [
  { view: 'study', name: '课程与作业' },
  { view: 'timetable', name: '课表' },
  ...props.plugins,
  ...(props.debugEnabled ? [{ view: 'debug', name: '调试' }] : []),
])
const activeNavigation = computed(() =>
  ['course', 'assignment', 'survey'].includes(props.activeView) ? 'study' : props.activeView,
)
const pageTitle = computed(() => {
  if (props.activeView === 'course') return '课程详情'
  if (props.activeView === 'assignment') return '作业详情'
  if (props.activeView === 'survey') return '问卷'
  return navigationItems.value.find((item) => item.view === props.activeView)?.name || '学习服务'
})

let spacing
let unmounted = false

onMounted(async () => {
  // 间距控制器是调界面用的工具，和调试页一样只在开发环境挂载
  if (!props.debugEnabled) return
  const { mountSpacingControl } = await import('../../vendor/perrin/spacing-control.js')
  if (!unmounted) {
    spacing = mountSpacingControl({ root: shell.value, storageKey: 'myucloud-spacing-v1' })
  }
})

onUnmounted(() => {
  unmounted = true
  spacing?.destroy()
})
</script>

<template>
  <main ref="shell" class="app-shell ui-app">
    <button class="skip-link" type="button" @click="content?.focus()">跳转到内容</button>
    <header class="app-header">
      <a class="app-brand" href="#study">
        <UcloudCreatures />
      </a>
      <nav class="view-tabs" aria-label="页面">
        <button
          v-for="item in navigationItems"
          :key="item.view"
          :aria-current="activeNavigation === item.view ? 'page' : undefined"
          type="button"
          @click="emit('change-view', item.view)"
        >
          {{ item.name }}
        </button>
      </nav>
      <div class="header-tools">
        <a v-if="reportCoverUrl" :href="reportCoverUrl">报告封面</a>
        <button v-if="!STATIC_PREVIEW" type="button" @click="emit('feedback')">反馈</button>
        <span v-if="authenticated" class="system-account">{{ userLabel }}</span>
      </div>
    </header>
    <section class="system-main" aria-label="当前页面">
      <div class="system-page-title">
        <h1>{{ pageTitle }}</h1>
        <span v-if="activeView === 'study'" class="page-description">课程资料与作业安排</span>
      </div>
      <p v-if="STATIC_PREVIEW" class="notice" role="status">{{ PREVIEW_MESSAGE }}</p>
      <div ref="content" id="workspace-content" class="workspace-content" tabindex="-1">
        <slot />
      </div>
    </section>
  </main>
</template>
