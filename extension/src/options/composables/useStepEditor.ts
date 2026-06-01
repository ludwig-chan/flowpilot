import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep, ActionType } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'

export function useStepEditor(
  editingFlow: Ref<LocalFlow | null>,
  editingLoopStep: Ref<FlowStep | null>,
  editingLoopChild: Ref<number | null>,
  addingToLoopChild: Ref<boolean>,
  returnToLoop: () => void,
) {
  const showActionModal        = ref(false)
  const actionModalEl          = ref<SerializedElement | null>(null)
  const actionModalOverrideSel = ref<string | undefined>(undefined)
  const actionModalIsRelative  = ref(false)
  const actionModalContext     = ref<'single' | { itemSel: string }>('single')

  const editingStepIdx            = ref<number | null>(null)
  const editingInitialType        = ref<ActionType | undefined>(undefined)
  const editingInitialValue       = ref<string | undefined>(undefined)
  const editingInitialWaitTimeout = ref<number | undefined>(undefined)
  const editingInitialFoundDelay  = ref<[number, number] | undefined>(undefined)
  const editingInitialLabel       = ref<string | undefined>(undefined)

  // 分支步骤编辑状态（Phase 3 中会被 useConditionEditor 使用，此处创建并返回）
  const addingToBranch    = ref<{ condStepId: string; branch: 'if' | 'else' } | null>(null)
  const editingBranchStep = ref<{ condStepId: string; branch: 'if' | 'else'; childIdx: number } | null>(null)

  function _clearEditState() {
    editingInitialType.value        = undefined
    editingInitialValue.value       = undefined
    editingInitialWaitTimeout.value = undefined
    editingInitialFoundDelay.value  = undefined
    editingInitialLabel.value       = undefined
    actionModalEl.value             = null
  }

  /** 打开 ActionPickerModal（供外部：onElementPicked、onLoopEditChild、editBranchStep 等调用） */
  function openActionModal(
    el: SerializedElement,
    opts: {
      overrideSel?: string
      isRelative?: boolean
      context?: 'single' | { itemSel: string }
      initialType?: ActionType
      initialValue?: string
      initialWaitTimeout?: number
      initialFoundDelay?: [number, number]
      initialLabel?: string
    } = {},
  ) {
    actionModalEl.value          = el
    actionModalOverrideSel.value = opts.overrideSel
    actionModalIsRelative.value  = opts.isRelative ?? false
    actionModalContext.value     = opts.context ?? 'single'
    if (opts.initialType !== undefined)        editingInitialType.value        = opts.initialType
    if (opts.initialValue !== undefined)       editingInitialValue.value       = opts.initialValue
    if (opts.initialWaitTimeout !== undefined) editingInitialWaitTimeout.value = opts.initialWaitTimeout
    if (opts.initialFoundDelay !== undefined)  editingInitialFoundDelay.value  = opts.initialFoundDelay
    if (opts.initialLabel !== undefined)       editingInitialLabel.value       = opts.initialLabel
    showActionModal.value = true
  }

  /** ElementPickerModal 选中元素后 → 打开 ActionPickerModal */
  function onElementPicked(
    el: SerializedElement,
    getLoopChildOpts: (el: SerializedElement) => { overrideSel?: string; isRelative: boolean },
    openPickerModal: Ref<boolean>,
    pickMode: Ref<boolean>,
    cancelPickElement: () => void,
  ) {
    openPickerModal.value = false
    if (pickMode.value) { pickMode.value = false; cancelPickElement() }

    let overrideSel: string | undefined = undefined
    let isRelative = false
    let context: 'single' | { itemSel: string } = 'single'

    if (editingStepIdx.value === null && editingBranchStep.value === null && editingLoopChild.value === null && !addingToLoopChild.value) {
      editingInitialType.value  = undefined
      editingInitialValue.value = undefined
    }

    if (addingToLoopChild.value) {
      const opts = getLoopChildOpts(el)
      isRelative  = opts.isRelative
      overrideSel = opts.overrideSel
    }

    openActionModal(el, { overrideSel, isRelative, context })
  }

  /** 编辑已有步骤 → 预填开启 ActionPickerModal */
  function editStep(step: FlowStep, idx: number) {
    if (!step.selector) return
    editingStepIdx.value = idx
    editingBranchStep.value = null
    const el: SerializedElement = {
      kind:       step.type === 'input' || step.type === 'clear' ? 'input'
                  : step.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      step.label,
      matchCount: 1,
      selector:   step.selector,
    }
    openActionModal(el, {
      isRelative:         step.relativeSelector ?? false,
      context:            'single',
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
    editingInitialType.value  = type
    editingInitialValue.value = value
    showActionModal.value     = false
    pickedCssSelector.value   = ''
    showPickerModal.value     = true
  }

  /** 关闭 ActionPickerModal，清理编辑状态 */
  function cancelActionModal() {
    const wasLoopChild    = editingLoopChild.value !== null
    const wasAddingToLoop = addingToLoopChild.value
    showActionModal.value = false
    _clearEditState()
    editingStepIdx.value      = null
    addingToBranch.value      = null
    editingBranchStep.value   = null
    editingLoopChild.value    = null
    addingToLoopChild.value   = false
    if (wasLoopChild || wasAddingToLoop) returnToLoop()
  }

  /** ActionPickerModal 确认 → 将步骤写入流程（新建）或替换现有步骤（编辑） */
  function onActionConfirm(step: FlowStep) {
    showActionModal.value = false

    // 编辑循环步骤的子步骤
    if (editingLoopChild.value !== null && editingLoopStep.value) {
      const idx    = editingLoopChild.value
      const origId = editingLoopStep.value.children![idx].id
      editingLoopStep.value.children![idx] = { ...step, id: origId }
      editingLoopChild.value = null
      _clearEditState()
      returnToLoop()
      return
    }

    // 为循环步骤添加新子步骤
    if (addingToLoopChild.value && editingLoopStep.value) {
      editingLoopStep.value.children = [...(editingLoopStep.value.children ?? []), step]
      addingToLoopChild.value = false
      _clearEditState()
      returnToLoop()
      return
    }

    if (!editingFlow.value) return

    if (editingBranchStep.value) {
      const { condStepId, branch, childIdx } = editingBranchStep.value
      const condStep = editingFlow.value.steps.find(s => s.id === condStepId)
      if (condStep) {
        const arr    = branch === 'if' ? condStep.children! : condStep.elseChildren!
        const origId = arr[childIdx].id
        arr[childIdx] = { ...step, id: origId }
      }
      editingBranchStep.value   = null
      editingInitialType.value  = undefined
      editingInitialValue.value = undefined
    } else if (editingStepIdx.value !== null) {
      const originalId = editingFlow.value.steps[editingStepIdx.value].id
      editingFlow.value.steps[editingStepIdx.value] = { ...step, id: originalId }
      editingStepIdx.value      = null
      editingInitialType.value  = undefined
      editingInitialValue.value = undefined
    } else if (addingToBranch.value) {
      const { condStepId, branch } = addingToBranch.value
      const condStep = editingFlow.value.steps.find(s => s.id === condStepId)
      if (condStep) {
        if (branch === 'if') condStep.children = [...(condStep.children ?? []), step]
        else condStep.elseChildren = [...(condStep.elseChildren ?? []), step]
      }
      addingToBranch.value = null
    } else if (actionModalContext.value === 'single') {
      editingFlow.value.steps.push(step)
    } else {
      const { itemSel } = actionModalContext.value
      editingFlow.value.steps.push({
        id:                `step_${Date.now()}`,
        type:              'loop_items',
        label:             `循环列表：${itemSel.slice(0, 40)}`,
        selector:          { cssSelector: itemSel },
        loopChildSelector: step.relativeSelector ? step.selector?.cssSelector : undefined,
        children:          [step],
      })
    }
    actionModalEl.value             = null
    editingInitialWaitTimeout.value = undefined
    editingInitialFoundDelay.value  = undefined
    editingInitialLabel.value       = undefined
  }

  /** 编辑分支内子步骤（打开 ActionPickerModal） */
  function editBranchStep(
    condStepId: string,
    branch:     'if' | 'else',
    childStep:  FlowStep,
    childIdx:   number,
  ) {
    if (!childStep.selector) return
    editingBranchStep.value = { condStepId, branch, childIdx }
    editingStepIdx.value    = null
    const el: SerializedElement = {
      kind:       childStep.type === 'input' || childStep.type === 'clear' ? 'input'
                  : childStep.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      childStep.label,
      matchCount: 1,
      selector:   childStep.selector,
    }
    openActionModal(el, {
      isRelative:         childStep.relativeSelector ?? false,
      context:            'single',
      initialType:        childStep.type,
      initialValue:       childStep.value,
      initialWaitTimeout: childStep.waitTimeout,
      initialFoundDelay:  childStep.foundDelay,
      initialLabel:       childStep.label,
    })
  }

  return {
    showActionModal,
    actionModalEl,
    actionModalOverrideSel,
    actionModalIsRelative,
    actionModalContext,
    editingStepIdx,
    editingInitialType,
    editingInitialValue,
    editingInitialWaitTimeout,
    editingInitialFoundDelay,
    editingInitialLabel,
    addingToBranch,
    editingBranchStep,
    openActionModal,
    onElementPicked,
    editStep,
    onActionRePick,
    cancelActionModal,
    onActionConfirm,
    editBranchStep,
  }
}
