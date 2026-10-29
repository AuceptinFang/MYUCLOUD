<script setup>
import { computed } from 'vue'
import AssignmentStatus from './AssignmentStatus.vue'
import { groupAssignments, formatRelativeDeadline } from '../../utils/assignment-display.js'

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

const assignmentGroups = computed(() => groupAssignments(props.assignments))
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
          <span>显示已提交与往期</span>
        </label>
      </div>
    </div>

    <section v-if="error" class="notice error">{{ error }}</section>
    <div v-else-if="loading" class="list-placeholder" role="status">{{ loadingText }}</div>
    <div v-else-if="!assignments.length" class="list-placeholder">
      <strong>{{ emptyText }}</strong>
      <p>已加载的作业会按截止时间排列。</p>
    </div>
    <div v-else class="assignment-feed">
      <section
        v-for="group in assignmentGroups"
        :key="group.key"
        class="feed-group"
        :class="`group-${group.key}`"
      >
        <h3 class="feed-group-title">
          {{ group.label }}
          <small>{{ group.hint }}</small>
          <span>{{ group.assignments.length }}</span>
        </h3>
        <button
          v-for="assignment in group.assignments"
          :key="assignment.id"
          class="feed-assignment"
          :class="{ selected: assignment.id === selectedAssignmentId }"
          type="button"
          :disabled="assignment.id === loadingAssignmentId"
          @click="emit('select', assignment)"
        >
          <span class="feed-assignment-copy">
            <span class="feed-assignment-title">{{ assignment.title }}</span>
            <span class="feed-assignment-meta">
              {{ assignment.courseName || '未标注课程' }}
              <span v-if="assignment.chapter">· {{ assignment.chapter }}</span>
            </span>
            <span class="feed-assignment-date">截止 {{ assignment.deadline || '未设置' }}</span>
          </span>
          <span class="feed-assignment-state">
            <AssignmentStatus :level="assignment.level" :status="assignment.status" />
            <span class="feed-relative" :class="`level-${assignment.level}`">
              {{
                assignment.id === loadingAssignmentId
                  ? '读取中…'
                  : formatRelativeDeadline(assignment)
              }}
            </span>
          </span>
        </button>
      </section>
    </div>
  </section>
</template>
