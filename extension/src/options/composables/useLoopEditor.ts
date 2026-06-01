import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'
import { useExtensionBridge } from './useExtensionBridge'
import { computeRelativeSelector } from '../utils/selectorUtils'

type Bridge = ReturnType<typeof useExtensionBridge>

export function useLoopEditor(
  editingFlow: Ref<LocalFlow | null>,
  bridge: Bridge,
  scanDom: () => void,
  pickedCssSelector: Ref<string>,
  openActionModal: (
    el: SerializedElement,
    opts: {
      overrideSel?: string
      isRelative?: boolean
      context?: 'single' | { itemSel: string }
    }
  ) => void,
) {
  const showEditLoopModal       = ref(false)
  const editingLoopStepIdx      = ref<number | null>(null)
  const editingLoopStep         = ref<FlowStep | null>(null)
  const editingLoopChild        = ref<number | null>(null)
  const addingToLoopChild       = ref(false)
  const reselectingLoopChild    = ref(false)
  const showListBuilderModal    = ref(false)
  const listBuilderInitialItemSel = ref('')

  /** 编辑已有 loop_items 步骤 → 打开 EditLoopModal */
  function editLoopStep(step: FlowStep, idx: number) {
    editingLoopStepIdx.value = idx
    editingLoopStep.value    = JSON.parse(JSON.stringify(step)) as FlowStep
    showEditLoopModal.value  = true
  }

  /** EditLoopModal 保存 → 写回流程 */
  function onLoopSave(editedStep: FlowStep) {
    showEditLoopModal.value = false
    if (!editingFlow.value || editingLoopStepIdx.value === null) return
    const originalId = editingFlow.value.steps[editingLoopStepIdx.value].id
    editingFlow.value.steps[editingLoopStepIdx.value] = { ...editedStep, id: originalId }
    editingLoopStepIdx.value = null
    editingLoopStep.value    = null
  }

  /** EditLoopModal 关闭 → 丢弃修改 */
  function onLoopClose() {
    showEditLoopModal.value  = false
    editingLoopStepIdx.value = null
    editingLoopStep.value    = null
  }

  /** EditLoopModal 重新选择列表 → 打开 ListBuilderModal */
  function onLoopReselect() {
    showEditLoopModal.value    = false
    pickedCssSelector.value    = ''
    showListBuilderModal.value = true
    scanDom()
  }

  /** EditLoopModal 重选子项 → 以直接模式打开 ListBuilderModal，列表项已预填 */
  function onLoopReselectChild(currentState: FlowStep) {
    editingLoopStep.value              = currentState
    reselectingLoopChild.value         = true
    listBuilderInitialItemSel.value    = currentState.selector?.cssSelector ?? ''
    showEditLoopModal.value            = false
    pickedCssSelector.value            = ''
    showListBuilderModal.value         = true
    scanDom()
  }

  /** EditLoopModal "添加操作" → 保存当前状态，打开元素选择器 */
  function onLoopAddChild(currentState: FlowStep, openPickerModal: () => void) {
    editingLoopStep.value   = currentState
    addingToLoopChild.value = true
    showEditLoopModal.value = false
    pickedCssSelector.value = ''
    openPickerModal()
    scanDom()
  }

  /** EditLoopModal 编辑子步骤 → 打开 ActionPickerModal */
  function onLoopEditChild(childIdx: number, currentState: FlowStep) {
    editingLoopStep.value   = currentState
    editingLoopChild.value  = childIdx
    showEditLoopModal.value = false
    const child = currentState.children?.[childIdx]
    if (!child?.selector) return
    const el: SerializedElement = {
      kind:       child.type === 'input' || child.type === 'clear' ? 'input'
                  : child.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      child.label,
      matchCount: 1,
      selector:   child.selector,
    }
    openActionModal(el, {
      isRelative: child.relativeSelector ?? false,
      context:    'single',
    })
  }

  /** ListBuilderModal 推断完成 → 打开 ActionPickerModal（列表子步骤模式），或更新已有步骤（编辑模式） */
  function onListBuilderDone(
    itemSel:    string,
    targetEl:   SerializedElement,
    relSel:     string,
    openPickerModal: () => void,
  ) {
    showListBuilderModal.value = false
    listBuilderInitialItemSel.value = ''

    // 正在重选子项：只更新 loopChildSelector，不动 itemSel
    if (editingLoopStep.value && reselectingLoopChild.value) {
      reselectingLoopChild.value              = false
      editingLoopStep.value.loopChildSelector = relSel || undefined
      showEditLoopModal.value                 = true
      return
    }

    // 从 EditLoopModal 重新选择列表：更新本地副本并重新打开 EditLoopModal
    if (editingLoopStep.value) {
      editingLoopStep.value.selector = { cssSelector: itemSel }
      editingLoopStep.value.label    = `循环列表：${itemSel.slice(0, 40)}`
      if (relSel) editingLoopStep.value.loopChildSelector = relSel
      showEditLoopModal.value        = true
      return
    }

    // relSel 为空 = 用户选了列表项本身（无子元素相对路径）
    if (!relSel && editingFlow.value) {
      const newStep: FlowStep = {
        id:       `step_${Date.now()}`,
        type:     'loop_items',
        label:    `循环列表：${itemSel.slice(0, 40)}`,
        selector: { cssSelector: itemSel },
        children: [],
      }
      editingFlow.value.steps.push(newStep)
      const idx = editingFlow.value.steps.length - 1
      editingLoopStepIdx.value = idx
      editingLoopStep.value    = JSON.parse(JSON.stringify(newStep)) as FlowStep
      showEditLoopModal.value  = true
      return
    }

    openActionModal(targetEl, {
      overrideSel: relSel || undefined,
      isRelative:  !!relSel,
      context:     { itemSel },
    })
  }

  /** 直接选择模式：直接建立空循环步骤并打开 EditLoopModal */
  function onListBuilderDoneDirect(itemSel: string) {
    showListBuilderModal.value = false
    // 从 EditLoopModal 重新选择列表
    if (editingLoopStep.value) {
      editingLoopStep.value.selector = { cssSelector: itemSel }
      editingLoopStep.value.label    = `循环列表：${itemSel.slice(0, 40)}`
      showEditLoopModal.value        = true
      return
    }
    if (!editingFlow.value) return
    const newStep: FlowStep = {
      id:       `step_${Date.now()}`,
      type:     'loop_items',
      label:    `循环列表：${itemSel.slice(0, 40)}`,
      selector: { cssSelector: itemSel },
      children: [],
    }
    editingFlow.value.steps.push(newStep)
    const idx = editingFlow.value.steps.length - 1
    editingLoopStepIdx.value = idx
    editingLoopStep.value    = JSON.parse(JSON.stringify(newStep)) as FlowStep
    showEditLoopModal.value  = true
  }

  /** 智能列表循环选择器确认 → 建立 loop_items 步骤并打开 EditLoopModal */
  function onSmartLoopConfirm(candidate: import('@shared/types/message').RepeatingCandidate) {
    if (!editingFlow.value) return
    const newStep: FlowStep = {
      id:                `step_${Date.now()}`,
      type:              'loop_items',
      label:             `循环列表：${candidate.itemSelector.slice(0, 40)}`,
      selector:          { cssSelector: candidate.itemSelector },
      loopChildSelector: candidate.relativeSelector || undefined,
      autoClickItem:     true,
      children:          [],
    }
    editingFlow.value.steps.push(newStep)
    const idx = editingFlow.value.steps.length - 1
    editingLoopStepIdx.value = idx
    editingLoopStep.value    = JSON.parse(JSON.stringify(newStep)) as FlowStep
    showEditLoopModal.value  = true
  }

  /** onElementPicked 中为循环子步骤计算相对选择器 */
  function getLoopChildActionOpts(el: SerializedElement): {
    overrideSel?: string
    isRelative: boolean
  } {
    const itemSel = editingLoopStep.value?.selector?.cssSelector ?? ''
    const relSel  = itemSel ? computeRelativeSelector(el.selector.cssSelector, itemSel) : ''
    return {
      isRelative:  !!relSel,
      overrideSel: relSel || undefined,
    }
  }

  /** 返回 EditLoopModal（ActionPickerModal 取消或确认时调用） */
  function returnToLoop() {
    showEditLoopModal.value = true
  }

  return {
    showEditLoopModal,
    editingLoopStepIdx,
    editingLoopStep,
    editingLoopChild,
    addingToLoopChild,
    reselectingLoopChild,
    showListBuilderModal,
    listBuilderInitialItemSel,
    editLoopStep,
    onLoopSave,
    onLoopClose,
    onLoopReselect,
    onLoopReselectChild,
    onLoopAddChild,
    onLoopEditChild,
    onListBuilderDone,
    onListBuilderDoneDirect,
    onSmartLoopConfirm,
    getLoopChildActionOpts,
    returnToLoop,
  }
}
