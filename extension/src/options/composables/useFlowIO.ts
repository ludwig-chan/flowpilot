import { ref } from 'vue'
import type { useFlowStore } from '../stores/useFlowStore'
import { showAlert } from '@shared/utils/dialog'
import { toLocalTimeString } from '@shared/utils/time'
import { filterNodesByIds } from '../stores/useFlowStore'
import type { ExportPayload } from '../stores/useFlowStore'

type FlowStore = ReturnType<typeof useFlowStore>

export function useFlowIO(flowStore: FlowStore) {
  // ── 导出弹窗 ──────────────────────────────────────────────────────
  const showExportModal = ref(false)

  function handleExportSelected(ids: Set<string>) {
    const payload = flowStore.exportSelected(ids)
    const date = toLocalTimeString().slice(0, 10)
    const filename = `flowpilot-export-${date}.flowpilot`
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    showExportModal.value = false
  }

  // ── 导入弹窗 ──────────────────────────────────────────────────────
  const showImportModal = ref(false)

  async function handleImportConfirm(payload: ExportPayload, selectedIds: Set<string>, targetId?: string) {
    const filtered = { ...payload, nodes: filterNodesByIds(payload.nodes, selectedIds) }
    const count = await flowStore.importInto(filtered, targetId)
    await showAlert(`成功导入 ${count} 个项目`)
    showImportModal.value = false
  }

  return {
    showExportModal, handleExportSelected,
    showImportModal, handleImportConfirm,
  }
}
