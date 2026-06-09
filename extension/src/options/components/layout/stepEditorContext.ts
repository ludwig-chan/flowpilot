import type { InjectionKey, Ref, ComputedRef } from 'vue'
import type { FlowStep, ActionType, StepDelayLevel, FlowTrigger } from '@shared/types/flow'
import type { SerializedDomNode, SerializedElement } from '@shared/types/dom'
import type { RepeatingCandidate } from '@shared/types/message'

export interface StepEditorModalContext {
  // ── useDomPicker ─────────────────────────────────────────────────
  domTree: Ref<SerializedDomNode[]>
  domFilter: Ref<string>
  domScanning: Ref<boolean>
  domMutated: Ref<boolean>
  domTabTitle: Ref<string>
  pickMode: Ref<boolean>
  pickedCssSelector: Ref<string>
  scanDom: () => void
  togglePickMode: () => void
  // ── usePickerOrchestrator ────────────────────────────────────────
  showPickerModal: Ref<boolean>
  closePicker: () => void
  onElementPicked: (el: SerializedElement) => void
  onTestAction: (css: string, actionType: string, value?: string) => void
  showSmartLoopModal: Ref<boolean>
  smartLoopCandidates: Ref<RepeatingCandidate[]>
  smartLoopPickedEl: Ref<SerializedElement | null>
  onSmartLoopConfirm: (candidate: RepeatingCandidate) => void
  onLoopSave: (editedStep: FlowStep) => void
  onLoopClose: () => void
  onLoopReselect: (currentState: FlowStep) => void
  onLoopEditChild:         (childIdx: number, currentState: FlowStep) => void
  onLoopAddChild:          (currentState: FlowStep) => void
  onLoopAddCallFlow:       (currentState: FlowStep) => void
  onLoopAddCondition:      (currentState: FlowStep) => void
  onLoopAddDelay:          (currentState: FlowStep) => void
  onLoopAddBranchChild:    (condChildId: string, branch: 'if' | 'else', currentState: FlowStep) => void
  onLoopAddBranchCallFlow: (condChildId: string, branch: 'if' | 'else', currentState: FlowStep) => void
  onLoopAddBranchCondition:(condChildId: string, branch: 'if' | 'else', currentState: FlowStep) => void
  onLoopEditBranchChild:   (condChildId: string, branch: 'if' | 'else', childIdx: number, currentState: FlowStep) => void
  onActionConfirm: (step: FlowStep) => void
  onActionTry: (step: FlowStep) => void
  onActionRePick: (type: ActionType, value: string | undefined) => void
  cancelActionModal: () => void
  showLoopCallFlowPicker: Ref<boolean>
  onLoopCallFlowConfirm: (id: string) => void
  // ── useConditionEditor ────────────────────────────────────────────
  showConditionModal: Ref<boolean>
  conditionModalStep: Ref<FlowStep | null>
  conditionModalIdx: Ref<number | null>
  conditionAvailableVars: ComputedRef<string[]>
  onConditionConfirm: (data: { label: string; conditions: import('@shared/types/flow').ConditionItem[]; logic: import('@shared/types/flow').ConditionLogic }) => void
  // ── useFlowEditor ─────────────────────────────────────────────────
  showSettingsModal: Ref<boolean>
  onSettingsConfirm: (data: { waitTimeout: number; stepDelayLevel: StepDelayLevel; stepDelayRange: [number, number] | undefined; trigger: FlowTrigger | undefined }) => void
  saveToast: Ref<boolean>
  // ── useStepActions ─────────────────────────────────────────────────
  showCallFlowPicker: Ref<boolean>
  confirmCallFlow: (id: string) => void
  showDelayModal: Ref<boolean>
  delayEditTarget: Ref<FlowStep | null>
  onDelayConfirm: (ms: number) => void
}

export const STEP_EDITOR_MODALS_KEY: InjectionKey<StepEditorModalContext> = Symbol('stepEditorModals')
