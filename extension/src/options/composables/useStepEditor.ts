import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep, ActionType } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'
import { useEditorStore } from '../stores/useEditorStore'

export function useStepEditor(
  editingFlow: Ref<LocalFlow | null>,
) {
  const es = useEditorStore()

  /** ElementPickerModal 选中元素后 → 打开 ActionPickerModal */
  function onElementPicked(
    el: SerializedElement,
    openPickerModal: Ref<boolean>,
    pickMode: Ref<boolean>,
    cancelPickElement: () => void,
  ) {
    openPickerModal.value = false
    if (pickMode.value) { pickMode.value = false; cancelPickElement() }

    if (es.editingStepIdx === null && es.editingBranchStep === null) {
      es.editingInitialType  = undefined
      es.editingInitialValue = undefined
    }

    es.openActionModal(el)
  }

  /** 编辑已有步骤 → 预填开启 ActionPickerModal */
  function editStep(step: FlowStep, idx: number) {
    if (!step.selector) return
    es.editingStepIdx    = idx
    es.editingBranchStep = null
    const el: SerializedElement = {
      kind:       step.type === 'input' || step.type === 'clear' ? 'input'
                  : step.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      step.label,
      matchCount: 1,
      selector:   step.selector,
    }
    es.openActionModal(el, {
      isRelative:         step.relativeSelector ?? false,
      initialType:        step.type,
      initialValue:       step.value,
      initialWaitTimeout: step.waitTimeout,
      initialFoundDelay:  step.foundDelay,
      initialLabel:       step.label,
    })
  }

  /** ActionPickerModal 点击「换元素」 → 保留动作状态，重新打开元素选择器 */
  function onActionRePick(
    type: ActionType,
    value: string | undefined,
    showPickerModal: Ref<boolean>,
    pickedCssSelector: Ref<string>,
  ) {
    es.editingInitialType  = type
    es.editingInitialValue = value
    es.showActionModal     = false
    pickedCssSelector.value = ''
    showPickerModal.value   = true
  }

  /** 关闭 ActionPickerModal，清理编辑状态 */
  function cancelActionModal() {
    es.resetAll()
  }

  /** ActionPickerModal 确认 → 将步骤写入流程（新建）或替换现有步骤（编辑） */
  function onActionConfirm(step: FlowStep) {
    es.showActionModal = false

    if (!editingFlow.value) return

    if (es.editingBranchStep) {
      const { condStepId, branch, childIdx } = es.editingBranchStep
      const condStep = editingFlow.value.steps.find(s => s.id === condStepId)
      if (condStep) {
        const arr    = branch === 'if' ? condStep.children! : condStep.elseChildren!
        const origId = arr[childIdx].id
        arr[childIdx] = { ...step, id: origId }
      }
      es.editingBranchStep   = null
      es.editingInitialType  = undefined
      es.editingInitialValue = undefined
    } else if (es.editingStepIdx !== null) {
      const originalId = editingFlow.value.steps[es.editingStepIdx].id
      editingFlow.value.steps[es.editingStepIdx] = { ...step, id: originalId }
      es.editingStepIdx      = null
      es.editingInitialType  = undefined
      es.editingInitialValue = undefined
    } else if (es.addingToBranch) {
      const { condStepId, branch } = es.addingToBranch
      const condStep = editingFlow.value.steps.find(s => s.id === condStepId)
      if (condStep) {
        if (branch === 'if') condStep.children = [...(condStep.children ?? []), step]
        else condStep.elseChildren = [...(condStep.elseChildren ?? []), step]
      }
      es.addingToBranch = null
    } else editingFlow.value.steps.push(step)
    es.actionModalEl             = null
    es.editingInitialWaitTimeout = undefined
    es.editingInitialFoundDelay  = undefined
    es.editingInitialLabel       = undefined
  }

  /** 编辑分支内子步骤（打开 ActionPickerModal） */
  function editBranchStep(
    condStepId: string,
    branch:     'if' | 'else',
    childStep:  FlowStep,
    childIdx:   number,
  ) {
    if (!childStep.selector) return
    es.editingBranchStep = { condStepId, branch, childIdx }
    es.editingStepIdx    = null
    const el: SerializedElement = {
      kind:       childStep.type === 'input' || childStep.type === 'clear' ? 'input'
                  : childStep.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      childStep.label,
      matchCount: 1,
      selector:   childStep.selector,
    }
    es.openActionModal(el, {
      isRelative:         childStep.relativeSelector ?? false,
      initialType:        childStep.type,
      initialValue:       childStep.value,
      initialWaitTimeout: childStep.waitTimeout,
      initialFoundDelay:  childStep.foundDelay,
      initialLabel:       childStep.label,
    })
  }

  return {
    onElementPicked,
    editStep,
    onActionRePick,
    cancelActionModal,
    onActionConfirm,
    editBranchStep,
  }
}
