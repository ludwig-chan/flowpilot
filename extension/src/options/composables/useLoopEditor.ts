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
  scanDom: (scope?: string) => void,
  pickedCssSelector: Ref<string>,
  scopeCanonicalSelector: Ref<string | undefined>,
) {
  const es = useEditorStore()

  const editingLoopStepIdx        = ref<number | null>(null)

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

  /** EditLoopModal 重新选择列表 → 打开元素选择器 */
  function onLoopReselect(currentState: FlowStep, openPickerModal: () => void) {
    es.editingLoopStep     = currentState
    es.showEditLoopModal   = false
    pickedCssSelector.value = ''
    openPickerModal()
    scanDom()
  }

  /** EditLoopModal "添加操作" → 保存当前状态，打开元素选择器 */
  function onLoopAddChild(currentState: FlowStep, openPickerModal: (scope?: string) => void) {
    es.editingLoopStep    = currentState
    es.addingToLoopChild  = true
    es.addingToLoopBranch = null
    es.showEditLoopModal  = false
    pickedCssSelector.value = ''
    const scope = currentState.selector?.cssSelector
    openPickerModal(scope)
    scanDom(scope)
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

  /** onElementPicked 中为循环子步骤计算相对选择器 */
  function getLoopChildActionOpts(el: SerializedElement): {
    overrideSel?: string
    isRelative: boolean
  } {
    // 优先使用 scoped 扫描返回的规范路径做前缀裁剪（双方都是 getCssSelector 格式，保证匹配）
    if (scopeCanonicalSelector.value) {
      const prefix = scopeCanonicalSelector.value
      if (el.selector.cssSelector.startsWith(prefix)) {
        const relSel = el.selector.cssSelector.slice(prefix.length).replace(/^\s*>\s*/, '')
        return { isRelative: true, overrideSel: relSel || undefined }
      }
    }
    // 兜底：旧版 computeRelativeSelector（非 scoped 扫描场景）
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
    openPickerModal: (scope?: string) => void,
  ) {
    es.editingLoopStep    = currentState
    es.addingToLoopBranch = { condChildId, branch }
    es.addingToLoopChild  = true
    es.showEditLoopModal  = false
    pickedCssSelector.value = ''
    const scope = currentState.selector?.cssSelector
    openPickerModal(scope)
    scanDom(scope)
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
    editLoopStep,
    onLoopSave,
    onLoopClose,
    onLoopReselect,
    onLoopAddChild,
    onLoopEditChild,
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
