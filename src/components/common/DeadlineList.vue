<script setup>
import AssignmentStatus from './AssignmentStatus.vue'

defineProps({
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
          作业数
          <input
            min="1"
            type="number"
            :value="pageSize"
            @input="emit('update:pageSize', Number($event.target.value) || 20)"
          />
        </label>
        <label class="check-control">
          <input
            :checked="includeCompleted"
            type="checkbox"
            @change="emit('update:includeCompleted', $event.target.checked)"
          />
          显示已提交
        </label>
      </div>
    </div>

    <div v-if="loading" class="empty-state">{{ loadingText }}</div>
    <section v-else-if="error" class="notice error">
      {{ error }}
    </section>
    <div v-else-if="assignments.length === 0" class="empty-state">{{ emptyText }}</div>

    <div v-else class="deadline-list">
      <button
        v-for="assignment in assignments"
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
          <span>截止</span>
          <strong>{{ assignment.deadline || '未设置' }}</strong>
          <small v-if="assignment.submitTime">提交 {{ assignment.submitTime }}</small>
        </div>
      </button>
    </div>
  </section>
</template>
