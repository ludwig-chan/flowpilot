import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep, ActionType } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'
import { useBridge } from './useBridge'
import { useLoopEditor } from './useLoopEditor'
import { useStepEditor } from './useStepEditor'
import { useSmartLoop } from './useSmartLoop'
import { useEditorStore } from '../stores/useEditorStore'

export function usePickerOrchestrator(
  editingFlow: Ref<LocalFlow | null>,
  activeTabId: Ref<number | null>,
  requireTab: (cb: () => void) => void,
  pickedCssSelector: Ref<string>,
  pickMode: Ref<boolean>,
  scanDom: () => void,
) {
  const bridge = useBridge()
  const es = useEditorStore()
  const showPickerModal = ref(false)

  // ── useLoopEditor ─────────────────────────────────────────────────
  const {
    editingLoopStepIdx,
    reselectingLoopChild,
    editLoopStep,
    onLoopSave,
    onLoopClose,
    onLoopReselect,
    onLoopReselectChild,
    onLoopAddChild:            _onLoopAddChildRaw,
    onLoopEditChild:           _onLoopEditChildRaw,
    onSmartLoopConfirm:        _onSmartLoopConfirmLoop,
    getLoopChildActionOpts,
    showLoopCallFlowPicker,
    onLoopAddCallFlow,
    onLoopConfirmCallFlow,
    onLoopAddCondition:        _onLoopAddConditionRaw,
    onLoopAddDelay,
    onLoopAddBranchChild:      _onLoopAddBranchChildRaw,
    onLoopAddBranchCallFlow,
    onLoopAddBranchCondition:  _onLoopAddBranchConditionRaw,
    onLoopEditBranchChild,
  } = useLoopEditor(editingFlow, scanDom, pickedCssSelector)

  // ── useStepEditor ─────────────────────────────────────────────────
  const {
    onElementPicked: _onElementPickedBase,
    editStep,
    onActionRePick: _onActionRePickBase,
    cancelActionModal,
    onActionConfirm,
    editBranchStep,
  } = useStepEditor(editingFlow)

  // ── useSmartLoop ──────────────────────────────────────────────────
  const {
    showSmartLoopModal,
    smartLoopCandidates,
    smartLoopPickedEl,
    smartLoopPickingMode,
    openSmartPicker,
    cancelSmartLoopPicking,
    onSmartLoopConfirm,
  } = useSmartLoop(editingFlow, _onSmartLoopConfirmLoop)

  // ── Wrappers ──────────────────────────────────────────────────────

  /** ElementPickerModal 选中元素后 → 打开 ActionPickerModal（或直接创建 element_branch 步骤） */
  function onElementPicked(el: SerializedElement) {
    if (es.addingElementBranch) {
      es.addingElementBranch = false
      showPickerModal.value = false
      if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
      if (!editingFlow.value) return
      editingFlow.value.steps.push({
        id:           `step_${Date.now()}`,
        type:         'element_branch',
        label:        `元素分支：${el.label || el.selector.cssSelector.slice(0, 30)}`,
        selector:     el.selector,
        children:     [],
        elseChildren: [],
      })
      return
    }
    _onElementPickedBase(el, getLoopChildActionOpts, showPickerModal, pickMode, () => bridge.cancelPickElement())
  }

  /** ActionPickerModal 点击「换元素」 → 保留动作状态，重新打开元素选择器 */
  function onActionRePick(type: ActionType, value: string | undefined) {
    _onActionRePickBase(type, value, showPickerModal, pickedCssSelector)
  }

  function openPicker() {
    if (!editingFlow.value) { alert('请先打开一个流程'); return }
    requireTab(() => {
      pickedCssSelector.value = ''
      showPickerModal.value = true
      scanDom()
    })
  }

  /** 添加元素分支步骤：打开选择器，选完元素后直接创建 element_branch（不进 ActionPickerModal） */
  function addElementBranch() {
    if (!editingFlow.value) { alert('请先打开一个流程'); return }
    requireTab(() => {
      es.addingElementBranch = true
      pickedCssSelector.value = ''
      showPickerModal.value = true
      scanDom()
    })
  }

  function closePicker() {
    showPickerModal.value = false
    pickedCssSelector.value = ''
    if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
  }

  /** EditLoopModal "添加操作" wrapper */
  function onLoopAddChild(currentState: FlowStep) {
    _onLoopAddChildRaw(currentState, () => { showPickerModal.value = true })
  }

  /** EditLoopModal 编辑子步骤 wrapper（支持条件类型，需传入 openConditionModal） */
  function onLoopEditChild(childIdx: number, currentState: FlowStep, openConditionModal?: () => void) {
    _onLoopEditChildRaw(childIdx, currentState, openConditionModal)
  }

  /** EditLoopModal "添加条件" wrapper（需传入 openConditionModal） */
  function onLoopAddCondition(currentState: FlowStep, openConditionModal: () => void) {
    _onLoopAddConditionRaw(currentState, openConditionModal)
  }

  /** 分支内添加元素 wrapper */
  function onLoopAddBranchChild(condChildId: string, branch: 'if' | 'else', currentState: FlowStep) {
    _onLoopAddBranchChildRaw(condChildId, branch, currentState, () => { showPickerModal.value = true })
  }

  /** 分支内添加条件 wrapper（需传入 openConditionModal） */
  function onLoopAddBranchCondition(
    condChildId: string,
    branch: 'if' | 'else',
    currentState: FlowStep,
    openConditionModal: () => void,
  ) {
    _onLoopAddBranchConditionRaw(condChildId, branch, currentState, openConditionModal)
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
    editingLoopStepIdx, reselectingLoopChild,
    editLoopStep, onLoopSave, onLoopClose, onLoopReselect, onLoopReselectChild,
    // useStepEditor
    editStep, cancelActionModal, onActionConfirm, editBranchStep,
    // useSmartLoop
    showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl, smartLoopPickingMode,
    openSmartPicker, cancelSmartLoopPicking, onSmartLoopConfirm,
    // Wrappers
    onElementPicked, onActionRePick, openPicker, closePicker,
    onLoopAddChild, onLoopEditChild, onActionTry, onTestAction,
    // 循环嵌入流程
    showLoopCallFlowPicker, onLoopAddCallFlow, onLoopConfirmCallFlow,
    // 新增：循环内条件 / 延迟 / 分支
    onLoopAddCondition, onLoopAddDelay,
    onLoopAddBranchChild, onLoopAddBranchCallFlow, onLoopAddBranchCondition, onLoopEditBranchChild,
    // element_branch
    addElementBranch,
  }
}
