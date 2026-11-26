<script setup>
import { ref } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  name: { type: String, required: true },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])
const hovered = ref(0)
</script>

<template>
  <div class="star-rating" @mouseleave="hovered = 0">
    <div class="star-options">
      <label v-for="value in 5" :key="value" class="star-option" :class="{ lit: value <= (disabled ? modelValue : hovered || modelValue), disabled }" :title="`${value} 星`" @mouseenter="!disabled && (hovered = value)">
        <input :checked="modelValue === value" :disabled="disabled" :name="name" :value="value" type="radio" :aria-label="`${value} 星`" required @change="emit('update:modelValue', value)" />
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.85 5.78 6.38.93-4.61 4.49 1.09 6.35L12 17.35l-5.71 3 1.09-6.35-4.61-4.49 6.38-.93Z" /></svg>
      </label>
    </div>
    <span class="rating-value" aria-live="polite">{{ modelValue ? `${modelValue} / 5` : '未评分' }}</span>
  </div>
</template>

<style scoped>
.star-rating { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
.star-options { display: flex; gap: 2px; }
.star-option { display: grid; place-items: center; position: relative; width: 44px; height: 44px; border-radius: 8px; cursor: pointer; }
.star-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.star-option svg { width: 33px; height: 33px; fill: transparent; stroke: #a5afbb; stroke-width: 1.5; stroke-linejoin: round; transition: fill .12s, stroke .12s, transform .12s; }
.star-option.lit svg { fill: #edb640; stroke: #d89e23; }
.star-option:not(.disabled):hover svg { transform: scale(1.08); }
.star-option:focus-within { outline: 2px solid var(--cloud-blue); outline-offset: 1px; }
.star-option.disabled { cursor: default; opacity: .65; }
.rating-value { color: var(--muted); font-size: 14px; font-weight: 400; min-width: 46px; }
@media (prefers-reduced-motion: reduce) { .star-option svg { transition: none; } }
</style>
