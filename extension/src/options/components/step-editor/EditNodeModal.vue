<script setup lang="ts">
import { ref } from 'vue'
import type { FlowNode } from '../stores/useFlowStore'
import FolderPickerNode from '../flow-tree/FolderPickerNode.vue'

const props = defineProps<{
  nodeId:          string
  nodeName:        string
  nodeKind:        'flow' | 'folder'
  currentParentId: string | undefined
  tree:            FlowNode[]
}>()

const emit = defineEmits<{
  (e: 'confirm', id: string, name: string, parentId: string | undefined): void
  (e: 'cancel'): void
}>()

const name     = ref(props.nodeName)
const parentId = ref<string | undefined>(props.currentParentId)

function confirm() {
  const n = name.value.trim()
  if (!n) return
  emit('confirm', props.nodeId, n, parentId.value)
}
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('cancel')">
    <div class="create-modal">
      <!-- 标题栏 -->
      <div class="create-modal__header">
        <span class="create-modal__title">编辑{{ nodeKind === 'folder' ? '目录' : '流程' }}</span>
        <button class="btn btn--ghost" @click="$emit('cancel')">✖</button>
      </div>

      <!-- 名称输入 -->
      <div class="create-modal__field">
        <label class="create-modal__label">名称</label>
        <input
          v-model="name"
          class="input"
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
            @click="parentId = undefined"
          >
            <span class="fpn-toggle-placeholder"></span>
            <span class="fpn-icon">🏠</span>
            <span class="fpn-name">根目录</span>
            <span v-if="parentId === undefined" class="fpn-check">✓</span>
          </div>

          <!-- 递归文件夹树，编辑目录时排除自身及其子孙 -->
          <FolderPickerNode
            :nodes="tree"
            :selected-id="parentId"
            :exclude-id="nodeKind === 'folder' ? nodeId : undefined"
            :depth="1"
            @select="parentId = $event"
          />
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="create-modal__actions">
        <button class="btn" @click="$emit('cancel')">取消</button>
        <button class="btn btn--primary" :disabled="!name.trim()" @click="confirm">保存</button>
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

.create-modal {
  background: #1e1e2e;
  border: 1px solid #45475a;
  border-radius: 10px;
  width: 400px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.create-modal__header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #313244;
  flex-shrink: 0;
}
.create-modal__title {
  flex: 1;
  font-weight: 700;
  font-size: 14px;
  color: #cdd6f4;
}

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
  padding-bottom: 8px;
}
.create-modal__label {
  font-size: 11px;
  font-weight: 600;
  color: #6c7086;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.folder-tree-picker {
  border: 1px solid #45475a;
  border-radius: 6px;
  overflow-y: auto;
  flex: 1;
  background: #181825;
  padding: 4px;
  min-height: 80px;
}

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
.fpn-toggle-placeholder { width: 12px; flex-shrink: 0; }
.fpn-icon  { font-size: 13px; flex-shrink: 0; }
.fpn-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #cdd6f4; }
.fpn-check { font-size: 11px; color: #89b4fa; flex-shrink: 0; font-weight: 700; }

.create-modal__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 16px;
  border-top: 1px solid #313244;
  flex-shrink: 0;
}

.btn {
  padding: 5px 14px;
  border-radius: 4px;
  border: 1px solid #45475a;
  background: #313244;
  color: #cdd6f4;
  cursor: pointer;
  font-size: 12px;
}
.btn:hover:not(:disabled) { background: #45475a; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn--ghost { background: transparent; border-color: transparent; }
.btn--ghost:hover:not(:disabled) { background: #313244; }
.btn--primary { background: #1e3a5f; border-color: #89b4fa; color: #89b4fa; }
.btn--primary:hover:not(:disabled) { background: #264a7a; }

.input {
  background: #313244;
  border: 1px solid #45475a;
  border-radius: 4px;
  color: #cdd6f4;
  padding: 7px 10px;
  font-size: 13px;
  width: 100%;
  box-sizing: border-box;
}
.input:focus { outline: none; border-color: #89b4fa; }
</style>
