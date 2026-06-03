import { ref } from 'vue'
import type { useFlowStore } from '../stores/useFlowStore'
import { filterNodesByIds } from '../stores/useFlowStore'
import type { ExportPayload } from '../stores/useFlowStore'
import { BUILTIN_PRESETS } from '@/presets/index'
import type { BuiltinPreset } from '@/presets/index'

type FlowStore = ReturnType<typeof useFlowStore>

export function useFlowIO(flowStore: FlowStore) {
  // ── 导出弹窗 ──────────────────────────────────────────────────────
  const showExportModal = ref(false)

  function handleExportSelected(ids: Set<string>) {
    const payload = flowStore.exportSelected(ids)
    const date = new Date().toISOString().slice(0, 10)
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
    alert(`成功导入 ${count} 个项目`)
    showImportModal.value = false
  }

  // ── 预设库 ────────────────────────────────────────────────────────
  const showPresetsModal = ref(false)

  async function onInstallPreset(preset: BuiltinPreset) {
    await flowStore.importInto(preset.payload as Parameters<typeof flowStore.importInto>[0], undefined)
  }

  return {
    showExportModal, handleExportSelected,
    showImportModal, handleImportConfirm,
    showPresetsModal, onInstallPreset,
    BUILTIN_PRESETS,
  }
}
