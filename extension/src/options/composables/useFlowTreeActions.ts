import { ref } from 'vue'
import type { Ref } from 'vue'
import { findNode as findNodeInTree } from '../stores/useFlowStore'
import type { useFlowStore } from '../stores/useFlowStore'
import type { LocalFlow, FlowFolder, FlowNode } from '../stores/useFlowStore'
import { showConfirm } from '@shared/utils/dialog'

type FlowStore = ReturnType<typeof useFlowStore>

export function useFlowTreeActions(flowStore: FlowStore, editingFlow: Ref<LocalFlow | null>) {
  // ── 新增节点弹窗 ──────────────────────────────────────────────────
  const showCreateModal         = ref(false)
  const createModalInitParentId = ref<string | undefined>(undefined)

  function openCreateModal(initialParentId?: string) {
    createModalInitParentId.value = initialParentId
    showCreateModal.value         = true
  }

  async function onConfirmCreate(kind: 'flow' | 'folder', name: string, parentId?: string) {
    if (kind === 'flow') {
      const id    = await flowStore.saveFlow(name, [], parentId)
      const found = flowStore.allFlows().find(f => f.id === id)
      if (found) editingFlow.value = JSON.parse(JSON.stringify(found))
    } else {
      await flowStore.saveFolder(name, parentId)
    }
    showCreateModal.value = false
  }

  // ── 删除节点 ──────────────────────────────────────────────────────
  async function deleteFlowOrFolder(id: string) {
    const node = findNodeInTree(flowStore.tree, id)
    if (!node) return
    // 内置预设不可删除
    if (node.builtin) return
    const childCount = node.kind === 'folder' ? (node as FlowFolder).children.length : 0
    const msg = node.kind === 'folder' && childCount > 0
      ? `确定删除分组「${node.name}」及其中所有内容（${childCount} 项）？`
      : `确定删除「${node.name}」？`
    if (!await showConfirm(msg)) return
    await flowStore.remove(id)
    if (editingFlow.value?.id === id) editingFlow.value = null
  }

  // ── 编辑节点弹窗 ──────────────────────────────────────────────────
  const showEditModal       = ref(false)
  const editingNodeId       = ref('')
  const editingNodeName     = ref('')
  const editingNodeKind     = ref<'flow' | 'folder'>('flow')
  const editingNodeParentId = ref<string | undefined>(undefined)

  function handleEdit(id: string) {
    let node = findNodeInTree(flowStore.tree, id)
    // 如果是内置预设节点，先 fork 到用户区
    if (!node) {
      const displayNode = findNodeInTree(flowStore.displayTree, id)
      if (displayNode?.builtin) {
        // 异步 fork，然后编辑 fork 后的节点
        flowStore.forkPresetNode(id).then(forked => {
          if (!forked) return
          editingNodeId.value       = forked.id
          editingNodeName.value     = forked.name
          editingNodeKind.value     = forked.kind
          editingNodeParentId.value = flowStore.getParentFolderId(forked.id)
          showEditModal.value       = true
        })
        return
      }
      return
    }
    editingNodeId.value       = id
    editingNodeName.value     = node.name
    editingNodeKind.value     = node.kind
    editingNodeParentId.value = flowStore.getParentFolderId(id)
    showEditModal.value       = true
  }

  async function restoreDefaultPreset(id: string) {
    const node = findNodeInTree(flowStore.tree, id)
    if (!node || node.kind !== 'flow' || !node.sourcePresetId) return
    if (!await showConfirm(`将「${node.name}」恢复为预设默认设置？\n当前自定义步骤和设置会被覆盖。`, '恢复默认')) return
    const resetFlow = await flowStore.resetPresetCustomization(id)
    if (resetFlow && editingFlow.value?.id === id) editingFlow.value = JSON.parse(JSON.stringify(resetFlow))
  }

  async function onConfirmEdit(id: string, name: string, parentId: string | undefined) {
    await flowStore.renameNode(id, name)
    const currentParent = flowStore.getParentFolderId(id)
    if (currentParent !== parentId) await flowStore.moveNode(id, parentId)
    if (editingFlow.value?.id === id) editingFlow.value.name = name
    showEditModal.value = false
  }

  return {
    showCreateModal, createModalInitParentId,
    openCreateModal, onConfirmCreate,
    deleteFlowOrFolder,
    showEditModal, editingNodeId, editingNodeName, editingNodeKind, editingNodeParentId,
    handleEdit, onConfirmEdit, restoreDefaultPreset,
  }
}
