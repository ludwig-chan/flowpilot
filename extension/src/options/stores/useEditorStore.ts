import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { FlowStep, ActionType } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'

export const useEditorStore = defineStore('editor', () => {
  // ── Loop 编辑共享状态 ────────────────────────────────────────────
  const showEditLoopModal    = ref(false)
  const editingLoopStep      = ref<FlowStep | null>(null)
  const editingLoopChild     = ref<number | null>(null)
  const addingToLoopChild    = ref(false)

  function returnToLoop() {
    showEditLoopModal.value = true
  }

  // ── Action Modal 共享状态 ────────────────────────────────────────
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

  // ── 分支编辑共享状态 ─────────────────────────────────────────────
  const addingToBranch    = ref<{ condStepId: string; branch: 'if' | 'else' } | null>(null)
  const editingBranchStep = ref<{ condStepId: string; branch: 'if' | 'else'; childIdx: number } | null>(null)

  // ── openActionModal（原来需要 proxy 绕圈的函数）────────────────────
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

  function clearEditState() {
    editingInitialType.value        = undefined
    editingInitialValue.value       = undefined
    editingInitialWaitTimeout.value = undefined
    editingInitialFoundDelay.value  = undefined
    editingInitialLabel.value       = undefined
    actionModalEl.value             = null
  }

  return {
    // loop
    showEditLoopModal,
    editingLoopStep,
    editingLoopChild,
    addingToLoopChild,
    returnToLoop,
    // action modal
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
    openActionModal,
    clearEditState,
    // branch
    addingToBranch,
    editingBranchStep,
  }
})
