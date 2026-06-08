<script setup>
defineProps({
  status: {
    type: String,
    required: true,
  },
  level: {
    type: String,
    default: 'normal',
  },
})
</script>

<template>
  <span class="assignment-status" :class="`level-${level}`">
    {{ status }}
  </span>
</template>
