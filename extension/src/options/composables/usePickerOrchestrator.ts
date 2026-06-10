import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep, ActionType } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'
import { useBridge } from './useBridge'
import { showAlert } from '@shared/utils/dialog'
import { useLoopEditor } from './useLoopEditor'
import { useStepEditor } from './useStepEditor'
import { useSmartLoop } from './useSmartLoop'
import { genId } from '@shared/utils/genId'
import { useEditorStore } from '../stores/useEditorStore'

export function usePickerOrchestrator(
  editingFlow: Ref<LocalFlow | null>,
  requireTab: (cb: () => void) => void,
  pickedCssSelector: Ref<string>,
  pickMode: Ref<boolean>,
  scanDom: (scope?: string) => void,
  togglePickMode: (scope?: string) => void,
) {
  const bridge = useBridge()
  const es = useEditorStore()
  const showPickerModal = ref(false)
  const pickerScope = ref<string | undefined>(undefined)

  // ── useLoopEditor ─────────────────────────────────────────────────
  const {
    editingLoopStepIdx,
    editLoopStep,
    onLoopSave,
    onLoopClose,
    onLoopReselect:           _onLoopReselectRaw,
  } = useLoopEditor(editingFlow, scanDom, pickedCssSelector)

  // ── useStepEditor ─────────────────────────────────────────────────
  const {
    onElementPicked: _onElementPickedBase,
    editStep,
    onActionRePick: _onActionRePickBase,
    cancelActionModal,
    onActionConfirm: _onActionConfirmBase,
    editBranchStep,
  } = useStepEditor(editingFlow)

  function makeLoopClickLabel(name: string, count?: number) {
    return count !== undefined
      ? `逐项点击列表：${name}（${count} 项）`
      : `逐项点击列表：${name}`
  }

  // ── useSmartLoop（确认候选后创建/更新逐项点击列表步骤）────────────────────
  const {
    showSmartLoopModal,
    smartLoopCandidates,
    onSmartLoopConfirm,
  } = useSmartLoop(editingFlow, (candidate) => {
    if (reselectingLoopList.value && es.editingLoopStep) {
      reselectingLoopList.value = false
      es.editingLoopStep.selector = { cssSelector: candidate.itemSelector }
      es.editingLoopStep.label = makeLoopClickLabel(candidate.inferredLabel, candidate.count)
      es.showEditLoopModal = true
      return
    }
    if (!editingFlow.value) return
    const newStep: FlowStep = {
      id:                genId('step'),
      type:              'loop_items',
      label:             makeLoopClickLabel(candidate.inferredLabel, candidate.count),
      selector:          { cssSelector: candidate.itemSelector },
      children:          [],
    }
    editingFlow.value.steps.push(newStep)
  })

  // ── Smart Loop 模式标志 ───────────────────────────────────────────
  const smartLoopMode = ref(false)
  const reselectingLoopList = ref(false)

  // ── ActionPickerModal 确认 ──────────────────────────────────────────
  function onActionConfirm(step: FlowStep) {
    _onActionConfirmBase(step)
  }

  // ── Wrappers ──────────────────────────────────────────────────────

  /** ElementPickerModal 选中元素后 → 打开 ActionPickerModal（或直接创建 element_branch 步骤） */
  function onElementPicked(el: SerializedElement) {
    if (reselectingLoopList.value) {
      showPickerModal.value = false
      if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
      bridge.requestSmartLoopFromSelector(el.selector.cssSelector)
      return
    }
    // ── Smart Loop 模式：关闭选择器，通知 content script 分析祖先结构 ──
    if (smartLoopMode.value) {
      smartLoopMode.value = false
      showPickerModal.value = false
      if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
      bridge.requestSmartLoopFromSelector(el.selector.cssSelector)
      return
    }
    if (es.addingElementBranch) {
      es.addingElementBranch = false
      showPickerModal.value = false
      if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
      if (!editingFlow.value) return
      editingFlow.value.steps.push({
        id:           genId('step'),
        type:         'element_branch',
        label:        `元素分支：${el.label || el.selector.cssSelector.slice(0, 30)}`,
        selector:     el.selector,
        children:     [],
        elseChildren: [],
      })
      return
    }
    _onElementPickedBase(el, showPickerModal, pickMode, () => bridge.cancelPickElement())
  }

  /** ActionPickerModal 点击「换元素」 → 保留动作状态，重新打开元素选择器 */
  function onActionRePick(type: ActionType, value: string | undefined) {
    _onActionRePickBase(type, value, showPickerModal, pickedCssSelector)
  }

  async function openPicker() {
    if (!editingFlow.value) { await showAlert('请先打开一个流程'); return }
    requireTab(() => {
      pickerScope.value = undefined
      pickedCssSelector.value = ''
      showPickerModal.value = true
      scanDom()
    })
  }

  /** 添加元素分支步骤：打开选择器，选完元素后直接创建 element_branch（不进 ActionPickerModal） */
  async function addElementBranch() {
    if (!editingFlow.value) { await showAlert('请先打开一个流程'); return }
    requireTab(() => {
      es.addingElementBranch = true
      pickedCssSelector.value = ''
      showPickerModal.value = true
      scanDom()
    })
  }

  /** 打开 SmartLoop 元素选择器（复用普通 ElementPickerModal，选完后分析祖先） */
  async function openSmartLoopPicker() {
    if (!editingFlow.value) { await showAlert('请先打开一个流程'); return }
    smartLoopMode.value = true
    openPicker()
  }

  function closePicker() {
    showPickerModal.value = false
    pickedCssSelector.value = ''
    pickerScope.value = undefined
    reselectingLoopList.value = false
    if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
  }

  function openPickerInScope(scope?: string) {
    pickerScope.value = scope
    showPickerModal.value = true
  }

  function scanPickerDom() {
    scanDom(pickerScope.value)
  }

  function togglePickerPickMode() {
    togglePickMode(pickerScope.value)
  }

  function onLoopReselect(currentState: FlowStep) {
    reselectingLoopList.value = true
    _onLoopReselectRaw(currentState, openPickerInScope)
  }

  function onSmartLoopCancel() {
    showSmartLoopModal.value = false
    bridge.clearLoopHighlights()
    if (reselectingLoopList.value && es.editingLoopStep) {
      es.showEditLoopModal = true
    }
    reselectingLoopList.value = false
  }

  /** ActionPickerModal 试一下 → 临时执行单个步骤 */
  async function onActionTry(step: FlowStep) {
    await bridge.runFlow([step])
  }

  /** ElementPickerDrawer 更多动作栏 → 对指定元素执行一次性操作 */
  async function onTestAction(css: string, actionType: string, value?: string) {
    const step: FlowStep = {
      id:       `test_${Date.now()}`,
      type:     actionType as FlowStep['type'],
      label:    `试：${actionType} ${css.slice(0, 30)}`,
      selector: { cssSelector: css },
      value:    value,
    }
    await bridge.runFlow([step])
  }

  return {
    showPickerModal,
    // useLoopEditor
    editingLoopStepIdx,
    editLoopStep, onLoopSave, onLoopClose, onLoopReselect,
    // useStepEditor
    editStep, cancelActionModal, onActionConfirm, editBranchStep,
    // useSmartLoop
    showSmartLoopModal, smartLoopCandidates,
    openSmartLoopPicker, onSmartLoopConfirm, onSmartLoopCancel,
    // Wrappers
    onElementPicked, onActionRePick, openPicker, closePicker,
    scanPickerDom, togglePickerPickMode,
    onActionTry, onTestAction,
    // element_branch
    addElementBranch,
  }
}
