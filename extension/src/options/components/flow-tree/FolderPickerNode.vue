<script setup lang="ts">
import { ref } from 'vue'
import type { FlowNode, FlowFolder } from '../stores/useFlowStore'

defineOptions({ name: 'FolderPickerNode' })

const props = defineProps<{
  nodes:      FlowNode[]
  selectedId: string | undefined
  excludeId?: string
  depth?:     number
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
}>()

const collapsed = ref(new Set<string>())

function toggle(id: string) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}
</script>

<template>
  <div>
    <template v-for="node in (nodes.filter(n => n.kind === 'folder' && n.id !== excludeId) as FlowFolder[])" :key="node.id">
      <div
        :class="['fpn-row', { 'fpn-row--active': selectedId === node.id }]"
        :style="{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }"
        @click="emit('select', node.id)"
      >
        <button
          class="fpn-toggle"
          @click.stop="toggle(node.id)"
        >
          {{ node.children.some(c => c.kind === 'folder') ? (collapsed.has(node.id) ? '▶' : '▼') : '' }}
        </button>
        <span class="fpn-icon">📁</span>
        <span class="fpn-name">{{ node.name }}</span>
        <span v-if="selectedId === node.id" class="fpn-check">✓</span>
      </div>
      <FolderPickerNode
        v-if="!collapsed.has(node.id) && node.children.some(c => c.kind === 'folder')"
        :nodes="node.children"
        :selected-id="selectedId"
        :exclude-id="excludeId"
        :depth="(depth ?? 0) + 1"
        @select="emit('select', $event)"
      />
    </template>
  </div>
</template>

<style scoped>
.fpn-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 8px;
  border-radius: 4px;
  cursor: pointer;
  user-select: none;
}
.fpn-row:hover { background: #313244; }
.fpn-row--active { background: #1a3a5f !important; }

.fpn-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 9px;
  color: #6c7086;
  width: 12px;
  flex-shrink: 0;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fpn-icon  { font-size: 13px; flex-shrink: 0; }
.fpn-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #cdd6f4; }
.fpn-check { font-size: 11px; color: #89b4fa; flex-shrink: 0; font-weight: 700; }
</style>
