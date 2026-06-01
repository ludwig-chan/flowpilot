<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FlowNode, FlowFolder } from '../stores/useFlowStore'
import CheckableFlowTree from './CheckableFlowTree.vue'

const props = defineProps<{
  visible: boolean
  tree:    FlowNode[]
}>()

const emit = defineEmits<{
  (e: 'export', ids: Set<string>): void
  (e: 'close'): void
}>()

const selectedIds = ref<Set<string>>(new Set())

function getAllIds(nodes: FlowNode[]): string[] {
  const ids: string[] = []
  function walk(ns: FlowNode[]) {
    for (const n of ns) {
      ids.push(n.id)
      if (n.kind === 'folder') walk((n as FlowFolder).children)
    }
  }
  walk(nodes)
  return ids
}

watch(() => props.visible, (v) => {
  if (v) selectedIds.value = new Set(getAllIds(props.tree))
})

function selectAll()  { selectedIds.value = new Set(getAllIds(props.tree)) }
function selectNone() { selectedIds.value = new Set() }

const selectedFlowCount = computed(() => {
  let count = 0
  function walk(nodes: FlowNode[]) {
    for (const n of nodes) {
      if (n.kind === 'flow' && selectedIds.value.has(n.id)) count++
      else if (n.kind === 'folder') walk((n as FlowFolder).children)
    }
  }
  walk(props.tree)
  return count
})
</script>

<template>
  <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
    <div class="export-modal">

      <!-- 标题栏 -->
      <div class="export-modal__header">
        <span class="export-modal__title">📤 导出流程</span>
        <button class="btn btn--ghost" @click="emit('close')">✖</button>
      </div>

      <!-- 工具行 -->
      <div class="export-modal__toolbar">
        <button class="btn btn--sm" @click="selectAll">全选</button>
        <button class="btn btn--sm" @click="selectNone">取消全选</button>
        <span class="export-modal__count">已选 {{ selectedFlowCount }} 个流程</span>
      </div>

      <!-- 树形区域 -->
      <div class="export-modal__body">
        <div v-if="tree.length === 0" class="export-modal__empty">暂无流程</div>
        <CheckableFlowTree
          v-else
          :nodes="tree"
          :selected-ids="selectedIds"
          @update:selected-ids="selectedIds = $event"
        />
      </div>

      <!-- 底部操作 -->
      <div class="export-modal__footer">
        <button class="btn" @click="emit('close')">取消</button>
        <button
          class="btn btn--primary"
          :disabled="selectedIds.size === 0"
          @click="emit('export', selectedIds)"
        >导出 {{ selectedIds.size }} 项</button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.export-modal {
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 10px;
  width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.export-modal__header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}
.export-modal__title {
  flex: 1;
  font-weight: 700;
  font-size: 14px;
  color: #cdd6f4;
}

.export-modal__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}
.export-modal__count {
  margin-left: auto;
  font-size: 12px;
  color: #6c7086;
}

.export-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  min-height: 0;
}
.export-modal__empty {
  font-size: 13px;
  color: #6c7086;
  text-align: center;
  padding: 24px;
}

.export-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #313244;
  flex-shrink: 0;
}
</style>
