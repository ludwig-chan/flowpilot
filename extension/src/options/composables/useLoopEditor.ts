import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'
import { computeRelativeSelector } from '../utils/selectorUtils'
import { useEditorStore } from '../stores/useEditorStore'
import { genId } from '@shared/utils/genId'

export function useLoopEditor(
  editingFlow: Ref<LocalFlow | null>,
  scanDom: () => void,
  pickedCssSelector: Ref<string>,
) {
  const es = useEditorStore()

  const editingLoopStepIdx        = ref<number | null>(null)
  const reselectingLoopChild      = ref(false)
  const showListBuilderModal      = ref(false)
  const listBuilderInitialItemSel = ref('')

  /** 编辑已有 loop_items 步骤 → 打开 EditLoopModal */
  function editLoopStep(step: FlowStep, idx: number) {
    editingLoopStepIdx.value = idx
    es.editingLoopStep       = JSON.parse(JSON.stringify(step)) as FlowStep
    es.showEditLoopModal     = true
  }

  /** EditLoopModal 保存 → 写回流程 */
  function onLoopSave(editedStep: FlowStep) {
    es.showEditLoopModal = false
    if (!editingFlow.value || editingLoopStepIdx.value === null) return
    const originalId = editingFlow.value.steps[editingLoopStepIdx.value].id
    editingFlow.value.steps[editingLoopStepIdx.value] = { ...editedStep, id: originalId }
    editingLoopStepIdx.value = null
    es.editingLoopStep       = null
  }

  /** EditLoopModal 关闭 → 丢弃修改 */
  function onLoopClose() {
    editingLoopStepIdx.value = null
    es.resetAll()
  }

  /** EditLoopModal 重新选择列表 → 打开 ListBuilderModal */
  function onLoopReselect() {
    es.showEditLoopModal       = false
    pickedCssSelector.value    = ''
    showListBuilderModal.value = true
    scanDom()
  }

  /** EditLoopModal 重选子项 → 以直接模式打开 ListBuilderModal，列表项已预填 */
  function onLoopReselectChild(currentState: FlowStep) {
    es.editingLoopStep              = currentState
    reselectingLoopChild.value      = true
    listBuilderInitialItemSel.value = currentState.selector?.cssSelector ?? ''
    es.showEditLoopModal            = false
    pickedCssSelector.value         = ''
    showListBuilderModal.value      = true
    scanDom()
  }

  /** EditLoopModal "添加操作" → 保存当前状态，打开元素选择器 */
  function onLoopAddChild(currentState: FlowStep, openPickerModal: () => void) {
    es.editingLoopStep    = currentState
    es.addingToLoopChild  = true
    es.addingToLoopBranch = null
    es.showEditLoopModal  = false
    pickedCssSelector.value = ''
    openPickerModal()
    scanDom()
  }

  /** EditLoopModal 编辑子步骤 → 打开 ActionPickerModal / CallFlowPicker / ConditionModal */
  function onLoopEditChild(childIdx: number, currentState: FlowStep, openConditionModal?: () => void) {
    es.editingLoopStep    = currentState
    es.editingLoopChild   = childIdx
    es.addingToLoopBranch = null
    es.showEditLoopModal  = false
    const child = currentState.children?.[childIdx]
    if (!child) return
    if (child.type === 'call_flow') {
      showLoopCallFlowPicker.value = true
      return
    }
    if (child.type === 'condition') {
      openConditionModal?.()
      return
    }
    if (!child.selector) return
    const el: SerializedElement = {
      kind:       child.type === 'input' || child.type === 'clear' ? 'input'
                  : child.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      child.label,
      matchCount: 1,
      selector:   child.selector,
    }
    es.openActionModal(el, {
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
    if (es.editingLoopStep && reselectingLoopChild.value) {
      reselectingLoopChild.value              = false
      es.editingLoopStep.loopChildSelector    = relSel || undefined
      es.showEditLoopModal                    = true
      return
    }

    // 从 EditLoopModal 重新选择列表：更新本地副本并重新打开 EditLoopModal
    if (es.editingLoopStep) {
      es.editingLoopStep.selector = { cssSelector: itemSel }
      es.editingLoopStep.label    = `循环列表：${itemSel.slice(0, 40)}`
      if (relSel) es.editingLoopStep.loopChildSelector = relSel
      es.showEditLoopModal        = true
      return
    }

    // relSel 为空 = 用户选了列表项本身（无子元素相对路径）
    if (!relSel && editingFlow.value) {
      const newStep: FlowStep = {
        id:       genId('step'),
        type:     'loop_items',
        label:    `循环列表：${itemSel.slice(0, 40)}`,
        selector: { cssSelector: itemSel },
        children: [],
      }
      editingFlow.value.steps.push(newStep)
      const idx = editingFlow.value.steps.length - 1
      editingLoopStepIdx.value = idx
      es.editingLoopStep       = JSON.parse(JSON.stringify(newStep)) as FlowStep
      es.showEditLoopModal     = true
      return
    }

    es.openActionModal(targetEl, {
      overrideSel: relSel || undefined,
      isRelative:  !!relSel,
      context:     { itemSel },
    })
  }

  /** 直接选择模式：直接建立空循环步骤并打开 EditLoopModal */
  function onListBuilderDoneDirect(itemSel: string) {
    showListBuilderModal.value = false
    // 从 EditLoopModal 重新选择列表
    if (es.editingLoopStep) {
      es.editingLoopStep.selector = { cssSelector: itemSel }
      es.editingLoopStep.label    = `循环列表：${itemSel.slice(0, 40)}`
      es.showEditLoopModal        = true
      return
    }
    if (!editingFlow.value) return
    const newStep: FlowStep = {
      id:       genId('step'),
      type:     'loop_items',
      label:    `循环列表：${itemSel.slice(0, 40)}`,
      selector: { cssSelector: itemSel },
      children: [],
    }
    editingFlow.value.steps.push(newStep)
    const idx = editingFlow.value.steps.length - 1
    editingLoopStepIdx.value = idx
    es.editingLoopStep       = JSON.parse(JSON.stringify(newStep)) as FlowStep
    es.showEditLoopModal     = true
  }

  /** 智能列表循环选择器确认 → 建立 loop_items 步骤并打开 EditLoopModal */
  function onSmartLoopConfirm(candidate: import('@shared/types/message').RepeatingCandidate) {
    if (!editingFlow.value) return
    const newStep: FlowStep = {
      id:                genId('step'),
      type:              'loop_items',
      label:             `循环列表：${candidate.itemSelector.slice(0, 40)}`,
      selector:          { cssSelector: candidate.itemSelector },
      loopChildSelector: candidate.relativeSelector || undefined,
      children:          [],
    }
    editingFlow.value.steps.push(newStep)
    const idx = editingFlow.value.steps.length - 1
    editingLoopStepIdx.value = idx
    es.editingLoopStep       = JSON.parse(JSON.stringify(newStep)) as FlowStep
    es.showEditLoopModal     = true
  }

  /** onElementPicked 中为循环子步骤计算相对选择器 */
  function getLoopChildActionOpts(el: SerializedElement): {
    overrideSel?: string
    isRelative: boolean
  } {
    const itemSel = es.editingLoopStep?.selector?.cssSelector ?? ''
    const relSel  = itemSel ? computeRelativeSelector(el.selector.cssSelector, itemSel) : ''
    return {
      isRelative:  !!relSel,
      overrideSel: relSel || undefined,
    }
  }

  // ── 循环内嵌入流程 ────────────────────────────────────────────────────
  const showLoopCallFlowPicker = ref(false)

  /** EditLoopModal "嵌入流程" → 保存当前状态，关闭 Modal，显示流程选择器（新增模式） */
  function onLoopAddCallFlow(currentState: FlowStep) {
    es.editingLoopStep        = currentState
    es.editingLoopChild       = null
    es.addingToLoopBranch     = null
    es.showEditLoopModal      = false
    showLoopCallFlowPicker.value = true
  }

  /** 流程选择确认 → 编辑模式替换已有子步骤，新增模式追加到 children[] */
  function onLoopConfirmCallFlow(id: string, name: string) {
    showLoopCallFlowPicker.value = false
    if (!es.editingLoopStep) return

    // ── 分支模式：写入条件子步骤的 if/else 分支 ──────────────────────
    const branchCtx = es.addingToLoopBranch
    if (branchCtx) {
      const cond = es.editingLoopStep.children?.find(c => c.id === branchCtx.condChildId)
      if (cond) {
        const arr = branchCtx.branch === 'if'
          ? (cond.children     = cond.children     ?? [])
          : (cond.elseChildren = cond.elseChildren ?? [])
        const childIdx = es.editingLoopChild
        if (childIdx !== null && arr[childIdx]) {
          const originalId = arr[childIdx].id
          arr[childIdx] = { id: originalId, type: 'call_flow', label: `嵌入流程：${name}`, flowRef: id }
        } else {
          arr.push({
            id:      genId('step'),
            type:    'call_flow',
            label:   `嵌入流程：${name}`,
            flowRef: id,
          })
        }
      }
      es.addingToLoopBranch = null
      es.editingLoopChild   = null
      es.showEditLoopModal  = true
      return
    }

    // ── 顶层模式：写入 editingLoopStep.children ───────────────────────
    es.editingLoopStep.children = es.editingLoopStep.children ?? []
    const childIdx = es.editingLoopChild
    if (childIdx !== null && es.editingLoopStep.children[childIdx]) {
      // 编辑模式：替换，保留原 id
      const originalId = es.editingLoopStep.children[childIdx].id
      es.editingLoopStep.children[childIdx] = {
        id:      originalId,
        type:    'call_flow',
        label:   `嵌入流程：${name}`,
        flowRef: id,
      }
    } else {
      // 新增模式：追加
      es.editingLoopStep.children.push({
        id:      genId('step'),
        type:    'call_flow',
        label:   `嵌入流程：${name}`,
        flowRef: id,
      })
    }
    es.editingLoopChild  = null
    es.showEditLoopModal = true
  }

  // ── 循环内添加条件 / 延迟 ────────────────────────────────────────────

  /** EditLoopModal "添加条件" → 保存当前状态，打开条件编辑器（写入 loop children） */
  function onLoopAddCondition(currentState: FlowStep, openConditionModal: () => void) {
    es.editingLoopStep    = currentState
    es.addingToLoopBranch = null
    es.editingLoopChild   = null
    es.showEditLoopModal  = false
    openConditionModal()
  }

  /** EditLoopModal "添加延迟" → 直接追加 delay 步骤并重新打开 Modal */
  function onLoopAddDelay(currentState: FlowStep) {
    currentState.children = currentState.children ?? []
    currentState.children.push({
      id:    genId('step'),
      type:  'delay',
      label: '等待 1000 ms',
      value: '1000',
    })
    es.editingLoopStep   = currentState
    es.showEditLoopModal = true
  }

  // ── 条件分支内步骤操作 ────────────────────────────────────────────────

  /** EditLoopModal 分支内添加元素操作 */
  function onLoopAddBranchChild(
    condChildId: string,
    branch: 'if' | 'else',
    currentState: FlowStep,
    openPickerModal: () => void,
  ) {
    es.editingLoopStep    = currentState
    es.addingToLoopBranch = { condChildId, branch }
    es.addingToLoopChild  = true
    es.showEditLoopModal  = false
    pickedCssSelector.value = ''
    openPickerModal()
    scanDom()
  }

  /** EditLoopModal 分支内嵌入流程 */
  function onLoopAddBranchCallFlow(
    condChildId: string,
    branch: 'if' | 'else',
    currentState: FlowStep,
  ) {
    es.editingLoopStep        = currentState
    es.addingToLoopBranch     = { condChildId, branch }
    es.editingLoopChild       = null
    es.showEditLoopModal      = false
    showLoopCallFlowPicker.value = true
  }

  /** EditLoopModal 分支内添加条件 */
  function onLoopAddBranchCondition(
    condChildId: string,
    branch: 'if' | 'else',
    currentState: FlowStep,
    openConditionModal: () => void,
  ) {
    es.editingLoopStep    = currentState
    es.addingToLoopBranch = { condChildId, branch }
    es.editingLoopChild   = null
    es.showEditLoopModal  = false
    openConditionModal()
  }

  /** EditLoopModal 分支内编辑已有子步骤 */
  function onLoopEditBranchChild(
    condChildId: string,
    branch: 'if' | 'else',
    childIdx: number,
    currentState: FlowStep,
  ) {
    es.editingLoopStep    = currentState
    es.addingToLoopBranch = { condChildId, branch }
    es.showEditLoopModal  = false
    const cond = currentState.children?.find(c => c.id === condChildId)
    if (!cond) return
    const branchArr = branch === 'if' ? cond.children : cond.elseChildren
    const child = branchArr?.[childIdx]
    if (!child) return
    if (child.type === 'call_flow') {
      es.editingLoopChild = childIdx
      showLoopCallFlowPicker.value = true
      return
    }
    if (!child.selector) return
    es.editingLoopChild = childIdx
    const el: SerializedElement = {
      kind:       child.type === 'input' || child.type === 'clear' ? 'input'
                  : child.type === 'select' ? 'select'
                  : 'click',
      confidence: 'high',
      label:      child.label,
      matchCount: 1,
      selector:   child.selector,
    }
    es.openActionModal(el, {
      isRelative: child.relativeSelector ?? false,
      context:    'single',
    })
  }

  return {
    editingLoopStepIdx,
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
    showLoopCallFlowPicker,
    onLoopAddCallFlow,
    onLoopConfirmCallFlow,
    onLoopAddCondition,
    onLoopAddDelay,
    onLoopAddBranchChild,
    onLoopAddBranchCallFlow,
    onLoopAddBranchCondition,
    onLoopEditBranchChild,
  }
}
