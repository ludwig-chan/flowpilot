<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FlowNode } from '../stores/useFlowStore'
import FolderPickerNode from '../flow-tree/FolderPickerNode.vue'
import BaseInput from '@shared/components/BaseInput.vue'

const props = defineProps<{
  tree:               FlowNode[]
  initialParentId?:   string
}>()

const emit = defineEmits<{
  (e: 'confirm', kind: 'flow' | 'folder', name: string, parentId?: string): void
  (e: 'cancel'): void
}>()

const kind     = ref<'flow' | 'folder'>('flow')
const name     = ref('')
const parentId = ref<string | undefined>(props.initialParentId)

// 当 initialParentId 外部变化时同步
watch(() => props.initialParentId, v => { parentId.value = v })

function selectFolder(id: string | undefined) {
  parentId.value = id
}

function confirm() {
  const n = name.value.trim()
  if (!n) return
  emit('confirm', kind.value, n, parentId.value)
}

const hasFolders = (nodes: FlowNode[]): boolean =>
  nodes.some(n => n.kind === 'folder')
</script>

<template>
  <BaseModal title="新增" width="400px" max-height="80vh" :z-index="500" @close="emit('cancel')">

      <!-- 类型选择 -->
      <div class="create-modal__type-row">
        <button
          :class="['type-btn', { 'type-btn--active': kind === 'flow' }]"
          @click="kind = 'flow'"
        >
          <span class="type-btn__icon">▶</span>
          <span>流程</span>
        </button>
        <button
          :class="['type-btn', { 'type-btn--active': kind === 'folder' }]"
          @click="kind = 'folder'"
        >
          <span class="type-btn__icon">📁</span>
          <span>目录</span>
        </button>
      </div>

      <!-- 名称输入 -->
      <div class="create-modal__field">
        <label class="create-modal__label">名称</label>
        <BaseInput
          v-model="name"
          :placeholder="kind === 'flow' ? '输入流程名称…' : '输入目录名称…'"
          autofocus
          @keyup.enter="confirm"
        />
      </div>

      <!-- 所属目录：树形选择器 -->
      <div class="create-modal__field create-modal__field--tree">
        <label class="create-modal__label">所属目录</label>
        <div class="folder-tree-picker">
          <!-- 根目录 -->
          <div
            :class="['fpn-row', { 'fpn-row--active': parentId === undefined }]"
            style="padding-left: 8px"
            @click="selectFolder(undefined)"
          >
            <span class="fpn-toggle-placeholder"></span>
            <span class="fpn-icon">🏠</span>
            <span class="fpn-name">根目录</span>
            <span v-if="parentId === undefined" class="fpn-check">✓</span>
          </div>

          <!-- 递归文件夹树 -->
          <FolderPickerNode
            :nodes="tree"
            :selected-id="parentId"
            :depth="1"
            @select="selectFolder"
          />

          <div v-if="!hasFolders(tree)" class="fpn-empty">暂无子目录</div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <template #footer>
        <BaseButton @click="emit('cancel')">取消</BaseButton>
        <BaseButton variant="primary" :disabled="!name.trim()" @click="confirm">
          确认创建
        </BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
/* ── 类型选择 ── */
.create-modal__type-row {
  display: flex;
  gap: 10px;
  padding: 14px 16px 0;
  flex-shrink: 0;
}
.type-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 12px 10px;
  background: $color-surface-1;
  border: 2px solid $color-surface-2;
  border-radius: $radius-lg;
  color: $color-text-muted;
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.type-btn:hover { border-color: $color-text-muted; color: $color-text; }
.type-btn--active { border-color: $color-blue !important; color: $color-blue !important; background: #1a2a4a; }
.type-btn__icon { font-size: 22px; }

/* ── 字段 ── */
.create-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 0;
  flex-shrink: 0;
}
.create-modal__field--tree {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.create-modal__label {
  font-size: 11px;
  font-weight: 600;
  color: $color-text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── 目录树选择器 ── */
.folder-tree-picker {
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  overflow-y: auto;
  flex: 1;
  background: $color-base;
  padding: 4px;
}

.fpn-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 8px;
  border-radius: $radius;
  cursor: pointer;
  user-select: none;
}
.fpn-row:hover { background: $color-surface-1; }
.fpn-row--active { background: $color-focus-bg !important; }

.fpn-toggle-placeholder { width: 12px; flex-shrink: 0; }
.fpn-icon  { font-size: 13px; flex-shrink: 0; }
.fpn-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: $color-text; }
.fpn-check { font-size: 11px; color: $color-blue; flex-shrink: 0; font-weight: 700; }
.fpn-empty { font-size: 12px; color: $color-text-muted; text-align: center; padding: 12px; }
</style>
