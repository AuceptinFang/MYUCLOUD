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
  <section class="section-block course-section">
    <div class="section-header">
      <h2>我的课程</h2>
      <span v-if="courses.length" class="record-count">{{ courses.length }} 门课程</span>
    </div>
    <div v-if="loading" class="list-placeholder" role="status">正在读取课程…</div>
    <div v-else-if="!courses.length" class="list-placeholder">
      <strong>课程尚未加载</strong>
      <p>登录后，这里会列出你本学期的课程。</p>
    </div>
    <ul v-else class="course-register">
      <li v-for="(course, index) in courses" :key="getCourseId(course)">
        <button
          class="register-course"
          :class="{ selected: getCourseId(course) === selectedCourseId }"
          type="button"
          :disabled="getCourseId(course) === loadingCourseId"
          @click="emit('select', course)"
        >
          <span class="course-index" aria-hidden="true">
            {{ String(index + 1).padStart(2, '0') }}
          </span>
          <span class="register-copy">
            <strong>{{ course.siteName || '未命名课程' }}</strong>
            <small>
              {{ getTeacherNames(course) }}
              <span v-if="course.termName">· {{ course.termName }}</span>
            </small>
          </span>
          <span class="register-arrow" aria-hidden="true">
            {{ getCourseId(course) === loadingCourseId ? '…' : '›' }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
