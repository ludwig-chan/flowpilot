<script setup lang="ts">
import { ref } from 'vue'
import type { FlowNode, FlowFolder, LocalFlow } from '../stores/useFlowStore'

defineOptions({ name: 'CheckableFlowTree' })

const props = defineProps<{
  nodes:       FlowNode[]
  selectedIds: Set<string>
  depth?:      number
}>()

const emit = defineEmits<{
  (e: 'update:selectedIds', ids: Set<string>): void
}>()

const collapsed = ref(new Set<string>())

function toggle(id: string) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}

function getAllIds(node: FlowNode): string[] {
  if (node.kind === 'flow') return [node.id]
  return [node.id, ...(node as FlowFolder).children.flatMap(c => getAllIds(c))]
}

function getState(node: FlowNode): 'all' | 'some' | 'none' {
  const ids = getAllIds(node)
  const count = ids.filter(id => props.selectedIds.has(id)).length
  if (count === 0) return 'none'
  if (count === ids.length) return 'all'
  return 'some'
}

function handleChange(node: FlowNode, checked: boolean) {
  const next = new Set(props.selectedIds)
  getAllIds(node).forEach(id => checked ? next.add(id) : next.delete(id))
  emit('update:selectedIds', next)
}
</script>

<template>
  <div>
    <template v-for="node in nodes" :key="node.id">

      <!-- ── 文件夹 ── -->
      <template v-if="node.kind === 'folder'">
        <div class="cft-row" :style="{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }">
          <input
            type="checkbox"
            class="cft-check"
            :checked="getState(node) === 'all'"
            :indeterminate="getState(node) === 'some'"
            @change="handleChange(node, ($event.target as HTMLInputElement).checked)"
          />
          <BaseButton variant="ghost" class="cft-arrow" @click.stop="toggle(node.id)">
            {{ collapsed.has(node.id) ? '▶' : '▼' }}
          </BaseButton>
          <span class="cft-icon">📁</span>
          <span class="cft-name">{{ node.name }}</span>
          <span class="cft-count">{{ (node as FlowFolder).children.length }}</span>
        </div>
        <CheckableFlowTree
          v-if="!collapsed.has(node.id)"
          :nodes="(node as FlowFolder).children"
          :selected-ids="selectedIds"
          :depth="(depth ?? 0) + 1"
          @update:selected-ids="emit('update:selectedIds', $event)"
        />
      </template>

      <!-- ── 流程 ── -->
      <div
        v-else
        class="cft-row"
        :style="{ paddingLeft: `${(depth ?? 0) * 16 + 8}px` }"
      >
        <input
          type="checkbox"
          class="cft-check"
          :checked="selectedIds.has(node.id)"
          @change="handleChange(node, ($event.target as HTMLInputElement).checked)"
        />
        <span class="cft-arrow-placeholder" />
        <span class="cft-icon cft-icon--flow">▶</span>
        <span class="cft-name">{{ node.name }}</span>
        <span class="cft-count">{{ (node as LocalFlow).steps.length }} 步</span>
      </div>

    </template>
  </div>
</template>

<style scoped>
.cft-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 8px;
  border-radius: 4px;
  user-select: none;
}
.cft-row:hover { background: #313244; }

.cft-check {
  flex-shrink: 0;
  cursor: pointer;
  accent-color: #89b4fa;
  width: 14px;
  height: 14px;
}

.cft-arrow {
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
.cft-arrow-placeholder { width: 12px; flex-shrink: 0; }

.cft-icon         { font-size: 13px; flex-shrink: 0; }
.cft-icon--flow   { font-size: 10px; color: #a6e3a1; }
.cft-name         { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #cdd6f4; }
.cft-count        { font-size: 11px; color: #6c7086; flex-shrink: 0; }
</style>
