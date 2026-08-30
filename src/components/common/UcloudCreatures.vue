<script setup>
import { onMounted, onUnmounted, ref } from 'vue'

const letters = [
  { value: 'U', drift: 2.1, personality: 'captain' },
  { value: 'C', drift: 1.5, personality: 'curious' },
  { value: 'L', drift: 1.9, personality: 'steady' },
  { value: 'O', drift: 1.3, personality: 'round' },
  { value: 'U', drift: 1.7, personality: 'shy' },
  { value: 'D', drift: 1.1, personality: 'scout' },
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
      :class="`personality-${letter.personality}`"
      :style="{
        '--rest-tilt': `${(index - 2.5) * 0.16}deg`,
        '--idle-delay': `${index * -0.47}s`,
        '--idle-duration': `${(3.1 + letter.drift * 0.55).toFixed(2)}s`,
        '--blink-delay': `${index * -0.83}s`,
      }"
      aria-hidden="true"
    >
      <span class="creature-motion">
        <span class="creature-tuft"><i /><i /></span>
        <span class="creature-eyes">
          <i><b /></i>
          <i><b /></i>
        </span>
        <span class="creature-arms"><i /><i /></span>
        <span class="creature-body">
          <span class="creature-letter">{{ letter.value }}</span>
          <span class="creature-mouth" />
          <span class="creature-badge" />
        </span>
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

.creature-motion {
  position: relative;
  display: grid;
  place-items: center;
  width: 32px;
  height: 41px;
  transform-origin: 50% 90%;
  animation: creature-idle var(--idle-duration) ease-in-out var(--idle-delay) infinite;
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

.creature-letter {
  transform: translateY(-1px);
}

.creature-mouth {
  position: absolute;
  z-index: 2;
  bottom: 4px;
  left: 50%;
  width: 5px;
  height: 3px;
  border-bottom: 1.5px solid #557083;
  border-radius: 0 0 5px 5px;
  transform: translateX(-50%);
}

.creature-body::before,
.creature-body::after {
  position: absolute;
  bottom: 7px;
  width: 3px;
  height: 2px;
  border-radius: 50%;
  background: #d7a1a1;
  content: "";
  opacity: 0;
}

.creature-body::before {
  left: 5px;
}

.creature-body::after {
  right: 5px;
}

.letter-creature:first-child .creature-body {
  border-color: var(--cloud-blue);
  background: var(--cloud-blue);
  color: #ffffff;
  box-shadow: 0 4px 9px rgba(36, 74, 100, 0.16);
}

.letter-creature:first-child .creature-mouth {
  border-bottom-color: rgba(255, 255, 255, 0.9);
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
  transition:
    gap 160ms ease,
    transform 160ms ease;
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

.creature-arms {
  position: absolute;
  z-index: 0;
  top: 21px;
  left: 50%;
  display: flex;
  width: 38px;
  justify-content: space-between;
  transform: translateX(-50%);
  pointer-events: none;
}

.creature-arms i {
  display: block;
  width: 7px;
  height: 3px;
  border-radius: 999px;
  background: #7892a2;
  transform-origin: center right;
  transition: transform 180ms ease;
}

.creature-arms i:first-child {
  transform: rotate(18deg);
}

.creature-arms i:last-child {
  transform: rotate(-18deg);
  transform-origin: center left;
}

.creature-tuft {
  position: absolute;
  z-index: 0;
  top: -7px;
  left: 50%;
  display: none;
  width: 14px;
  height: 9px;
  transform: translateX(-50%);
}

.creature-tuft i {
  position: absolute;
  bottom: 0;
  left: 6px;
  display: block;
  width: 2px;
  height: 8px;
  border-radius: 999px;
  background: #7892a2;
  transform: rotate(-23deg);
  transform-origin: center bottom;
}

.creature-tuft i:last-child {
  left: 8px;
  height: 7px;
  transform: rotate(25deg);
}

.creature-badge {
  position: absolute;
  z-index: 3;
  top: 6px;
  right: -3px;
  display: none;
  width: 7px;
  height: 7px;
  border: 1px solid #8da8b8;
  border-radius: 50%;
  background: #dceaf0;
  box-shadow: 0 1px 2px rgba(36, 74, 100, 0.12);
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
  transform-origin: center top;
}

.ucloud-creatures:hover .letter-creature {
  filter: saturate(1.08);
}

.ucloud-creatures.is-near .creature-motion {
  animation: creature-alert 1.05s ease-in-out var(--idle-delay) infinite;
}

.ucloud-creatures.is-near .creature-eyes {
  gap: 4px;
  transform: translate(-50%, -1px);
}

.ucloud-creatures.is-near .creature-feet i:first-child {
  animation: creature-step-left 520ms ease-in-out var(--idle-delay) infinite alternate;
}

.ucloud-creatures.is-near .creature-feet i:last-child {
  animation: creature-step-right 520ms ease-in-out var(--idle-delay) infinite alternate;
}

.ucloud-creatures.is-near .creature-arms i:first-child {
  transform: rotate(-18deg) translateY(-1px);
}

.ucloud-creatures.is-near .creature-arms i:last-child {
  transform: rotate(18deg) translateY(-1px);
}

.personality-captain .creature-badge,
.personality-scout .creature-badge {
  display: block;
}

.personality-curious .creature-tuft,
.personality-scout .creature-tuft {
  display: block;
}

.personality-curious .creature-mouth,
.personality-round .creature-mouth {
  width: 4px;
  height: 4px;
  border: 1.5px solid #557083;
  border-radius: 50%;
}

.personality-steady .creature-body {
  border-radius: 7px 7px 5px 5px;
}

.personality-steady .creature-arms i {
  width: 8px;
}

.personality-round .creature-body {
  border-radius: 14px 14px 12px 12px;
}

.personality-round .creature-body::before,
.personality-round .creature-body::after,
.personality-shy .creature-body::before,
.personality-shy .creature-body::after {
  opacity: 0.58;
}

.personality-shy .creature-eyes {
  gap: 2px;
}

.personality-shy .creature-arms {
  top: 27px;
  width: 32px;
}

.personality-shy .creature-arms i:first-child {
  transform: rotate(-28deg);
}

.personality-shy .creature-arms i:last-child {
  transform: rotate(28deg);
}

.personality-scout .creature-tuft {
  left: 60%;
  transform: translateX(-50%) rotate(11deg);
}

.personality-scout .creature-badge {
  top: 22px;
  right: -2px;
  width: 6px;
  height: 6px;
}

.letter-creature:nth-child(2) .creature-eyes,
.letter-creature:nth-child(5) .creature-eyes {
  transform: translateX(-54%) rotate(-2deg);
}

.letter-creature:nth-child(4) .creature-eyes i {
  width: 9px;
  height: 9px;
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
  .letter-creature,
  .creature-motion,
  .creature-eyes i,
  .creature-eyes b,
  .creature-feet i,
  .creature-arms i {
    animation: none;
    transform: none;
  }
}
</style>
