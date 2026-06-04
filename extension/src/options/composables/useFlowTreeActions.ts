import { ref } from 'vue'
import type { Ref } from 'vue'
import type { useFlowStore } from '../stores/useFlowStore'
import type { LocalFlow, FlowFolder, FlowNode } from '../stores/useFlowStore'
import { showConfirm } from '@shared/utils/dialog'

type FlowStore = ReturnType<typeof useFlowStore>

function findNodeInTree(nodes: FlowNode[], id: string): FlowNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.kind === 'folder') { const r = findNodeInTree(n.children, id); if (r) return r }
  }
}

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
    const node = findNodeInTree(flowStore.tree, id)
    if (!node) return
    editingNodeId.value       = id
    editingNodeName.value     = node.name
    editingNodeKind.value     = node.kind
    editingNodeParentId.value = flowStore.getParentFolderId(id)
    showEditModal.value       = true
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
    handleEdit, onConfirmEdit,
  }
}
