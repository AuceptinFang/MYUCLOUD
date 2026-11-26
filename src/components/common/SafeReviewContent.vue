<script setup>
import { computed } from 'vue'
import DOMPurify from 'dompurify'

const props = defineProps({ content: { type: String, default: '' } })
const html = computed(() => typeof DOMPurify.sanitize === 'function' ? DOMPurify.sanitize(props.content, {
  ALLOWED_TAGS: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'pre', 'code', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
  ALLOWED_ATTR: ['colspan', 'rowspan'],
}) : '')
</script>

<template>
  <div v-if="html" class="review-content" v-html="html" />
  <pre v-else class="review-content">{{ content }}</pre>
</template>

<style scoped>
.review-content { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; }
.review-content :deep(table) { display: block; max-width: 100%; overflow-x: auto; border-collapse: collapse; }
.review-content :deep(td), .review-content :deep(th) { padding: 8px; border: 1px solid var(--line); }
</style>
