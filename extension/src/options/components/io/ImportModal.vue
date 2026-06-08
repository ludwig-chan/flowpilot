<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { FlowNode, FlowFolder, ExportPayload } from '../stores/useFlowStore'
import CheckableFlowTree from '../flow-tree/CheckableFlowTree.vue'
import FolderPickerNode from '../flow-tree/FolderPickerNode.vue'

const props = defineProps<{
  visible: boolean
  tree:    FlowNode[]
}>()

const emit = defineEmits<{
  (e: 'confirm', payload: ExportPayload, selectedIds: Set<string>, targetId?: string): void
  (e: 'cancel'): void
}>()

type Phase = 'pick' | 'review'

const phase           = ref<Phase>('pick')
const parsedPayload   = ref<ExportPayload | null>(null)
const parsedSelected  = ref<Set<string>>(new Set())
const targetFolderId  = ref<string | undefined>(undefined)
const filename        = ref('')
const errorMsg        = ref('')
const fileInputRef    = ref<HTMLInputElement | null>(null)

function reset() {
  phase.value          = 'pick'
  parsedPayload.value  = null
  parsedSelected.value = new Set()
  targetFolderId.value = undefined
  filename.value       = ''
  errorMsg.value       = ''
}

watch(() => props.visible, (v) => { if (!v) reset() })

function openFilePicker() { fileInputRef.value?.click() }

function getAllIds(node: FlowNode): string[] {
  if (node.kind === 'flow') return [node.id]
  return [node.id, ...(node as FlowFolder).children.flatMap(c => getAllIds(c))]
}

async function handleFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  errorMsg.value = ''
  try {
    const text = await file.text()
    const payload: ExportPayload = JSON.parse(text)
    if (payload.version !== 1 || !Array.isArray(payload.nodes)) {
      errorMsg.value = '文件格式不正确，请选择有效的 .flowpilot 文件'
      return
    }
    parsedPayload.value  = payload
    filename.value       = file.name
    parsedSelected.value = new Set(payload.nodes.flatMap(n => getAllIds(n)))
    phase.value          = 'review'
  } catch {
    errorMsg.value = '文件解析失败，请确认文件格式正确'
  }
}

const hasFolders = (nodes: FlowNode[]) => nodes.some(n => n.kind === 'folder')

const selectedFlowCount = computed(() => {
  if (!parsedPayload.value) return 0
  let count = 0
  function walk(nodes: FlowNode[]) {
    for (const n of nodes) {
      if (n.kind === 'flow' && parsedSelected.value.has(n.id)) count++
      else if (n.kind === 'folder') walk((n as FlowFolder).children)
    }
  }
  walk(parsedPayload.value.nodes)
  return count
})

function confirm() {
  if (!parsedPayload.value || parsedSelected.value.size === 0) return
  emit('confirm', parsedPayload.value, parsedSelected.value, targetFolderId.value)
}
</script>

<template>
  <BaseModal
    v-if="visible"
    title="📥 导入流程"
    width="440px"
    max-height="85vh"
    :z-index="500"
    @close="emit('cancel')"
  >
    <!-- 阶段 A：选择文件 -->
    <template v-if="phase === 'pick'">
      <div class="import-modal__pick">
        <div class="drop-zone" @click="openFilePicker">
          <span class="drop-zone__icon">📂</span>
          <span class="drop-zone__text">点击选择 .flowpilot 文件</span>
        </div>
        <div v-if="errorMsg" class="import-modal__error">{{ errorMsg }}</div>
      </div>
    </template>

    <!-- 阶段 B：预览内容 + 选择目标目录 -->
    <template v-else>

      <!-- 文件信息 -->
      <div class="import-modal__file-info">
        <span class="import-modal__filename">📄 {{ filename }}</span>
        <BaseButton size="sm" @click="reset">重新选择</BaseButton>
      </div>

      <!-- 内容树 -->
      <div class="import-modal__section-label">选择要导入的内容</div>
      <div class="import-modal__tree-wrap">
        <CheckableFlowTree
          :nodes="parsedPayload!.nodes"
          :selected-ids="parsedSelected"
          @update:selected-ids="parsedSelected = $event"
        />
      </div>

      <!-- 目标目录 -->
      <div class="import-modal__section-label">导入到</div>
      <div class="import-modal__folder-picker">
        <div
          :class="['fpn-row', { 'fpn-row--active': targetFolderId === undefined }]"
          style="padding-left: 8px"
          @click="targetFolderId = undefined"
        >
          <span class="fpn-toggle-placeholder" />
          <span class="fpn-icon">🏠</span>
          <span class="fpn-name">根目录</span>
          <span v-if="targetFolderId === undefined" class="fpn-check">✓</span>
        </div>
        <FolderPickerNode
          :nodes="tree"
          :selected-id="targetFolderId"
          :depth="1"
          @select="targetFolderId = $event"
        />
        <div v-if="!hasFolders(tree)" class="fpn-empty">暂无子目录</div>
      </div>

    </template>

    <template #footer>
      <BaseButton @click="emit('cancel')">取消</BaseButton>
      <template v-if="phase === 'pick'">
        <BaseButton kind="primary" @click="openFilePicker">选择文件</BaseButton>
      </template>
      <template v-else>
        <BaseButton
          kind="primary"
          :disabled="parsedSelected.size === 0"
          @click="confirm"
        >确认导入 {{ selectedFlowCount }} 个流程</BaseButton>
      </template>
    </template>

  </BaseModal>

  <input
    ref="fileInputRef"
    type="file"
    accept=".flowpilot"
    style="display:none"
    @change="handleFileChange"
  />
</template>

<style lang="scss" scoped>
/* 选文件区域 */
.import-modal__pick {
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.drop-zone {
  border: 2px dashed $color-surface-2;
  border-radius: $radius-md;
  padding: 32px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  &:hover { border-color: $color-blue; background: $color-focus-bg; }
}
.drop-zone__icon { font-size: 28px; }
.drop-zone__text { font-size: 13px; color: $color-text; }

.import-modal__error {
  font-size: 12px;
  color: $color-red;
  padding: 8px 12px;
  background: rgba(243, 139, 168, 0.1);
  border-radius: $radius-md;
}

/* 文件信息行 */
.import-modal__file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid $color-surface-1;
  flex-shrink: 0;
}
.import-modal__filename {
  flex: 1;
  font-size: 12px;
  color: $color-green;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 区块标签 */
.import-modal__section-label {
  font-size: 11px;
  font-weight: 600;
  color: $color-text-muted;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 10px 16px 4px;
  flex-shrink: 0;
}

/* 内容树 */
.import-modal__tree-wrap {
  flex: 1;
  min-height: 80px;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  margin: 0 16px;
  background: $color-base;
  padding: 4px;
}

/* 目录选择器 */
.import-modal__folder-picker {
  border: 1px solid $color-surface-2;
  border-radius: $radius-md;
  margin: 0 16px 4px;
  background: $color-base;
  padding: 4px;
  max-height: 160px;
  overflow-y: auto;
  flex-shrink: 0;
}

/* FolderPickerNode 共用样式（scoped 无法穿透子组件，复制必要样式） */
:deep(.fpn-row) {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px 5px 0;
  border-radius: $radius;
  cursor: pointer;
  user-select: none;
}
:deep(.fpn-row:hover)      { background: $color-surface-1; }
:deep(.fpn-row--active)    { background: $color-focus-bg !important; }
:deep(.fpn-toggle-placeholder) { width: 12px; flex-shrink: 0; }
:deep(.fpn-icon)           { font-size: 13px; flex-shrink: 0; }
:deep(.fpn-name)           { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: $color-text; }
:deep(.fpn-check)          { font-size: 11px; color: $color-blue; flex-shrink: 0; font-weight: 700; }
:deep(.fpn-empty)          { font-size: 12px; color: $color-text-muted; text-align: center; padding: 12px; }
</style>
