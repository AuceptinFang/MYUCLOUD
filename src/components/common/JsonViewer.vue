<script setup>
import { computed, ref } from 'vue'
import JsonTreeNode from './JsonTreeNode.vue'

const props = defineProps({
  value: { default: null },
})

const expandedDepth = ref(1)
const treeVersion = ref(0)
const parsed = computed(() => {
  if (typeof props.value !== 'string') return { value: props.value ?? null, isJson: true }

  try {
    return { value: JSON.parse(props.value), isJson: true }
  } catch {
    return { value: props.value, isJson: false }
  }
})
const hasChildren = computed(() => parsed.value.value !== null
  && typeof parsed.value.value === 'object'
  && Object.keys(parsed.value.value).length > 0)

function setExpandedDepth(depth) {
  expandedDepth.value = depth
  treeVersion.value += 1
}
</script>

<template>
  <div class="json-viewer">
    <div v-if="hasChildren" class="json-toolbar">
      <button class="button-secondary" type="button" @click="setExpandedDepth(Infinity)">全部展开</button>
      <button class="button-secondary" type="button" @click="setExpandedDepth(0)">全部折叠</button>
    </div>
    <div v-if="parsed.isJson" class="api-code json-tree" tabindex="0" aria-label="JSON 数据">
      <JsonTreeNode :key="treeVersion" :value="parsed.value" :expanded-depth="expandedDepth" />
    </div>
    <pre v-else class="api-code">{{ parsed.value }}</pre>
  </div>
</template>

<style scoped>
.json-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.json-toolbar button {
  min-height: 28px;
  padding: 3px 9px;
  font-size: 11px;
}

.json-tree {
  max-height: 430px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
