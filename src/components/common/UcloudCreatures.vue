<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const letters = [
  { value: 'U', drift: 2.1 },
  { value: 'C', drift: 1.5 },
  { value: 'L', drift: 1.9 },
  { value: 'O', drift: 1.3 },
  { value: 'U', drift: 1.7 },
  { value: 'D', drift: 1.1 },
]

const brand = ref(null)
let animationFrame = 0
let currentX = 0
let currentY = 0
let targetX = 0
let targetY = 0

function renderLookDirection() {
  const root = brand.value
  if (!root) return

  currentX += (targetX - currentX) * 0.14
  currentY += (targetY - currentY) * 0.14
  root.style.setProperty('--pupil-x', `${(currentX * 1.4).toFixed(2)}px`)
  root.style.setProperty('--pupil-y', `${(currentY * 1.4).toFixed(2)}px`)

  for (const [index, creature] of [...root.children].entries()) {
    const drift = letters[index]?.drift || 1
    creature.style.setProperty('--body-x', `${(currentX * drift).toFixed(2)}px`)
    creature.style.setProperty('--body-y', `${(currentY * drift * 0.7).toFixed(2)}px`)
    creature.style.setProperty('--tilt', `${(currentX * 0.7).toFixed(2)}deg`)
  }

  if (Math.abs(targetX - currentX) > 0.002 || Math.abs(targetY - currentY) > 0.002) {
    animationFrame = window.requestAnimationFrame(renderLookDirection)
  } else {
    animationFrame = 0
  }
}

function scheduleRender() {
  if (!animationFrame) animationFrame = window.requestAnimationFrame(renderLookDirection)
}

function followPointer(event) {
  const root = brand.value
  if (!root) return

  const bounds = root.getBoundingClientRect()
  const dx = event.clientX - (bounds.left + bounds.width / 2)
  const dy = event.clientY - (bounds.top + bounds.height / 2)
  const distance = Math.hypot(dx, dy)
  const proximity = Math.max(0.25, 1 - distance / 1400)

  targetX = Math.max(-1, Math.min(1, dx / 360)) * proximity
  targetY = Math.max(-1, Math.min(1, dy / 280)) * proximity
  scheduleRender()
}

function returnToRest() {
  targetX = 0
  targetY = 0
  scheduleRender()
}

onMounted(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const coarsePointer = window.matchMedia('(pointer: coarse)')

  if (!reduceMotion.matches && !coarsePointer.matches) {
    window.addEventListener('pointermove', followPointer, { passive: true })
    window.addEventListener('blur', returnToRest)
    document.documentElement.addEventListener('mouseleave', returnToRest)
  }
})

onUnmounted(() => {
  window.removeEventListener('pointermove', followPointer)
  window.removeEventListener('blur', returnToRest)
  document.documentElement.removeEventListener('mouseleave', returnToRest)
  window.cancelAnimationFrame(animationFrame)
})
</script>

<template>
  <div ref="brand" class="ucloud-creatures" role="img" aria-label="UCLOUD">
    <span
      v-for="(letter, index) in letters"
      :key="`${letter.value}-${index}`"
      class="letter-creature"
      :style="{ '--rest-tilt': `${(index - 2.5) * 0.16}deg` }"
      aria-hidden="true"
    >
      <span class="creature-eyes">
        <i><b /></i>
        <i><b /></i>
      </span>
      <span class="creature-body">{{ letter.value }}</span>
      <span class="creature-feet"><i /><i /></span>
    </span>
  </div>
</template>

<style scoped>
.ucloud-creatures {
  --pupil-x: 0px;
  --pupil-y: 0px;
  display: inline-flex;
  align-items: flex-end;
  gap: 5px;
  min-height: 51px;
  padding: 4px 1px 3px;
  cursor: default;
  user-select: none;
}

.letter-creature {
  --body-x: 0px;
  --body-y: 0px;
  --tilt: 0deg;
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 41px;
  transform:
    translate(var(--body-x), var(--body-y))
    rotate(calc(var(--tilt) + var(--rest-tilt)));
  transform-origin: 50% 90%;
  transition: filter 180ms ease;
}

.creature-body {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 32px;
  height: 36px;
  border: 1px solid #c7d7e1;
  border-radius: 10px 10px 8px 8px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 3px 7px rgba(36, 74, 100, 0.07);
  color: var(--cloud-blue-strong);
  font-size: 20px;
  font-weight: 850;
  line-height: 1;
  letter-spacing: -0.04em;
}

.letter-creature:first-child .creature-body {
  border-color: var(--cloud-blue);
  background: var(--cloud-blue);
  color: #ffffff;
  box-shadow: 0 4px 9px rgba(36, 74, 100, 0.16);
}

.letter-creature:nth-child(2n) .creature-body {
  border-radius: 12px 8px 11px 7px;
}

.letter-creature:nth-child(3n) .creature-body {
  border-radius: 8px 12px 7px 11px;
}

.creature-eyes {
  position: absolute;
  z-index: 2;
  top: -2px;
  left: 50%;
  display: flex;
  gap: 3px;
  transform: translateX(-50%);
}

.creature-eyes i {
  position: relative;
  display: block;
  width: 8px;
  height: 8px;
  overflow: hidden;
  border: 1px solid #8da8b8;
  border-radius: 50%;
  background: #ffffff;
}

.creature-eyes b {
  position: absolute;
  top: 2px;
  left: 2px;
  display: block;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #17384d;
  transform: translate(var(--pupil-x), var(--pupil-y));
}

.creature-feet {
  position: absolute;
  bottom: -1px;
  left: 50%;
  display: flex;
  gap: 11px;
  transform: translateX(-50%);
}

.creature-feet i {
  display: block;
  width: 6px;
  height: 4px;
  border-radius: 50% 50% 2px 2px;
  background: #6f899a;
}

.ucloud-creatures:hover .letter-creature {
  filter: saturate(1.08);
}

@media (prefers-reduced-motion: reduce) {
  .letter-creature,
  .creature-eyes b {
    transform: none;
  }
}
</style>
