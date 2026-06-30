<script setup>
defineProps({
  activeView: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '课程与待办作业',
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
      <div>
        <h1>UCLOUD</h1>
        <p>{{ subtitle }}</p>
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
          v-for="p in plugins"
          :key="p.view"
          :class="{ active: activeView === p.view }"
          type="button"
          @click="emit('change-view', p.view)"
        >
          {{ p.name }}
        </button>
        <button
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
