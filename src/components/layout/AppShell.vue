<script setup>
import UcloudCreatures from '../common/UcloudCreatures.vue'

defineProps({
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

const emit = defineEmits(['change-view'])
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div class="app-brand">
        <UcloudCreatures />
      </div>

      <nav class="view-tabs" aria-label="页面">
        <button
          :class="{ active: activeView === 'study' }"
          type="button"
          @click="emit('change-view', 'study')"
        >
          首页
        </button>
        <button
          :class="{ active: activeView === 'timetable' }"
          type="button"
          @click="emit('change-view', 'timetable')"
        >
          课表
        </button>
        <button
          v-for="p in plugins"
          :key="p.view"
          :class="{ active: activeView === p.view }"
          type="button"
          @click="emit('change-view', p.view)"
        >
          {{ p.name }}
        </button>
        <button
          v-if="debugEnabled"
          :class="{ active: activeView === 'debug' }"
          type="button"
          @click="emit('change-view', 'debug')"
        >
          调试
        </button>
      </nav>
    </header>

    <slot />
  </main>
</template>
