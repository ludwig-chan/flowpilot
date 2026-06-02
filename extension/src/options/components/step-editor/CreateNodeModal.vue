<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FlowNode } from '../stores/useFlowStore'
import FolderPickerNode from '../flow-tree/FolderPickerNode.vue'

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
  <div class="modal-overlay" @click.self="$emit('cancel')">
    <div class="create-modal">
      <!-- 标题栏 -->
      <div class="create-modal__header">
        <span class="create-modal__title">新增</span>
        <button class="btn btn--ghost" @click="$emit('cancel')">✖</button>
      </div>

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
        <input
          v-model="name"
          class="input"
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
      <div class="create-modal__actions">
        <button class="btn" @click="$emit('cancel')">取消</button>
        <button class="btn btn--primary" :disabled="!name.trim()" @click="confirm">
          确认创建
        </button>
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

/* ── 头部 ── */
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
  background: #313244;
  border: 2px solid #45475a;
  border-radius: 8px;
  color: #6c7086;
  cursor: pointer;
  font-size: 13px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.type-btn:hover { border-color: #6c7086; color: #cdd6f4; }
.type-btn--active { border-color: #89b4fa !important; color: #89b4fa !important; background: #1a2a4a; }
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
  color: #6c7086;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── 目录树选择器 ── */
.folder-tree-picker {
  border: 1px solid #45475a;
  border-radius: 6px;
  overflow-y: auto;
  flex: 1;
  background: #181825;
  padding: 4px;
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
.fpn-empty { font-size: 12px; color: #6c7086; text-align: center; padding: 12px; }

/* ── 操作按钮 ── */
.create-modal__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 14px 16px;
  border-top: 1px solid #313244;
  flex-shrink: 0;
}

/* 复用全局 btn / input 样式（无 scoped 影响，下方做兜底） */
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
