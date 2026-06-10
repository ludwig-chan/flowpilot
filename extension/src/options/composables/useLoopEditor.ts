import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import { useEditorStore } from '../stores/useEditorStore'

export function useLoopEditor(
  editingFlow: Ref<LocalFlow | null>,
  scanDom: (scope?: string) => void,
  pickedCssSelector: Ref<string>,
) {
  const es = useEditorStore()
  const editingLoopStepIdx = ref<number | null>(null)

  function editLoopStep(step: FlowStep, idx: number) {
    editingLoopStepIdx.value = idx
    es.editingLoopStep = JSON.parse(JSON.stringify(step)) as FlowStep
    es.showEditLoopModal = true
  }

  function onLoopSave(editedStep: FlowStep) {
    es.showEditLoopModal = false
    if (!editingFlow.value || editingLoopStepIdx.value === null) return
    const originalId = editingFlow.value.steps[editingLoopStepIdx.value].id
    editingFlow.value.steps[editingLoopStepIdx.value] = { ...editedStep, id: originalId }
    editingLoopStepIdx.value = null
    es.editingLoopStep = null
  }

  function onLoopClose() {
    editingLoopStepIdx.value = null
    es.resetAll()
  }

  function onLoopReselect(currentState: FlowStep, openPickerModal: () => void) {
    es.editingLoopStep = currentState
    es.showEditLoopModal = false
    pickedCssSelector.value = ''
    openPickerModal()
    scanDom()
  }

  return {
    editingLoopStepIdx,
    editLoopStep,
    onLoopSave,
    onLoopClose,
    onLoopReselect,
  }
}
