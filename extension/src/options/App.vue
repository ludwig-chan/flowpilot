<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useFlowStore } from './stores/useFlowStore'
import { useExtensionBridge } from './composables/useExtensionBridge'
import { useDomPicker } from './composables/useDomPicker'
import { useFlowRunner } from './composables/useFlowRunner'
import { useResizable } from './composables/useResizable'
import { useStepDrag } from './composables/useStepDrag'
import { useConditionEditor } from './composables/useConditionEditor'
import { useEditorStore } from './stores/useEditorStore'
import { usePickerOrchestrator } from './composables/usePickerOrchestrator'
import { useTabManager } from './composables/useTabManager'
import { useFlowTreeActions } from './composables/useFlowTreeActions'
import FlowTreeNode from './components/flow-tree/FlowTreeNode.vue'
import LogPanel from './components/layout/LogPanel.vue'
import ElementPickerModal from './components/element-picker/ElementPickerModal.vue'
import ActionPickerModal from './components/step-editor/ActionPickerModal.vue'
import EditLoopModal from './components/step-editor/EditLoopModal.vue'
import ConditionPickerModal from './components/step-editor/ConditionPickerModal.vue'
import CreateNodeModal from './components/step-editor/CreateNodeModal.vue'
import EditNodeModal from './components/step-editor/EditNodeModal.vue'
import PresetsModal from './components/io/PresetsModal.vue'
import ExportModal from './components/io/ExportModal.vue'
import ImportModal from './components/io/ImportModal.vue'
import FlowSettingsModal from './components/layout/FlowSettingsModal.vue'
import TabPickerModal from './components/layout/TabPickerModal.vue'
import SmartLoopPickerModal from './components/step-editor/SmartLoopPickerModal.vue'
import ConditionBranchView from './components/step-editor/ConditionBranchView.vue'
import FlowEditorHeader from './components/layout/FlowEditorHeader.vue'
import CallFlowPickerModal from './components/step-editor/CallFlowPickerModal.vue'
import { useFlowIO } from './composables/useFlowIO'
import { useFlowEditor } from './composables/useFlowEditor'
import { useStepActions, stepTypeLabels } from './composables/useStepActions'
import BaseButton from '@shared/components/BaseButton.vue'
import DropdownMenu from '@shared/components/DropdownMenu.vue'

const flowStore = useFlowStore()
const bridge    = useExtensionBridge()

const {
  tabs, activeTabId, refreshTabs, selectTab,
  showTabPickerModal, requireTab, onTabPickerConfirm, cancelTabPicker,
} = useTabManager(bridge)

const {
  domTree, domFilter, domScanning, domMutated, domTabTitle,
  pickMode, pickedCssSelector, scanDom, togglePickMode,
} = useDomPicker(bridge, activeTabId)

// ── Editor Store ──────────────────────────────────────────────────
const es = useEditorStore()
const { editingFlow } = storeToRefs(es)

const {
  showCreateModal, createModalInitParentId,
  openCreateModal, onConfirmCreate,
  deleteFlowOrFolder,
  showEditModal, editingNodeId, editingNodeName, editingNodeKind, editingNodeParentId,
  handleEdit, onConfirmEdit,
} = useFlowTreeActions(flowStore, editingFlow)

const {
  saveToast, selectDelayLevel,
  showSettingsModal, onSettingsConfirm,
  saveFlow, estimatedFlowTime,
} = useFlowEditor(flowStore, editingFlow)

const {
  showPickerModal,
  editingLoopStepIdx, reselectingLoopChild,
  editLoopStep, onLoopSave, onLoopClose, onLoopReselect, onLoopReselectChild, onLoopEditChild,
  editStep, cancelActionModal, onActionConfirm, editBranchStep,
  showSmartLoopModal, smartLoopCandidates, smartLoopPickedEl, smartLoopPickingMode,
  openSmartPicker, cancelSmartLoopPicking, onSmartLoopConfirm,
  onElementPicked, onActionRePick, openPicker, closePicker,
  onLoopAddChild, onActionTry, onTestAction,
} = usePickerOrchestrator(bridge, editingFlow, activeTabId, requireTab, pickedCssSelector, pickMode, scanDom)




const {
  removeStep, addDelayStep, editDelayStep,
  selectedStepIds, toggleSelect, deleteSelected,
  showCallFlowPicker, addCallFlowStep, confirmCallFlow,
} = useStepActions(editingFlow, flowStore)

// ── useConditionEditor ────────────────────────────────────────────
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

const {
  showExportModal, handleExportSelected,
  showImportModal, handleImportConfirm,
  showPresetsModal, onInstallPreset,
  BUILTIN_PRESETS,
} = useFlowIO(flowStore)

// ── 步骤拖拽排序 ──────────────────────────────────────────────────
const { dragSrcIdx, dragInsertIdx, onHandleMouseDown, onDragStart, onDragOver, onDrop, onDragEnd } = useStepDrag(editingFlow)

// Run
const { logs, running, logDrawerOpen, runCurrentFlow, stopCurrentFlow } = useFlowRunner(bridge, editingFlow, activeTabId)

// Bridge events（DOM_SCAN_RESULT/ELEMENT_PICKED → useDomPicker；FLOW_LOG/DONE/ERROR → useFlowRunner；SMART_LOOP_ANALYZED → useSmartLoop）
bridge.on((evt) => {
  if (evt.type === 'DOM_MUTATION' && showPickerModal.value && !domScanning.value) domMutated.value = true
})

onMounted(async () => {
  await flowStore.load()
  await refreshTabs()
})

// ── 侧边栏 & 日志抽屉拖拽调整 ──────────────────────────────────────
const { sidebarWidth, logDrawerHeight, startResize, startLogResize } = useResizable()

</script>

<template>
  <div class="app">
    <header class="app__header">
      <div class="app__logo">⚡ FlowPilot</div>
      <div class="app__tab-selector">
        <select class="tab-select" :value="activeTabId ?? ''"
          @change="e => selectTab(Number((e.target as HTMLSelectElement).value))">
          <option value="" disabled>选择目标 Tab…</option>
          <option v-for="tab in tabs" :key="tab.id" :value="tab.id">{{ tab.title?.slice(0, 60) ?? tab.url }}</option>
        </select>
        <BaseButton variant="ghost" @click="refreshTabs">↻</BaseButton>
      </div>
      <div class="app__actions">
        <BaseButton
          :variant="running ? 'danger' : 'primary'"
          @click="running ? stopCurrentFlow() : requireTab(runCurrentFlow)"
        >{{ running ? '⏹ 停止' : '▶ 运行' }}</BaseButton>
      </div>
    </header>

    <div class="app__body">
      <aside class="app__aside" :style="{ width: sidebarWidth + 'px' }">
        <div class="panel">
          <div class="panel__toolbar">
            <span class="panel__title">已保存流程</span>
            <BaseButton
              v-if="BUILTIN_PRESETS.length > 0"
              size="sm"
              title="浏览内置预设库"
              @click="showPresetsModal = true"
            >📦 预设</BaseButton>
            <BaseButton size="sm" title="导入流程" @click="showImportModal = true">📥 导入</BaseButton>
            <BaseButton size="sm" title="导出流程" @click="showExportModal = true">📤 导出</BaseButton>
            <BaseButton size="sm" variant="primary" @click="openCreateModal()">&#xFF0B; 新增</BaseButton>
          </div>

          <div class="flow-list">
            <FlowTreeNode
              :nodes="flowStore.tree"
              :active-flow-id="editingFlow?.id"
              @open="es.openFlow"
              @delete="deleteFlowOrFolder"
              @create-in="(id: string) => openCreateModal(id)"
              @edit="handleEdit"
              @pin="(id: string) => flowStore.togglePin(id)"
            />
            <div v-if="flowStore.tree.length === 0 && !creating" class="empty-hint">暂无流程，点击“＋ 新增”创建</div>
          </div>
        </div>
      </aside>

      <div class="resize-handle" @mousedown="startResize"></div>

      <main class="app__main">
        <template v-if="editingFlow">
          <FlowEditorHeader
            :flow="editingFlow"
            :estimated-time="estimatedFlowTime"
            @save="saveFlow"
            @close="editingFlow = null"
            @open-settings="showSettingsModal = true"
          />
          <div class="step-list">
            <template v-for="(step, i) in editingFlow.steps" :key="step.id">
              <div class="step-insert-line" :class="{ 'step-insert-line--active': dragInsertIdx === i }" @dragover.prevent="dragInsertIdx = i" @drop="onDrop" />
              <div
                class="step-card"
                :class="{ 'step-card--dragging': dragSrcIdx === i }"
                draggable="true"
                @dragstart="onDragStart($event, i)"
                @dragover.stop="onDragOver($event, i)"
                @drop.stop="onDrop"
                @dragend="onDragEnd"
              >
                <div
                  class="step-card__handle"
                  :class="{ 'step-card__handle--grabbing': dragSrcIdx === i }"
                  @mousedown="onHandleMouseDown"
                >⋮⋮</div>
                <input
                  type="checkbox"
                  class="step-card__check"
                  :checked="selectedStepIds.includes(step.id)"
                  @change="toggleSelect(step.id)"
                />
                <div class="step-card__body">
                  <div class="step-card__label">{{ step.label }}</div>
                  <div class="step-card__type">{{ stepTypeLabels[step.type] ?? step.type }}</div>
                  <button
                    v-if="step.type === 'condition'"
                    class="step-card__cond-toggle"
                    @click.stop="toggleConditionExpand(step.id)"
                  >
                    {{ expandedConditions.has(step.id) ? '▲ 收起' : '▼ 展开分支' }}
                    <span class="step-card__cond-count">(IF:{{ step.children?.length ?? 0 }} | ELSE:{{ step.elseChildren?.length ?? 0 }})</span>
                  </button>
                </div>
                <div class="step-card__actions">
                  <button
                    v-if="step.type !== 'call_flow' && (step.type === 'condition' || step.type === 'delay' || step.type === 'loop_items' || !!step.selector)"
                    class="step-card__btn step-card__btn--edit"
                    title="编辑步骤"
                    @click="step.type === 'condition' ? editConditionStep(step, i) : step.type === 'delay' ? editDelayStep(step) : step.type === 'loop_items' ? editLoopStep(step, i) : editStep(step, i)"
                  >✎</button>
                  <button class="step-card__btn step-card__btn--del" @click="removeStep(i)">✖</button>
                </div>
              </div>
              <!-- 条件分支展开视图 -->
              <ConditionBranchView
                v-if="step.type === 'condition' && expandedConditions.has(step.id)"
                :step="step"
                :step-type-labels="stepTypeLabels"
                @edit-branch="(condId, branch, child, ci) => editBranchStep(condId, branch, child, ci)"
                @remove-branch="(condId, branch, ci) => removeBranchStep(condId, branch, ci)"
                @open-picker="(condId, branch) => openBranchPicker(condId, branch)"
              />
            </template>
            <div class="step-insert-line" :class="{ 'step-insert-line--active': dragInsertIdx === editingFlow.steps.length }" @dragover.prevent="dragInsertIdx = editingFlow.steps.length" @drop="onDrop" />
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
      </main>
    </div>

    <!-- 底部全局日志抽屉 -->
    <div class="log-drawer" :class="{ 'log-drawer--open': logDrawerOpen }">
      <div class="log-drawer__resize" v-if="logDrawerOpen" @mousedown.stop="startLogResize"></div>
      <div class="log-drawer__header" @click="logDrawerOpen = !logDrawerOpen">
        <span class="log-drawer__toggle">
          {{ logDrawerOpen ? '▼' : '▲' }} 运行日志
          <span v-if="running" class="log-drawer__running">● 运行中</span>
          <span v-else-if="logs.length > 0" class="log-drawer__count">（{{ logs.length }} 条）</span>
        </span>
        <template v-if="logDrawerOpen">
          <button class="log-drawer__action-btn" title="复制全部日志" @click.stop="() => navigator.clipboard.writeText(logs.join('\n'))">📋 复制</button>
          <button class="log-drawer__action-btn log-drawer__action-btn--danger" title="清空日志" @click.stop="logs = []">🗑 清空</button>
        </template>
      </div>
      <div v-if="logDrawerOpen" class="log-drawer__body" :style="{ height: logDrawerHeight + 'px' }">
        <LogPanel :logs="logs" :running="running" />
      </div>
    </div>

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

    <!-- 新增流程/目录弹窗 -->
    <CreateNodeModal
      v-if="showCreateModal"
      :tree="flowStore.tree"
      :initial-parent-id="createModalInitParentId"
      @confirm="onConfirmCreate"
      @cancel="showCreateModal = false"
    />

    <!-- 编辑节点弹窗 -->
    <EditNodeModal
      v-if="showEditModal"
      :node-id="editingNodeId"
      :node-name="editingNodeName"
      :node-kind="editingNodeKind"
      :current-parent-id="editingNodeParentId"
      :tree="flowStore.tree"
      @confirm="onConfirmEdit"
      @cancel="showEditModal = false"
    />

    <!-- 预设库弹窗 -->
    <PresetsModal
      v-if="showPresetsModal"
      @install="onInstallPreset"
      @close="showPresetsModal = false"
    />

    <!-- 导出弹窗 -->
    <ExportModal
      :visible="showExportModal"
      :tree="flowStore.tree"
      @export="handleExportSelected"
      @close="showExportModal = false"
    />

    <!-- 导入弹窗 -->
    <ImportModal
      :visible="showImportModal"
      :tree="flowStore.tree"
      @confirm="handleImportConfirm"
      @cancel="showImportModal = false"
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

    <!-- Tab 选择弹窗（在没有选中 tab 时就地拦截） -->
    <TabPickerModal
      v-if="showTabPickerModal"
      :tabs="tabs"
      @confirm="onTabPickerConfirm"
      @cancel="cancelTabPicker"
    />

  </div>

  <Transition name="toast">
    <div v-if="saveToast" class="save-toast">✅ 已保存</div>
  </Transition>

</template>

<style lang="scss" src="./styles/app.scss" />
