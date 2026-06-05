<script setup lang="ts">
import { ref } from 'vue'
import type { FlowNode, LocalFlow, FlowFolder } from '../stores/useFlowStore'

// Vue 3 <script setup> 允许通过文件名自引用，此处无需显式 import 自身

defineOptions({ name: 'FlowTreeNode' })

const props = defineProps<{
  nodes:          FlowNode[]
  activeFlowId?:  string | null
  depth?:         number
  brokenFlowIds?: Set<string>
}>()

const emit = defineEmits<{
  (e: 'open',     flow: LocalFlow): void
  (e: 'delete',   id:   string):    void
  (e: 'createIn', id:   string):    void
  (e: 'edit',     id:   string):    void
  (e: 'pin',      id:   string):    void
}>()

const collapsed = ref(new Set<string>())

function toggle(id: string) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}
</script>

<template>
  <div>
    <template v-for="node in nodes" :key="node.id">

      <!-- ── 分组 ── -->
      <template v-if="node.kind === 'folder'">
        <div
          :class="['tree-row', 'tree-folder', node.builtin && 'tree-row--builtin']"
          :style="{ paddingLeft: `${(depth ?? 0) * 14 + 8}px` }"
          @click="toggle(node.id)"
        >
          <span class="tree-arrow">{{ collapsed.has(node.id) ? '▶' : '▼' }}</span>
          <span class="tree-icon">{{ node.builtin ? '📦' : '📁' }}</span>
          <span class="tree-name">{{ node.name }}</span>
          <span v-if="node.builtin" class="tree-badge tree-badge--preset">预设</span>
          <span class="tree-count">{{ (node as FlowFolder).children.length }}</span>
          <template v-if="!node.builtin">
            <BaseButton class="tree-btn" @click.stop="emit('edit', node.id)" title="编辑">✏️</BaseButton>
            <BaseButton class="tree-btn" @click.stop="emit('createIn', node.id)" title="在此分组内新建">＋</BaseButton>
            <BaseButton class="tree-btn tree-btn--del" @click.stop="emit('delete', node.id)" title="删除分组">🗑</BaseButton>
          </template>
        </div>
        <!-- 递归子节点 -->
        <FlowTreeNode
          v-if="!collapsed.has(node.id)"
          :nodes="(node as FlowFolder).children"
          :active-flow-id="activeFlowId"
          :depth="(depth ?? 0) + 1"
          :broken-flow-ids="brokenFlowIds"
          @open="emit('open', $event)"
          @delete="emit('delete', $event)"
          @create-in="emit('createIn', $event)"
          @edit="emit('edit', $event)"
          @pin="emit('pin', $event)"
        />
      </template>

      <!-- ── 流程 ── -->
      <div
        v-else
        :class="['tree-row', 'tree-flow', activeFlowId === node.id && 'tree-flow--active', node.builtin && 'tree-row--builtin']"
        :style="{ paddingLeft: `${(depth ?? 0) * 14 + 8}px` }"
        @click="emit('open', node as LocalFlow)"
      >
        <span class="tree-icon tree-icon--flow">▶</span>
        <span class="tree-name">{{ node.name }}</span>
        <span v-if="node.builtin" class="tree-badge tree-badge--preset">预设</span>
        <span
          v-if="brokenFlowIds?.has(node.id)"
          class="tree-warn"
          title="此流程包含失效的嵌入步骤"
        >⚠</span>
        <span class="tree-count">{{ (node as LocalFlow).steps.length }} 步</span>
        <template v-if="!node.builtin">
          <BaseButton
            :class="['tree-btn', 'tree-btn--pin', (node as LocalFlow).pinnedInMenu && 'tree-btn--pin--active']"
            :title="(node as LocalFlow).pinnedInMenu ? '取消钉选（从悬浮菜单移除）' : '钉选到悬浮菜单'"
            @click.stop="emit('pin', node.id)"
          >{{ (node as LocalFlow).pinnedInMenu ? '📌' : '📍' }}</BaseButton>
          <BaseButton class="tree-btn" @click.stop="emit('edit', node.id)" title="编辑">✏️</BaseButton>
          <BaseButton class="tree-btn tree-btn--del" @click.stop="emit('delete', node.id)" title="删除流程">🗑</BaseButton>
        </template>
      </div>

    </template>
  </div>
</template>

<style scoped>
.tree-row {
  display: flex; align-items: center; gap: 5px;
  padding-top: 5px; padding-bottom: 5px; padding-right: 8px;
  border-radius: 4px; cursor: pointer; user-select: none;
}
.tree-row:hover { background: #313244; }
.tree-flow--active { background: #1a3a5f !important; }
.tree-row--builtin { opacity: 0.7; }
.tree-row--builtin:hover { background: #2a2b3a; }

.tree-arrow { font-size: 9px; color: #6c7086; width: 10px; flex-shrink: 0; }
.tree-icon  { font-size: 13px; flex-shrink: 0; }
.tree-icon--flow { font-size: 10px; color: #a6e3a1; }
.tree-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
.tree-count { font-size: 11px; color: #6c7086; flex-shrink: 0; }
.tree-badge { font-size: 10px; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
.tree-badge--preset { background: #45475a; color: #bac2de; }

.tree-btn {
  background: none; border: none; cursor: pointer; font-size: 12px;
  color: #6c7086; opacity: 0; flex-shrink: 0; padding: 1px 3px; border-radius: 3px;
}
.tree-row:hover .tree-btn { opacity: 0.6; }
.tree-btn:hover { opacity: 1 !important; color: #cdd6f4; }
.tree-btn--del:hover { color: #f38ba8 !important; }
.tree-btn--pin { opacity: 0 !important; }
.tree-row:hover .tree-btn--pin { opacity: 0.5 !important; }
.tree-btn--pin:hover { opacity: 1 !important; }
.tree-btn--pin--active { opacity: 1 !important; color: #f9e2af !important; }
.tree-warn { font-size: 11px; color: #f9e2af; flex-shrink: 0; cursor: default; }
</style>