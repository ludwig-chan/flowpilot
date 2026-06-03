<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FlowNode, FlowFolder } from '../stores/useFlowStore'
import CheckableFlowTree from '../flow-tree/CheckableFlowTree.vue'

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
  <BaseModal
    v-if="visible"
    title="📤 导出流程"
    width="420px"
    max-height="80vh"
    :z-index="500"
    @close="emit('close')"
  >
    <!-- 工具行 -->
    <div class="export-modal__toolbar">
      <BaseButton size="sm" @click="selectAll">全选</BaseButton>
      <BaseButton size="sm" @click="selectNone">取消全选</BaseButton>
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

    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton
        variant="primary"
        :disabled="selectedIds.size === 0"
        @click="emit('export', selectedIds)"
      >导出 {{ selectedIds.size }} 项</BaseButton>
    </template>
  </BaseModal>
</template>

<style lang="scss" scoped>
.export-modal__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid $color-surface-1;
  flex-shrink: 0;
}
.export-modal__count {
  margin-left: auto;
  font-size: 12px;
  color: $color-text-muted;
}

.export-modal__body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  min-height: 0;
}
.export-modal__empty {
  font-size: 13px;
  color: $color-text-muted;
  text-align: center;
  padding: 24px;
}
</style>
