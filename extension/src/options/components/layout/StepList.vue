<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, provide } from 'vue'
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
import DropdownMenu from '@shared/components/DropdownMenu.vue'
import StepCard from './StepCard.vue'
import StepEditorModals from './StepEditorModals.vue'
import { STEP_EDITOR_MODALS_KEY } from './stepEditorContext'

const props = defineProps<{
  running:  boolean
  stopping: boolean
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
  editLoopStep, onLoopSave, onLoopClose, onLoopReselect, onLoopReselectChild,
  onLoopEditChild:           _onLoopEditChildRaw,
  editStep, cancelActionModal, onActionConfirm, editBranchStep,
  showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl,
  openSmartPicker, onSmartLoopConfirm,
  onElementPicked, onActionRePick, openPicker, closePicker,
  onLoopAddChild, onActionTry, onTestAction,
  showLoopCallFlowPicker, onLoopAddCallFlow, onLoopConfirmCallFlow,
  onLoopAddCondition:        _onLoopAddConditionRaw,
  onLoopAddDelay,
  onLoopAddBranchChild,
  onLoopAddBranchCallFlow,
  onLoopAddBranchCondition:  _onLoopAddBranchConditionRaw,
  onLoopEditBranchChild,
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

// 循环条件相关包装器（注入 showConditionModal 开启回调）
function loopOpenCondition() { showConditionModal.value = true }
function onLoopEditChild(childIdx: number, currentState: FlowStep) {
  _onLoopEditChildRaw(childIdx, currentState, loopOpenCondition)
}
function onLoopAddCondition(currentState: FlowStep) {
  _onLoopAddConditionRaw(currentState, loopOpenCondition)
}
function onLoopAddBranchCondition(condChildId: string, branch: 'if' | 'else', currentState: FlowStep) {
  _onLoopAddBranchConditionRaw(condChildId, branch, currentState, loopOpenCondition)
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

provide(STEP_EDITOR_MODALS_KEY, {
  // useDomPicker
  domTree, domFilter, domScanning, domMutated, domTabTitle,
  pickMode, pickedCssSelector, scanDom, togglePickMode,
  // usePickerOrchestrator
  showPickerModal, closePicker, onElementPicked, onTestAction,
  showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl, onSmartLoopConfirm,
  onLoopSave, onLoopClose, onLoopReselect, onLoopReselectChild,
  onLoopEditChild, onLoopAddChild, onLoopAddCallFlow,
  onLoopAddCondition, onLoopAddDelay,
  onLoopAddBranchChild, onLoopAddBranchCallFlow, onLoopAddBranchCondition, onLoopEditBranchChild,
  onActionConfirm, onActionTry, onActionRePick, cancelActionModal,
  showLoopCallFlowPicker, onLoopCallFlowConfirm,
  // useConditionEditor
  showConditionModal, conditionModalStep, conditionModalIdx, conditionAvailableVars, onConditionConfirm,
  // useFlowEditor
  showSettingsModal, onSettingsConfirm, saveToast,
  // useStepActions
  showCallFlowPicker, confirmCallFlow, showDelayModal, delayEditTarget, onDelayConfirm,
})
</script>

<template>
  <template v-if="editingFlow">
    <FlowEditorHeader
      :flow="editingFlow"
      :estimated-time="estimatedFlowTime"
      :running="running"
      :stopping="stopping"
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
          <BaseButton variant="ghost" class="dm-item" @click="openPicker(); close()">🖱 选择元素</BaseButton>
          <BaseButton variant="ghost" class="dm-item" @click="requireTab(openSmartPicker); close()">🔁 依次点击列表项</BaseButton>
          <BaseButton variant="ghost" class="dm-item" @click="addConditionStep(); close()">🔀 条件判断</BaseButton>
          <BaseButton variant="ghost" class="dm-item" @click="addCallFlowStep(); close()">▶ 嵌入流程</BaseButton>
          <BaseButton variant="ghost" class="dm-item" @click="addDelayStep(); close()">⏱ 等待</BaseButton>
        </template>
      </DropdownMenu>
    </div>
  </template>
  <div v-else class="editor__placeholder">
    <div class="editor__placeholder-icon">📋</div>
    <div>在左侧选择或新建一个流程以开始编辑</div>
  </div>

  <StepEditorModals />
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


</style>
