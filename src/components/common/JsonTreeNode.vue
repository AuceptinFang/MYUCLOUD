<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  value: { default: null },
  field: { type: [String, Number], default: null },
  depth: { type: Number, default: 0 },
  expandedDepth: { type: Number, default: 1 },
})

const expanded = ref(props.depth < props.expandedDepth)
const isArray = computed(() => Array.isArray(props.value))
const isContainer = computed(() => props.value !== null && typeof props.value === 'object')
const entries = computed(() => isContainer.value ? Object.entries(props.value) : [])
const opening = computed(() => isArray.value ? '[' : '{')
const closing = computed(() => isArray.value ? ']' : '}')
const valueType = computed(() => props.value === null ? 'null' : typeof props.value)
const formattedValue = computed(() => JSON.stringify(props.value) ?? 'null')
</script>

<template>
  <details
    v-if="isContainer && entries.length"
    :open="expanded"
    class="json-node"
    @toggle="expanded = $event.target.open"
  >
    <summary>
      <span v-if="field !== null" class="json-key">{{ JSON.stringify(field) }}: </span>
      <span>{{ opening }}{{ expanded ? '' : ' … ' + closing }}</span>
      <span class="json-count">{{ entries.length }} {{ isArray ? '项' : '个字段' }}</span>
    </summary>
    <div v-if="expanded" class="json-children">
      <JsonTreeNode
        v-for="[key, child] in entries"
        :key="key"
        :value="child"
        :field="isArray ? Number(key) : key"
        :depth="depth + 1"
        :expanded-depth="expandedDepth"
      />
    </div>
    <div class="json-closing">{{ closing }}</div>
  </details>
  <div v-else class="json-leaf">
    <span v-if="field !== null" class="json-key">{{ JSON.stringify(field) }}: </span>
    <span v-if="isContainer">{{ opening }}{{ closing }}</span>
    <span v-else :class="`json-value-${valueType}`">{{ formattedValue }}</span>
  </div>
</template>

<style scoped>
.json-node summary {
  cursor: pointer;
  width: fit-content;
  min-width: 0;
  border-radius: 3px;
}

.json-node summary:hover {
  background: #1f2937;
}

.json-node summary:focus-visible {
  outline: 2px solid #93c5fd;
  outline-offset: 2px;
}

.json-children {
  margin-left: 7px;
  padding-left: 15px;
  border-left: 1px solid #374151;
}

.json-leaf,
.json-closing {
  padding-left: 15px;
}

.json-key {
  color: #93c5fd;
}

.json-count {
  margin-left: 10px;
  color: #9ca3af;
  font-size: 10px;
}

.json-value-string {
  color: #a7f3d0;
}

.json-value-number,
.json-value-boolean {
  color: #fcd34d;
}

.json-value-null {
  color: #c4b5fd;
}
</style>
