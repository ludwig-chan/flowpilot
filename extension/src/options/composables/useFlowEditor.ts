import { ref } from 'vue'
import type { Ref } from 'vue'
import type { useFlowStore } from '../stores/useFlowStore'
import type { LocalFlow } from '../stores/useFlowStore'
import type { StepDelayLevel, FlowTrigger, DownloadMode } from '@shared/types/flow'
import { useFlowEstimate } from './useFlowEstimate'
import { showConfirm } from '@shared/utils/dialog'

type FlowStore = ReturnType<typeof useFlowStore>

export function useFlowEditor(flowStore: FlowStore, editingFlow: Ref<LocalFlow | null>) {
  const saveToast = ref(false)
  let _toastTimer: ReturnType<typeof setTimeout> | null = null

  async function selectDelayLevel(level: StepDelayLevel) {
    if (!editingFlow.value) return
    if (level === 'none') {
      if (!await showConfirm('不设置步骤间隔会导致操作极速触发，容易被网站风控识别和封号，确定要关闭间隔吗？')) return
    }
    editingFlow.value.stepDelayLevel = level
  }

  const showSettingsModal = ref(false)

  function onSettingsConfirm(data: { waitTimeout: number; stepDelayLevel: StepDelayLevel; stepDelayRange: [number, number] | undefined; trigger: FlowTrigger | undefined; downloadMode: DownloadMode }) {
    if (!editingFlow.value) return
    editingFlow.value.waitTimeout    = data.waitTimeout
    editingFlow.value.stepDelayLevel = data.stepDelayLevel
    editingFlow.value.stepDelayRange = data.stepDelayRange
    editingFlow.value.trigger        = data.trigger
    editingFlow.value.downloadMode   = data.downloadMode
    showSettingsModal.value = false
  }

  async function saveFlow() {
    if (!editingFlow.value) return

    if (editingFlow.value.builtin) {
      const savedFlow = await flowStore.saveBuiltinPresetOverride(editingFlow.value)
      if (savedFlow) editingFlow.value = savedFlow
    } else {
      await flowStore.update(editingFlow.value.id, {
        name:           editingFlow.value.name,
        steps:          editingFlow.value.steps,
        stepDelayLevel: editingFlow.value.stepDelayLevel,
        stepDelayRange: editingFlow.value.stepDelayRange,
        waitTimeout:    editingFlow.value.waitTimeout,
        trigger:        editingFlow.value.trigger,
        downloadMode:   editingFlow.value.downloadMode,
      })
    }
    if (_toastTimer) clearTimeout(_toastTimer)
    saveToast.value = true
    _toastTimer = setTimeout(() => { saveToast.value = false }, 2000)
  }

  async function resetPresetCustomization() {
    if (!editingFlow.value?.builtin || !editingFlow.value.customized) return
    if (!await showConfirm(`将「${editingFlow.value.name}」恢复为预设默认设置？\n当前自定义步骤和设置会被覆盖。`, '恢复默认')) return

    const resetFlow = await flowStore.resetBuiltinPresetOverride(editingFlow.value.id)
    if (resetFlow) editingFlow.value = resetFlow
  }

  const { estimatedFlowTime } = useFlowEstimate(editingFlow)

  return {
    saveToast,
    selectDelayLevel,
    showSettingsModal,
    onSettingsConfirm,
    saveFlow,
    resetPresetCustomization,
    estimatedFlowTime,
  }
}
