<script setup>
defineProps({
  courses: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  selectedCourseId: {
    type: String,
    default: '',
  },
  loadingCourseId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select'])

function getCourseId(course) {
  return String(course.id || course.siteId || '')
}

function getTeacherNames(course) {
  const teachers = Array.isArray(course.teachers) ? course.teachers : []
  const names = teachers
    .map((teacher) => teacher.realName || teacher.name || teacher.account)
    .filter(Boolean)

  return names.length ? names.join('、') : course.primaryTeachers || '未标注'
}
</script>

<template>
  <section class="section-block">
    <div class="section-header">
      <div>
        <h2>课程</h2>
      </div>
      <span class="section-count">{{ courses.length }}</span>
    </div>

    <div v-if="loading" class="course-skeleton-grid" aria-label="正在读取课程">
      <div v-for="index in 3" :key="index" class="skeleton-course-card">
        <i class="skeleton-line skeleton-line-title" />
        <i class="skeleton-line skeleton-line-short" />
        <i class="skeleton-chip" />
      </div>
    </div>

    <div v-else-if="courses.length === 0" class="empty-state empty-state-card">
      <span class="empty-cloud" aria-hidden="true"><i /><i /></span>
      <strong>暂无课程</strong>
      <p>登录并加载数据后，课程会显示在这里</p>
    </div>

    <div v-else class="course-grid">
      <button
        v-for="(course, index) in courses"
        :key="getCourseId(course)"
        :aria-pressed="getCourseId(course) === selectedCourseId"
        class="course-card"
        :class="{
          active: getCourseId(course) === selectedCourseId,
          loading: getCourseId(course) === loadingCourseId,
        }"
        type="button"
        @click="emit('select', course)"
      >
        <div class="course-content">
          <div class="course-heading">
            <strong>{{ course.siteName || '未命名课程' }}</strong>
            <span aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
          </div>
          <p class="course-teacher">{{ getTeacherNames(course) }}</p>
          <div class="course-meta">
            <span class="course-term">{{ course.termName || '无学期' }}</span>
            <span class="course-department">{{ course.departmentName || course.department || '无院系' }}</span>
          </div>
        </div>
      </button>
    </div>
  </section>
</template>
