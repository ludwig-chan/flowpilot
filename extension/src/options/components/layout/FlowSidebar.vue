<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useFlowStore } from '../../stores/useFlowStore'
import { useEditorStore } from '../../stores/useEditorStore'
import { useFlowTreeActions } from '../../composables/useFlowTreeActions'
import { useFlowIO } from '../../composables/useFlowIO'
import FlowTreeNode from '../flow-tree/FlowTreeNode.vue'
import CreateNodeModal from '../step-editor/CreateNodeModal.vue'
import EditNodeModal from '../step-editor/EditNodeModal.vue'
import PresetsModal from '../io/PresetsModal.vue'
import ExportModal from '../io/ExportModal.vue'
import ImportModal from '../io/ImportModal.vue'

const flowStore = useFlowStore()
const es        = useEditorStore()
const { editingFlow } = storeToRefs(es)

const {
  showCreateModal, createModalInitParentId,
  openCreateModal, onConfirmCreate,
  deleteFlowOrFolder,
  showEditModal, editingNodeId, editingNodeName, editingNodeKind, editingNodeParentId,
  handleEdit, onConfirmEdit,
} = useFlowTreeActions(flowStore, editingFlow)

const {
  showExportModal, handleExportSelected,
  showImportModal, handleImportConfirm,
  showPresetsModal, onInstallPreset,
  BUILTIN_PRESETS,
} = useFlowIO(flowStore)
</script>

<template>
  <div class="panel">
    <div class="panel__toolbar">
      <span class="panel__title">已保存流程</span>
      <BaseButton
        v-if="BUILTIN_PRESETS.length > 0"
        size="sm"
        title="浏览内置预设库"
        @click="showPresetsModal = true"
      >📦 预设</BaseButton>
      <BaseButton size="sm" title="导入流程" @click="showImportModal = true">📥 导入</BaseButton>
      <BaseButton size="sm" title="导出流程" @click="showExportModal = true">📤 导出</BaseButton>
      <BaseButton size="sm" variant="primary" @click="openCreateModal()">&#xFF0B; 新增</BaseButton>
    </div>

    <div class="flow-list">
      <FlowTreeNode
        :nodes="flowStore.tree"
        :active-flow-id="editingFlow?.id"
        @open="es.openFlow"
        @delete="deleteFlowOrFolder"
        @create-in="(id: string) => openCreateModal(id)"
        @edit="handleEdit"
        @pin="(id: string) => flowStore.togglePin(id)"
      />
      <div v-if="flowStore.tree.length === 0 && !showCreateModal" class="empty-hint">暂无流程，点击"＋ 新增"创建</div>
    </div>
  </div>

  <Teleport to="body">
    <!-- 新增流程/目录弹窗 -->
    <CreateNodeModal
      v-if="showCreateModal"
      :tree="flowStore.tree"
      :initial-parent-id="createModalInitParentId"
      @confirm="onConfirmCreate"
      @cancel="showCreateModal = false"
    />

    <!-- 编辑节点弹窗 -->
    <EditNodeModal
      v-if="showEditModal"
      :node-id="editingNodeId"
      :node-name="editingNodeName"
      :node-kind="editingNodeKind"
      :current-parent-id="editingNodeParentId"
      :tree="flowStore.tree"
      @confirm="onConfirmEdit"
      @cancel="showEditModal = false"
    />

    <!-- 预设库弹窗 -->
    <PresetsModal
      v-if="showPresetsModal"
      @install="onInstallPreset"
      @close="showPresetsModal = false"
    />

    <!-- 导出弹窗 -->
    <ExportModal
      :visible="showExportModal"
      :tree="flowStore.tree"
      @export="handleExportSelected"
      @close="showExportModal = false"
    />

    <!-- 导入弹窗 -->
    <ImportModal
      :visible="showImportModal"
      :tree="flowStore.tree"
      @confirm="handleImportConfirm"
      @cancel="showImportModal = false"
    />
  </Teleport>
</template>

<style scoped lang="scss">
.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.panel__toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.panel__title { font-weight: 600; font-size: 12px; flex: 1; }
.panel__subtitle { font-weight: 400; color: #6c7086; font-size: 11px; }
.flow-list { flex: 1; overflow-y: auto; padding: 4px; }
</style>
