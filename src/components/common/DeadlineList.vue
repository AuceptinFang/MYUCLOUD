<script setup>
import { computed } from 'vue'
import AssignmentStatus from './AssignmentStatus.vue'

const props = defineProps({
  assignments: {
    type: Array,
    default: () => [],
  },
  includeCompleted: {
    type: Boolean,
    default: false,
  },
  lastLoadedAt: {
    type: String,
    default: '',
  },
  pageSize: {
    type: Number,
    default: 20,
  },
  title: {
    type: String,
    default: '待办作业',
  },
  subtitle: {
    type: String,
    default: '',
  },
  showControls: {
    type: Boolean,
    default: true,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
  emptyText: {
    type: String,
    default: '暂无作业数据',
  },
  loadingText: {
    type: String,
    default: '正在读取作业数据',
  },
  selectedAssignmentId: {
    type: String,
    default: '',
  },
  loadingAssignmentId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['update:includeCompleted', 'update:pageSize', 'select'])

const pageSizeOptions = computed(() =>
  [...new Set([10, 20, 50, 100, Number(props.pageSize)])]
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right),
)

const assignmentGroups = computed(() => {
  const groups = [
    {
      key: 'overdue',
      label: '已逾期',
      hint: '需要尽快处理',
      assignments: props.assignments.filter((assignment) => assignment.level === 'overdue'),
    },
    {
      key: 'upcoming',
      label: '近期',
      hint: '七天内截止',
      assignments: props.assignments.filter(
        (assignment) => assignment.level === 'danger' || assignment.level === 'warning',
      ),
    },
    {
      key: 'later',
      label: '稍后',
      hint: '时间相对充足',
      assignments: props.assignments.filter(
        (assignment) =>
          !assignment.isCompleted &&
          !['overdue', 'danger', 'warning'].includes(assignment.level),
      ),
    },
    {
      key: 'completed',
      label: '已完成',
      hint: '已经提交',
      assignments: props.assignments.filter((assignment) => assignment.isCompleted),
    },
  ]

  return groups.filter((group) => group.assignments.length > 0)
})

function getRelativeDeadline(assignment) {
  if (assignment.isCompleted) return '已完成'
  if (assignment.daysLeft === null || assignment.daysLeft === undefined) return '未设置时间'
  if (assignment.daysLeft < 0) return `已逾期 ${Math.abs(assignment.daysLeft)} 天`
  if (assignment.daysLeft === 0) return '今天截止'
  if (assignment.daysLeft === 1) return '明天截止'

  return `还剩 ${assignment.daysLeft} 天`
}
</script>

<template>
  <section class="section-block">
    <div class="section-header">
      <div>
        <h2>{{ title }}</h2>
        <p>{{ subtitle || (lastLoadedAt ? `更新于 ${lastLoadedAt}` : '等待加载') }}</p>
      </div>
      <div v-if="showControls" class="deadline-controls">
        <label class="size-control">
          显示
          <select
            :value="pageSize"
            @change="emit('update:pageSize', Number($event.target.value) || 20)"
          >
            <option v-for="size in pageSizeOptions" :key="size" :value="size">{{ size }} 项</option>
          </select>
        </label>
        <label class="toggle-control">
          <input
            :checked="includeCompleted"
            type="checkbox"
            @change="emit('update:includeCompleted', $event.target.checked)"
          />
          <span class="toggle-track" aria-hidden="true"><i /></span>
          <span>显示已提交</span>
        </label>
      </div>
    </div>

    <div v-if="loading" class="skeleton-list" :aria-label="loadingText">
      <div v-for="index in 4" :key="index" class="skeleton-row">
        <div>
          <i class="skeleton-line" />
          <i class="skeleton-line skeleton-line-short" />
        </div>
        <i class="skeleton-line skeleton-line-time" />
      </div>
    </div>
    <section v-else-if="error" class="notice error">
      {{ error }}
    </section>
    <div v-else-if="assignments.length === 0" class="empty-state empty-state-card">
      <span class="empty-cloud" aria-hidden="true"><i /><i /></span>
      <strong>{{ emptyText }}</strong>
      <p>{{ includeCompleted ? '当前没有可显示的作业记录' : '新的待办作业会显示在这里' }}</p>
    </div>

    <div v-else class="deadline-groups">
      <section v-for="group in assignmentGroups" :key="group.key" class="deadline-group">
        <div class="deadline-group-header" :class="`group-${group.key}`">
          <div>
            <strong>{{ group.label }}</strong>
            <span>{{ group.hint }}</span>
          </div>
          <small>{{ group.assignments.length }}</small>
        </div>

        <div class="deadline-list">
          <button
            v-for="assignment in group.assignments"
            :key="assignment.id"
            :aria-pressed="assignment.id === selectedAssignmentId"
            class="deadline-item"
            :class="[
              `level-${assignment.level}`,
              {
                active: assignment.id === selectedAssignmentId,
                loading: assignment.id === loadingAssignmentId,
              },
            ]"
            type="button"
            @click="emit('select', assignment)"
          >
            <div class="deadline-main">
              <div class="deadline-title">
                <strong>{{ assignment.title }}</strong>
                <AssignmentStatus :level="assignment.level" :status="assignment.status" />
              </div>
              <p>
                <span v-if="assignment.courseName">{{ assignment.courseName }}</span>
                <span v-if="assignment.courseName && assignment.chapter"> · </span>
                <span>{{ assignment.chapter }}</span>
              </p>
            </div>
            <div class="deadline-time">
              <span class="deadline-relative" :class="`level-${assignment.level}`">
                {{ getRelativeDeadline(assignment) }}
              </span>
              <strong>{{ assignment.deadline || '未设置' }}</strong>
              <small v-if="assignment.submitTime">提交 {{ assignment.submitTime }}</small>
            </div>
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
