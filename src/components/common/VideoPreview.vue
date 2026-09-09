<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps({
  url: { type: String, required: true },
  name: { type: String, default: '视频预览' },
})
const emit = defineEmits(['close'])
const dialog = ref(null)
const player = ref(null)
const error = ref('')

onMounted(() => dialog.value.showModal())
onBeforeUnmount(() => {
  player.value?.pause()
  player.value?.removeAttribute('src')
  player.value?.load()
})

function handleError() {
  const code = player.value?.error?.code
  error.value = code === 3 || code === 4
    ? '浏览器无法播放此视频格式或编码，请下载后使用本地播放器打开。'
    : '视频加载失败，请检查网络或下载后播放。'
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="video-preview" aria-label="视频预览" @close="emit('close')">
      <header class="video-preview-header">
        <strong>{{ name }}</strong>
        <button type="button" autofocus @click="dialog.close()">关闭</button>
      </header>
      <video ref="player" :src="url" controls playsinline preload="metadata" @error="handleError" />
      <p v-if="error" role="alert">{{ error }}</p>
      <a :href="url" :download="name">下载视频</a>
    </dialog>
  </Teleport>
</template>

<style scoped>
.video-preview {
  width: min(960px, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  box-sizing: border-box;
  padding: 20px;
  border: 0;
  border-radius: 16px;
}

.video-preview::backdrop {
  background: rgb(0 0 0 / 65%);
}

.video-preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.video-preview-header strong {
  overflow-wrap: anywhere;
}

.video-preview-header button {
  flex-shrink: 0;
}

video {
  display: block;
  width: 100%;
  max-height: 70dvh;
  margin-bottom: 12px;
  background: #000;
}
</style>
