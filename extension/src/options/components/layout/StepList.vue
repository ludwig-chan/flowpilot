<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted } from 'vue'
import type { FlowStep } from '@shared/types/flow'
import type { BridgeEvent } from '../../composables/useExtensionBridge'
import { useEditorStore } from '../../stores/useEditorStore'
import { useFlowStore } from '../../stores/useFlowStore'
import { useTabStore } from '../../stores/useTabStore'
import { useBridge } from '../../composables/useBridge'
import { useDomPicker } from '../../composables/useDomPicker'
import { usePickerOrchestrator } from '../../composables/usePickerOrchestrator'
import { useFlowEditor } from '../../composables/useFlowEditor'
import { useStepActions, stepTypeLabels } from '../../composables/useStepActions'
import { useConditionEditor } from '../../composables/useConditionEditor'
import { useStepDrag } from '../../composables/useStepDrag'
import FlowEditorHeader from './FlowEditorHeader.vue'
import ElementPickerModal from '../element-picker/ElementPickerModal.vue'
import ActionPickerModal from '../step-editor/ActionPickerModal.vue'
import EditLoopModal from '../step-editor/EditLoopModal.vue'
import ConditionPickerModal from '../step-editor/ConditionPickerModal.vue'
import FlowSettingsModal from './FlowSettingsModal.vue'
import SmartLoopPickerModal from '../step-editor/SmartLoopPickerModal.vue'
import CallFlowPickerModal from '../step-editor/CallFlowPickerModal.vue'
import EditDelayModal from '../step-editor/EditDelayModal.vue'
import DropdownMenu from '@shared/components/DropdownMenu.vue'
import StepCard from './StepCard.vue'

const props = defineProps<{
  running: boolean
}>()

const emit = defineEmits<{
  (e: 'run'): void
  (e: 'stop'): void
}>()

const flowStore = useFlowStore()
const es        = useEditorStore()
const { editingFlow } = storeToRefs(es)

const tabStore = useTabStore()
const { activeTabId } = storeToRefs(tabStore)
const { requireTab } = tabStore

const bridge = useBridge()

const {
  saveToast,
  showSettingsModal, onSettingsConfirm,
  saveFlow, estimatedFlowTime,
} = useFlowEditor(flowStore, editingFlow)

const {
  domTree, domFilter, domScanning, domMutated, domTabTitle,
  pickMode, pickedCssSelector, scanDom, togglePickMode,
} = useDomPicker(activeTabId)

const {
  showPickerModal,
  editLoopStep, onLoopSave, onLoopClose, onLoopReselect, onLoopReselectChild, onLoopEditChild,
  editStep, cancelActionModal, onActionConfirm, editBranchStep,
  showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl, smartLoopPickingMode,
  openSmartPicker, cancelSmartLoopPicking, onSmartLoopConfirm,
  onElementPicked, onActionRePick, openPicker, closePicker,
  onLoopAddChild, onActionTry, onTestAction,
  showLoopCallFlowPicker, onLoopAddCallFlow, onLoopConfirmCallFlow,
} = usePickerOrchestrator(editingFlow, activeTabId, requireTab, pickedCssSelector, pickMode, scanDom)

const {
  removeStep, addDelayStep, editDelayStep, onDelayConfirm,
  showDelayModal, delayEditTarget,
  selectedStepIds, toggleSelect, deleteSelected,
  showCallFlowPicker, addCallFlowStep, confirmCallFlow,
} = useStepActions(editingFlow, flowStore)

const {
  showConditionModal,
  conditionModalStep,
  conditionModalIdx,
  expandedConditions,
  conditionAvailableVars,
  addConditionStep,
  editConditionStep,
  onConditionConfirm,
  toggleConditionExpand,
  removeBranchStep,
  openBranchPicker,
} = useConditionEditor(editingFlow, openPicker)

const { dragSrcIdx, dragInsertIdx, onHandleMouseDown, onDragStart, onDragOver, onDrop, onDragEnd } = useStepDrag(editingFlow)

const validFlowIds = computed(() => new Set(flowStore.allFlows().map(f => f.id)))
function isBrokenRef(flowRef?: string) { return !!flowRef && !validFlowIds.value.has(flowRef) }

function onLoopCallFlowConfirm(id: string) {
  const name = flowStore.allFlows().find(f => f.id === id)?.name ?? id
  onLoopConfirmCallFlow(id, name)
}

function handleEdit(step: FlowStep, i: number) {
  if (step.type === 'condition')  return editConditionStep(step, i)
  if (step.type === 'delay')      return editDelayStep(step)
  if (step.type === 'loop_items') return editLoopStep(step, i)
  editStep(step, i)
}

const mutationHandler = (evt: BridgeEvent) => {
  if (evt.type === 'DOM_MUTATION' && showPickerModal.value && !domScanning.value) domMutated.value = true
}
onMounted(() => bridge.on(mutationHandler))
onUnmounted(() => bridge.off(mutationHandler))
</script>

<template>
  <template v-if="editingFlow">
    <FlowEditorHeader
      :flow="editingFlow"
      :estimated-time="estimatedFlowTime"
      :running="running"
      @save="saveFlow"
      @close="editingFlow = null"
      @open-settings="showSettingsModal = true"
      @run="$emit('run')"
      @stop="$emit('stop')"
    />
    <div class="step-list">
      <template v-for="(step, i) in editingFlow.steps" :key="step.id">
        <div
          class="step-insert-line"
          :class="{ 'step-insert-line--active': dragInsertIdx === i }"
          @dragover.prevent="dragInsertIdx = i"
          @drop="onDrop"
        />
        <StepCard
          :step="step"
          :index="i"
          :drag-src-idx="dragSrcIdx"
          :selected="selectedStepIds.includes(step.id)"
          :step-type-labels="stepTypeLabels"
          :expanded-conditions="expandedConditions"
          :is-broken-ref="isBrokenRef"
          @dragstart="onDragStart"
          @dragover="onDragOver"
          @drop="onDrop"
          @dragend="onDragEnd"
          @handle-mousedown="onHandleMouseDown"
          @toggle-select="toggleSelect"
          @edit="handleEdit"
          @remove="removeStep"
          @toggle-condition-expand="toggleConditionExpand"
          @edit-branch="editBranchStep"
          @remove-branch="removeBranchStep"
          @open-picker="openBranchPicker"
        />
      </template>
      <div
        class="step-insert-line"
        :class="{ 'step-insert-line--active': dragInsertIdx === editingFlow.steps.length }"
        @dragover.prevent="dragInsertIdx = editingFlow.steps.length"
        @drop="onDrop"
      />
      <div v-if="editingFlow.steps.length === 0" class="empty-hint">点击下方按鈕添加步骤</div>
    </div>

    <div class="step-add-toolbar">
      <BaseButton
        v-if="selectedStepIds.length > 0"
        variant="danger"
        size="sm"
        @click="deleteSelected"
      >🗑 删除已选 ({{ selectedStepIds.length }})</BaseButton>
      <DropdownMenu>
        <template #trigger="{ toggle, isOpen }">
          <BaseButton size="sm" variant="primary" @click="toggle">＋ 添加步骤 {{ isOpen ? '▴' : '▾' }}</BaseButton>
        </template>
        <template #default="{ close }">
          <button class="dm-item" @click="openPicker(); close()">🖱 选择元素</button>
          <button class="dm-item" @click="requireTab(openSmartPicker); close()">🔁 依次点击列表项</button>
          <button class="dm-item" @click="addConditionStep(); close()">🔀 条件判断</button>
          <button class="dm-item" @click="addCallFlowStep(); close()">▶ 嵌入流程</button>
          <button class="dm-item" @click="addDelayStep(); close()">⏱ 等待</button>
        </template>
      </DropdownMenu>
    </div>
  </template>
  <div v-else class="editor__placeholder">
    <div class="editor__placeholder-icon">📋</div>
    <div>在左侧选择或新建一个流程以开始编辑</div>
  </div>

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
      v-if="showSmartLoopModal && smartLoopPickedEl"
      :candidates="smartLoopCandidates"
      :picked-element="smartLoopPickedEl!"
      @confirm="onSmartLoopConfirm"
      @cancel="showSmartLoopModal = false; bridge.clearLoopHighlights()"
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
      @reselect-child="onLoopReselectChild"
      @edit-child="onLoopEditChild"
      @add-child="onLoopAddChild"
      @add-call-flow="onLoopAddCallFlow"
    />

    <!-- 条件配置模态框 -->
    <ConditionPickerModal
      v-if="showConditionModal"
      :initial-label="conditionModalStep?.label"
      :initial-mode="conditionModalStep?.selector ? 'elem' : 'expr'"
      :initial-value="conditionModalStep?.value"
      :initial-selector="conditionModalStep?.selector?.cssSelector"
      :available-vars="conditionAvailableVars"
      :dom-tree="domTree"
      :dom-filter="domFilter"
      :dom-scanning="domScanning"
      :dom-mutated="domMutated"
      :dom-tab-title="domTabTitle"
      :pick-mode="pickMode"
      :picked-css-selector="pickedCssSelector"
      @close="showConditionModal = false; conditionModalStep = null; conditionModalIdx = null"
      @confirm="onConditionConfirm"
      @scan="scanDom"
      @toggle-pick="togglePickMode"
      @test-action="onTestAction"
      @hover="(css: string) => bridge.requestHighlight(css)"
      @update:dom-filter="domFilter = $event"
    />

    <!-- 动作选择模态框 -->
    <ActionPickerModal
      v-if="es.showActionModal && es.actionModalEl"
      :element="es.actionModalEl!"
      :override-sel="es.actionModalOverrideSel"
      :is-relative="es.actionModalIsRelative"
      :initial-type="es.editingInitialType"
      :initial-value="es.editingInitialValue"
      :initial-wait-timeout="es.editingInitialWaitTimeout"
      :initial-found-delay="es.editingInitialFoundDelay"
      :initial-label="es.editingInitialLabel"
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

    <!-- 嵌入流程选择（循环子步骤） -->
    <CallFlowPickerModal
      v-if="showLoopCallFlowPicker"
      :flows="flowStore.allFlows().filter(f => f.id !== editingFlow?.id)"
      @confirm="onLoopCallFlowConfirm"
      @cancel="showLoopCallFlowPicker = false"
    />

    <!-- 嵌入流程选择 -->
    <CallFlowPickerModal
      v-if="showCallFlowPicker"
      :flows="flowStore.allFlows().filter(f => f.id !== editingFlow?.id)"
      @confirm="confirmCallFlow"
      @cancel="showCallFlowPicker = false"
    />

    <!-- 等待步骤编辑弹窗 -->
    <EditDelayModal
      v-if="showDelayModal"
      :initial-ms="delayEditTarget ? Number(delayEditTarget.value) : undefined"
      @confirm="onDelayConfirm"
      @cancel="showDelayModal = false"
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
.editor__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: #6c7086;
}
.editor__placeholder-icon { font-size: 48px; }

.step-list { display: flex; flex-direction: column; }
.step-insert-line { height: 3px; border-radius: 2px; margin: 1px 0; transition: background 0.1s; }
.step-insert-line--active { background: #89b4fa; box-shadow: 0 0 6px #89b4fa88; }

.step-add-toolbar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  padding: 10px 0 2px;
  border-top: 1px solid #313244;
  margin-top: 8px;
  background: #1e1e2e;
  display: flex;
  justify-content: flex-end;
}
.step-add-btn { flex: 1; min-width: 90px; justify-content: center; }

.dm-item {
  background: none;
  border: none;
  color: #cdd6f4;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 4px;
  text-align: left;
  font-size: 12px;
  white-space: nowrap;
  width: 100%;
  &:hover { background: #313244; }
}

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
