<script setup lang="ts">
import { ref } from 'vue'
import type { FlowNode } from '../stores/useFlowStore'
import FolderPickerNode from '../flow-tree/FolderPickerNode.vue'
import BaseInput from '@shared/components/BaseInput.vue'

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
  <BaseModal :title="'编辑' + (nodeKind === 'folder' ? '目录' : '流程')" width="400px" max-height="80vh" :z-index="500" @close="emit('cancel')">

      <!-- 名称输入 -->
      <div class="edit-modal__field">
        <label class="edit-modal__label">名称</label>
        <BaseInput
          v-model="name"
          autofocus
          @keyup.enter="confirm"
        />
      </div>

      <!-- 所属目录：树形选择器 -->
      <div class="edit-modal__field edit-modal__field--tree">
        <label class="edit-modal__label">所属目录</label>
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
      <template #footer>
        <BaseButton @click="emit('cancel')">取消</BaseButton>
        <BaseButton variant="primary" :disabled="!name.trim()" @click="confirm">保存</BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.edit-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px 0;
  flex-shrink: 0;
}
.edit-modal__field--tree {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding-bottom: 8px;
}
.edit-modal__label {
  font-size: 11px;
  font-weight: 600;
  color: $color-text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.folder-tree-picker {
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  overflow-y: auto;
  flex: 1;
  background: $color-base;
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
</style>
