import { ref, watch } from 'vue'
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
  activeTabId: Ref<number | null>,
  requireTab: (cb: () => void) => void,
  pickedCssSelector: Ref<string>,
  pickMode: Ref<boolean>,
  scanDom: (scope?: string) => void,
  domScanning: Ref<boolean>,
  scopeCanonicalSelector: Ref<string | undefined>,
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
  } = useLoopEditor(editingFlow, scanDom, pickedCssSelector, scopeCanonicalSelector)

  // ── useStepEditor ─────────────────────────────────────────────────
  const {
    onElementPicked: _onElementPickedBase,
    editStep,
    onActionRePick: _onActionRePickBase,
    cancelActionModal,
    onActionConfirm: _onActionConfirmBase,
    editBranchStep,
  } = useStepEditor(editingFlow)

  // ── useSmartLoop（传入 wrapper：确认后触发 scoped 扫描）─────────────────
  const _onSmartLoopConfirmedAndScan = (candidate: import('@shared/types/message').RepeatingCandidate) => {
    _onSmartLoopConfirmLoop(candidate)  // 创建 loop_items 步骤
    // 进入构建模式，标记"接下来的元素选择是给循环加子步骤"
    es.buildingLoopChildren = true
    es.addingToLoopChild    = true
    scanDom(candidate.itemSelector)
  }

  // ── useSmartLoop ──────────────────────────────────────────────────
  const {
    showSmartLoopModal,
    smartLoopCandidates,
    smartLoopPickedEl,
    onSmartLoopConfirm,
  } = useSmartLoop(editingFlow, _onSmartLoopConfirmedAndScan)

  // ── Smart Loop 模式标志 ───────────────────────────────────────────
  const smartLoopMode = ref(false)

  // ── Scoped 扫描完成后自动打开选择器（构建模式） ──────────────────────
  watch([domScanning, () => es.buildingLoopChildren], ([scanning, building]) => {
    if (!scanning && building) {
      showPickerModal.value = true
    }
  })

  // ── 构建模式下 ActionPickerModal 确认后回到选择器 ────────────────────
  function onActionConfirm(step: FlowStep) {
    _onActionConfirmBase(step)
    if (es.buildingLoopChildren && es.editingLoopStep) {
      // onActionConfirm 内部会清掉 addingToLoopChild，这里重新设上以便继续添加子步骤
      es.addingToLoopChild = true
      showPickerModal.value = true
    }
  }

  // ── Wrappers ──────────────────────────────────────────────────────

  /** ElementPickerModal 选中元素后 → 打开 ActionPickerModal（或直接创建 element_branch 步骤） */
  function onElementPicked(el: SerializedElement) {
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
    _onElementPickedBase(el, getLoopChildActionOpts, showPickerModal, pickMode, () => bridge.cancelPickElement())
  }

  /** ActionPickerModal 点击「换元素」 → 保留动作状态，重新打开元素选择器 */
  function onActionRePick(type: ActionType, value: string | undefined) {
    _onActionRePickBase(type, value, showPickerModal, pickedCssSelector)
  }

  async function openPicker() {
    if (!editingFlow.value) { await showAlert('请先打开一个流程'); return }
    requireTab(() => {
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
    showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl,
    openSmartLoopPicker, onSmartLoopConfirm,
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
