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
  onSmartLoopConfirm: (candidate: RepeatingCandidate) => void
  onSmartLoopCancel: () => void
  onLoopSave: (editedStep: FlowStep) => void
  onLoopClose: () => void
  onLoopReselect: (currentState: FlowStep) => void
  onLoopTargetReselect: (currentState: FlowStep, actionIdx?: number) => void
  onLoopActionConfigure: (currentState: FlowStep, actionIdx: number) => void
  onActionConfirm: (step: FlowStep) => void
  onActionTry: (step: FlowStep) => void
  onActionRePick: (type: ActionType, value: string | undefined) => void
  cancelActionModal: () => void
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
