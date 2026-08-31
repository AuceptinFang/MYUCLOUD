<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const letters = [
  {
    value: 'U',
    drift: 2.1,
    path: 'M5 2H14V27C14 32.5 16.5 35 20 35C23.5 35 26 32.5 26 27V2H35V27.5C35 38 29 43 20 43C11 43 5 38 5 27.5Z',
  },
  {
    value: 'C',
    drift: 1.5,
    path: 'M35 7L29 15C26.5 12 24 10 20 10C14.5 10 11 14.5 11 22C11 29.5 14.5 34 20 34C24 34 27 32 29.5 28.5L36 36C32 40.5 27 43 19.5 43C8.5 43 2 34.5 2 22C2 9.5 9 1 20 1C27 1 32 3 35 7Z',
  },
  {
    value: 'L',
    drift: 1.9,
    path: 'M6 2H18C18.7 2 19 2.5 19 3.2V32H34C35.3 32 36 32.7 36 34V40C36 41.3 35.3 42 34 42H7C5.7 42 5 41.3 5 40V4C5 2.7 5.3 2 6 2Z',
  },
  {
    value: 'O',
    drift: 1.3,
    path: 'M20 1C8.5 1 2 9 2 22C2 35 8.5 43 20 43C31.5 43 38 35 38 22C38 9 31.5 1 20 1ZM20 10C25.5 10 28.5 14.5 28.5 22C28.5 29.5 25.5 34 20 34C14.5 34 11.5 29.5 11.5 22C11.5 14.5 14.5 10 20 10Z',
  },
  {
    value: 'U',
    drift: 1.7,
    path: 'M4 3H13.5V27C13.5 33 16 36 20 36C24 36 26.5 33 26.5 27V3H36V28C36 38 30 43 20 43C10 43 4 38 4 28Z',
  },
  {
    value: 'D',
    drift: 1.1,
    path: 'M5 2H19C31 2 38 9.5 38 22C38 34.5 31 42 19 42H5V2ZM15 11V33H19C24.7 33 28 29 28 22C28 15 24.7 11 19 11H15Z',
  },
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

  root.classList.toggle('is-near', distance < 320)

  targetX = Math.max(-1, Math.min(1, dx / 360)) * proximity
  targetY = Math.max(-1, Math.min(1, dy / 280)) * proximity
  scheduleRender()
}

function returnToRest() {
  brand.value?.classList.remove('is-near')
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
      :style="{
        '--rest-tilt': `${(index - 2.5) * 0.16}deg`,
        '--idle-delay': `${index * -0.47}s`,
        '--idle-duration': `${(3.1 + letter.drift * 0.55).toFixed(2)}s`,
        '--blink-delay': `${index * -0.83}s`,
      }"
      aria-hidden="true"
    >
      <span class="creature-motion">
        <span class="creature-eyes">
          <i><b /></i>
          <i><b /></i>
        </span>
        <svg class="creature-body-svg" viewBox="0 0 40 44" aria-hidden="true">
          <path :d="letter.path" fill-rule="evenodd" />
        </svg>
        <span class="creature-feet"><i /><i /></span>
      </span>
    </span>
  </div>
</template>

<style scoped>
.ucloud-creatures {
  --pupil-x: 0px;
  --pupil-y: 0px;
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  min-height: 52px;
  padding: 4px 1px 2px;
  cursor: default;
  user-select: none;
}

.letter-creature {
  --body-x: 0px;
  --body-y: 0px;
  --tilt: 0deg;
  --eye-size: 8px;
  --eye-gap: 3px;
  --eye-offset: 0px;
  --eye-top: 4px;
  --feet-gap: 12px;
  position: relative;
  display: inline-grid;
  place-items: center;
  width: 34px;
  height: 43px;
  transform:
    translate(var(--body-x), var(--body-y))
    rotate(calc(var(--tilt) + var(--rest-tilt)));
  transform-origin: 50% 90%;
  transition: filter 180ms ease;
}

.creature-motion {
  position: relative;
  width: 34px;
  height: 43px;
  transform-origin: 50% 90%;
  animation: creature-idle var(--idle-duration) ease-in-out var(--idle-delay) infinite;
}

.creature-body-svg {
  position: absolute;
  z-index: 1;
  bottom: 1px;
  left: 50%;
  display: block;
  width: 36px;
  height: 40px;
  overflow: visible;
  fill: rgba(255, 255, 255, 0.92);
  filter: drop-shadow(0 3px 3px rgba(36, 74, 100, 0.08));
  stroke: #8da8b8;
  stroke-linejoin: round;
  stroke-width: 1.2;
  transform: translateX(-50%);
}

.letter-creature:first-child .creature-body-svg {
  fill: var(--cloud-blue);
  filter: drop-shadow(0 4px 4px rgba(36, 74, 100, 0.16));
  stroke: var(--cloud-blue);
}

.letter-creature:first-child {
  --eye-size: 7px;
  --eye-gap: 12px;
  --eye-top: 3px;
}

.creature-eyes {
  position: absolute;
  z-index: 2;
  top: var(--eye-top);
  left: 50%;
  display: flex;
  gap: var(--eye-gap);
  transform: translateX(calc(-50% + var(--eye-offset)));
  transition:
    gap 160ms ease,
    transform 160ms ease;
}

.creature-eyes i {
  position: relative;
  display: block;
  width: var(--eye-size);
  height: var(--eye-size);
  overflow: hidden;
  border: 1px solid #829dad;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(36, 74, 100, 0.08);
  transform-origin: center 70%;
  animation: creature-blink 5.4s ease-in-out var(--blink-delay) infinite;
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
  z-index: 0;
  bottom: -1px;
  left: 50%;
  display: flex;
  gap: var(--feet-gap);
  transform: translateX(-50%);
}

.creature-feet i {
  display: block;
  width: 5px;
  height: 4px;
  border-radius: 50% 50% 2px 2px;
  background: #6f899a;
  transform-origin: center top;
}

.letter-creature:nth-child(2) {
  --eye-size: 7px;
  --eye-gap: 2px;
  --eye-offset: 7px;
  --eye-top: 4px;
  --feet-gap: 10px;
}

.letter-creature:nth-child(2) .creature-body-svg {
  transform: translateX(-50%) rotate(-1deg);
}

.letter-creature:nth-child(3) {
  --eye-size: 6px;
  --eye-offset: -8px;
  --eye-gap: 1px;
  --eye-top: 4px;
  --feet-gap: 9px;
}

.letter-creature:nth-child(3) .creature-body-svg {
  width: 34px;
  transform: translate(-50%, -1px);
}

.letter-creature:nth-child(4) {
  --eye-size: 8px;
  --eye-gap: 3px;
  --eye-top: 3px;
  --feet-gap: 13px;
}

.letter-creature:nth-child(4) .creature-body-svg {
  width: 38px;
  fill: #f2f7f9;
}

.letter-creature:nth-child(5) {
  --eye-size: 7px;
  --eye-gap: 12px;
  --eye-top: 4px;
  --feet-gap: 10px;
}

.letter-creature:nth-child(5) .creature-body-svg {
  width: 37px;
  fill: #f7fafb;
  transform: translate(-50%, 1px);
}

.letter-creature:nth-child(5) .creature-feet i:first-child {
  transform: rotate(7deg);
}

.letter-creature:nth-child(5) .creature-feet i:last-child {
  transform: rotate(-7deg);
}

.letter-creature:nth-child(6) {
  --eye-size: 7px;
  --eye-gap: 2px;
  --eye-offset: -5px;
  --eye-top: 4px;
  --feet-gap: 11px;
}

.letter-creature:nth-child(6) .creature-body-svg {
  transform: translateX(-50%) rotate(0.8deg);
}

.ucloud-creatures:hover .letter-creature {
  filter: saturate(1.08);
}

.ucloud-creatures.is-near .creature-motion {
  animation: creature-alert 1.05s ease-in-out var(--idle-delay) infinite;
}

.ucloud-creatures.is-near .creature-eyes {
  gap: calc(var(--eye-gap) + 1px);
  transform: translate(calc(-50% + var(--eye-offset)), -1px);
}

.ucloud-creatures.is-near .creature-feet i:first-child {
  animation: creature-step-left 520ms ease-in-out var(--idle-delay) infinite alternate;
}

.ucloud-creatures.is-near .creature-feet i:last-child {
  animation: creature-step-right 520ms ease-in-out var(--idle-delay) infinite alternate;
}

@keyframes creature-idle {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  48% {
    transform: translateY(-1.5px) rotate(0.35deg);
  }
  56% {
    transform: translateY(-1px) rotate(-0.25deg);
  }
}

@keyframes creature-alert {
  0%,
  100% {
    transform: translateY(0) scaleY(1);
  }
  45% {
    transform: translateY(-2.5px) scaleY(1.025);
  }
  58% {
    transform: translateY(-1px) scaleY(0.985);
  }
}

@keyframes creature-blink {
  0%,
  44%,
  48%,
  100% {
    transform: scaleY(1);
  }
  46% {
    transform: scaleY(0.12);
  }
}

@keyframes creature-step-left {
  to {
    transform: translate(-1px, 1px) rotate(12deg);
  }
}

@keyframes creature-step-right {
  to {
    transform: translate(1px, 1px) rotate(-12deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .creature-motion,
  .creature-eyes i,
  .creature-feet i {
    animation: none;
  }
}
</style>
