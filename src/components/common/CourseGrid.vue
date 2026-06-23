<script setup>
defineProps({
  courses: {
    type: Array,
    default: () => [],
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

    <div v-if="courses.length === 0" class="empty-state">暂无课程数据</div>

    <div v-else class="course-grid">
      <button
        v-for="course in courses"
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
          <strong>{{ course.siteName || '未命名课程' }}</strong>
          <p>{{ getTeacherNames(course) }}</p>
          <div class="course-meta">
            <span>{{ course.termName || '无学期' }}</span>
            <span>{{ course.departmentName || course.department || '无院系' }}</span>
          </div>
        </div>
      </button>
    </div>
  </section>
</template>
