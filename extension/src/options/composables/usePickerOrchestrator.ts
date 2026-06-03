import { ref } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep, ActionType } from '@shared/types/flow'
import type { SerializedElement } from '@shared/types/dom'
import { useExtensionBridge } from './useExtensionBridge'
import { useLoopEditor } from './useLoopEditor'
import { useStepEditor } from './useStepEditor'
import { useSmartLoop } from './useSmartLoop'

type Bridge = ReturnType<typeof useExtensionBridge>

export function usePickerOrchestrator(
  bridge: Bridge,
  editingFlow: Ref<LocalFlow | null>,
  activeTabId: Ref<number | null>,
  requireTab: (cb: () => void) => void,
  pickedCssSelector: Ref<string>,
  pickMode: Ref<boolean>,
  scanDom: () => void,
) {
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
    onLoopAddChild: _onLoopAddChildRaw,
    onLoopEditChild,
    onSmartLoopConfirm: _onSmartLoopConfirmLoop,
    getLoopChildActionOpts,
    showLoopCallFlowPicker,
    onLoopAddCallFlow,
    onLoopConfirmCallFlow,
  } = useLoopEditor(editingFlow, bridge, scanDom, pickedCssSelector)

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
  } = useSmartLoop(bridge, activeTabId, editingFlow, _onSmartLoopConfirmLoop)

  // ── Wrappers ──────────────────────────────────────────────────────

  /** ElementPickerModal 选中元素后 → 打开 ActionPickerModal */
  function onElementPicked(el: SerializedElement) {
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

  function closePicker() {
    showPickerModal.value = false
    pickedCssSelector.value = ''
    if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
  }

  /** EditLoopModal "添加操作" wrapper */
  function onLoopAddChild(currentState: FlowStep) {
    _onLoopAddChildRaw(currentState, () => { showPickerModal.value = true })
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
    editLoopStep, onLoopSave, onLoopClose, onLoopReselect, onLoopReselectChild, onLoopEditChild,
    // useStepEditor
    editStep, cancelActionModal, onActionConfirm, editBranchStep,
    // useSmartLoop
    showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl, smartLoopPickingMode,
    openSmartPicker, cancelSmartLoopPicking, onSmartLoopConfirm,
    // Wrappers
    onElementPicked, onActionRePick, openPicker, closePicker,
    onLoopAddChild, onActionTry, onTestAction,
    // 循环嵌入流程
    showLoopCallFlowPicker, onLoopAddCallFlow, onLoopConfirmCallFlow,
  }
}
