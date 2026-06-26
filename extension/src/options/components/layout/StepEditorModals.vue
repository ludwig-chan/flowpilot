<script setup lang="ts">
import { inject } from 'vue'
import { storeToRefs } from 'pinia'
import { useEditorStore } from '../../stores/useEditorStore'
import { useFlowStore } from '../../stores/useFlowStore'
import { useBridge } from '../../composables/useBridge'
import ElementPickerModal from '../element-picker/ElementPickerModal.vue'
import ActionPickerModal from '../step-editor/ActionPickerModal.vue'
import EditLoopModal from '../step-editor/EditLoopModal.vue'
import ConditionPickerModal from '../step-editor/ConditionPickerModal.vue'
import FlowSettingsModal from './FlowSettingsModal.vue'
import SmartLoopPickerModal from '../step-editor/SmartLoopPickerModal.vue'
import CallFlowPickerModal from '../step-editor/CallFlowPickerModal.vue'
import EditDelayModal from '../step-editor/EditDelayModal.vue'
import SaveDataModal from '../step-editor/SaveDataModal.vue'
import { STEP_EDITOR_MODALS_KEY } from './stepEditorContext'

const es = useEditorStore()
const flowStore = useFlowStore()
const bridge = useBridge()
const { editingFlow } = storeToRefs(es)

const ctx = inject(STEP_EDITOR_MODALS_KEY)!
const {
  domTree, domFilter, domScanning, domMutated, domTabTitle,
  pickMode, pickedCssSelector, scanDom, togglePickMode,
  showPickerModal, closePicker, onElementPicked, onTestAction,
  showSmartLoopModal, smartLoopCandidates, onSmartLoopConfirm, onSmartLoopCancel,
  onLoopSave, onLoopClose, onLoopReselect, onLoopTargetReselect, onLoopActionConfigure,
  onLoopAddCallFlow, showLoopCallFlowPicker, confirmLoopCallFlow,
  onActionConfirm, onActionTry, onActionRePick, cancelActionModal,
  showConditionModal, conditionModalStep, conditionModalIdx, conditionAvailableVars, onConditionConfirm,
  showSettingsModal, onSettingsConfirm, saveToast,
  showCallFlowPicker, confirmCallFlow, showDelayModal, delayEditTarget, onDelayConfirm,
  showSaveDataModal, saveDataEditTarget, onSaveDataConfirm, saveDataAvailableVars,
} = ctx

function onCloseConditionModal() {
  showConditionModal.value = false
  conditionModalStep.value = null
  conditionModalIdx.value = null
}

function onCancelSmartLoop() {
  onSmartLoopCancel()
}

</script>

<template>
  <Teleport to="body">
    <!-- 元素选择器模态框 -->
    <ElementPickerModal
      v-if="showPickerModal"
      :dom-tree="domTree"
      :dom-filter="domFilter"
      :dom-scanning="domScanning"
      :dom-mutated="domMutated"
      :dom-tab-title="domTabTitle"
      :pick-mode="pickMode"
      :picked-css-selector="pickedCssSelector"
      @close="closePicker"
      @scan="scanDom"
      @toggle-pick="togglePickMode"
      @picked="onElementPicked"
      @test-click="(css: string) => bridge.testClick(css)"
      @test-action="onTestAction"
      @hover="(css: string) => bridge.requestHighlight(css)"
      @update:dom-filter="domFilter = $event"
    />

    <!-- 智能循环选择器模态框 -->
    <SmartLoopPickerModal
      v-if="showSmartLoopModal"
      :candidates="smartLoopCandidates"
      @confirm="onSmartLoopConfirm"
      @cancel="onCancelSmartLoop"
      @hover-candidate="(sel: string) => bridge.highlightLoopCandidates(sel)"
      @leave-candidate="bridge.clearLoopHighlights()"
    />

    <!-- 循环步骤编辑模态框 -->
    <EditLoopModal
      v-if="es.showEditLoopModal && es.editingLoopStep"
      :step="es.editingLoopStep"
      @save="onLoopSave"
      @close="onLoopClose"
      @reselect="onLoopReselect"
      @reselect-target="onLoopTargetReselect"
      @configure-action="onLoopActionConfigure"
      @add-call-flow="onLoopAddCallFlow"
    />

    <!-- 条件配置模态框 -->
    <ConditionPickerModal
      v-if="showConditionModal"
      :initial-label="conditionModalStep?.label"
      :initial-value="conditionModalStep?.value"
      :initial-conditions="conditionModalStep?.conditions"
      :initial-logic="conditionModalStep?.conditionLogic"
      :available-vars="conditionAvailableVars"
      @close="onCloseConditionModal"
      @confirm="onConditionConfirm"
    />

    <!-- 动作选择模态框 -->
    <ActionPickerModal
      v-if="es.showActionModal && es.actionModalEl"
      :element="es.actionModalEl!"
      :initial-type="es.editingInitialType"
      :initial-value="es.editingInitialValue"
      :initial-var-alias="es.editingInitialVarAlias"
      :initial-wait-timeout="es.editingInitialWaitTimeout"
      :initial-found-delay="es.editingInitialFoundDelay"
      :initial-label="es.editingInitialLabel"
      :initial-capture-download="es.editingInitialCaptureDownload"
      :initial-download-var-name="es.editingInitialDownloadVarName"
      :initial-download-wait-timeout="es.editingInitialDownloadWaitTimeout"
      :existing-steps="editingFlow?.steps ?? []"
      @confirm="onActionConfirm"
      @try="onActionTry"
      @re-pick="onActionRePick"
      @cancel="cancelActionModal"
    />

    <!-- 流程设置弹窗 -->
    <FlowSettingsModal
      v-if="showSettingsModal && editingFlow"
      :flow="editingFlow"
      @close="showSettingsModal = false"
      @confirm="onSettingsConfirm"
    />

    <!-- 嵌入流程选择 -->
    <CallFlowPickerModal
      v-if="showCallFlowPicker"
      :flows="flowStore.allFlows().filter(f => f.id !== editingFlow?.id)"
      @confirm="confirmCallFlow"
      @cancel="showCallFlowPicker = false"
    />

    <!-- 循环队列嵌入流程选择 -->
    <CallFlowPickerModal
      v-if="showLoopCallFlowPicker"
      :flows="flowStore.allFlows().filter(f => f.id !== editingFlow?.id)"
      @confirm="confirmLoopCallFlow"
      @cancel="showLoopCallFlowPicker = false; es.showEditLoopModal = true"
    />

    <!-- 等待步骤编辑弹窗 -->
    <EditDelayModal
      v-if="showDelayModal"
      :initial-ms="delayEditTarget ? Number(delayEditTarget.value) : undefined"
      @confirm="onDelayConfirm"
      @cancel="showDelayModal = false"
    />

    <!-- 保存数据步骤编辑弹窗 -->
    <SaveDataModal
      v-if="showSaveDataModal"
      :available-vars="saveDataAvailableVars"
      :initial-step="saveDataEditTarget"
      @confirm="onSaveDataConfirm"
      @cancel="showSaveDataModal = false"
    />
  </Teleport>

  <!-- 保存 Toast -->
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="saveToast" class="save-toast">✅ 已保存</div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.save-toast {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  background: #a6e3a1;
  color: #1e1e2e;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 20px;
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  pointer-events: none;
  z-index: 9999;
  white-space: nowrap;
}
.toast-enter-active { transition: opacity 0.2s, transform 0.2s; }
.toast-leave-active { transition: opacity 0.4s, transform 0.4s; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(8px); }
.toast-leave-to   { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
