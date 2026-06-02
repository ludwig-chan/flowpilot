<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useFlowStore, type LocalFlow, type FlowFolder, type FlowNode, type ExportPayload } from './stores/useFlowStore'
import { useExtensionBridge } from './composables/useExtensionBridge'
import { useDomPicker } from './composables/useDomPicker'
import { useFlowRunner } from './composables/useFlowRunner'
import { useResizable } from './composables/useResizable'
import { useStepDrag } from './composables/useStepDrag'
import { useLoopEditor } from './composables/useLoopEditor'
import { useStepEditor } from './composables/useStepEditor'
import { useConditionEditor } from './composables/useConditionEditor'
import { useSmartLoop } from './composables/useSmartLoop'
import FlowTreeNode from './components/FlowTreeNode.vue'
import LogPanel from './components/LogPanel.vue'
import ElementPickerModal from './components/ElementPickerModal.vue'
import ActionPickerModal from './components/ActionPickerModal.vue'
import EditLoopModal from './components/EditLoopModal.vue'
import ConditionPickerModal from './components/ConditionPickerModal.vue'
import CreateNodeModal from './components/CreateNodeModal.vue'
import EditNodeModal from './components/EditNodeModal.vue'
import PresetsModal from './components/PresetsModal.vue'
import ExportModal from './components/ExportModal.vue'
import ImportModal from './components/ImportModal.vue'
import FlowSettingsModal from './components/FlowSettingsModal.vue'
import SmartLoopPickerModal from './components/SmartLoopPickerModal.vue'
import ConditionBranchView from './components/ConditionBranchView.vue'
import FlowEditorHeader from './components/FlowEditorHeader.vue'
import CallFlowPickerModal from './components/CallFlowPickerModal.vue'
import { filterNodesByIds } from './stores/useFlowStore'
import { BUILTIN_PRESETS, type BuiltinPreset } from '@/presets/index'
import type { SerializedElement } from '@shared/types/dom'
import type { FlowStep, StepDelayLevel, ActionType } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'

const DELAY_LEVELS: { value: StepDelayLevel; label: string; hint?: string }[] = [
  { value: 'none',   label: '无' },
  { value: 'low',    label: '低',   hint: `${STEP_DELAY_PRESETS.low[0]}~${STEP_DELAY_PRESETS.low[1]} ms` },
  { value: 'medium', label: '中',   hint: `${STEP_DELAY_PRESETS.medium[0]}~${STEP_DELAY_PRESETS.medium[1]} ms` },
  { value: 'high',   label: '高',   hint: `${STEP_DELAY_PRESETS.high[0]}~${STEP_DELAY_PRESETS.high[1]} ms` },
  { value: 'custom', label: '自定义' },
]

const flowStore = useFlowStore()
const bridge    = useExtensionBridge()

// 下拉菜单状态
const stepMenuOpen = ref(false)

function closeMenus() { stepMenuOpen.value = false }

// 新增弹窗
const showCreateModal         = ref(false)
const createModalInitParentId = ref<string | undefined>(undefined)

function openCreateModal(initialParentId?: string) {
  createModalInitParentId.value = initialParentId
  showCreateModal.value = true
}

async function onConfirmCreate(kind: 'flow' | 'folder', name: string, parentId?: string) {
  if (kind === 'flow') {
    const id = await flowStore.saveFlow(name, [], parentId)
    const found = flowStore.allFlows().find(f => f.id === id)
    if (found) editingFlow.value = JSON.parse(JSON.stringify(found))
  } else {
    await flowStore.saveFolder(name, parentId)
  }
  showCreateModal.value = false
}

// Tab selection
const tabs        = ref<chrome.tabs.Tab[]>([])
const activeTabId = ref<number | null>(null)

async function refreshTabs() {
  tabs.value = (await bridge.getTabs()).filter(t => t.url && !t.url.startsWith('chrome'))
}

async function selectTab(tabId: number) {
  activeTabId.value = tabId
  await bridge.setActiveTab(tabId)
}

const {
  domTree, domFilter, domScanning, domMutated, domTabTitle,
  pickMode, pickedCssSelector, scanDom, togglePickMode,
} = useDomPicker(bridge, activeTabId)

// Flow editing (定义在此处，供 composables 引用)
const editingFlow  = ref<LocalFlow | null>(null)
const saveToast    = ref(false)

// ── 元素选择器模态框 ──────────────────────────────────────────────
const showPickerModal = ref(false)

// ── useLoopEditor ─────────────────────────────────────────────────
// (先占位 openActionModal，实例化 useStepEditor 后再传入真正的实现)
// 使用一个可更新的包装函数
let _openActionModalFn: ((el: SerializedElement, opts?: {
  overrideSel?: string; isRelative?: boolean; context?: 'single' | { itemSel: string }
  initialType?: import('@shared/types/flow').ActionType; initialValue?: string
  initialWaitTimeout?: number; initialFoundDelay?: [number, number]; initialLabel?: string
}) => void) | null = null

function _openActionModalProxy(el: SerializedElement, opts?: {
  overrideSel?: string; isRelative?: boolean; context?: 'single' | { itemSel: string }
}) {
  _openActionModalFn?.(el, opts)
}

const {
  showEditLoopModal,
  editingLoopStepIdx,
  editingLoopStep,
  editingLoopChild,
  addingToLoopChild,
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
  returnToLoop,
} = useLoopEditor(editingFlow, bridge, scanDom, pickedCssSelector, _openActionModalProxy)

// ── useStepEditor ─────────────────────────────────────────────────
const {
  showActionModal,
  actionModalEl,
  actionModalOverrideSel,
  actionModalIsRelative,
  actionModalContext,
  editingStepIdx,
  editingInitialType,
  editingInitialValue,
  editingInitialWaitTimeout,
  editingInitialFoundDelay,
  editingInitialLabel,
  addingToBranch,
  editingBranchStep,
  openActionModal,
  onElementPicked: _onElementPickedBase,
  editStep,
  onActionRePick: _onActionRePickBase,
  cancelActionModal,
  onActionConfirm,
  editBranchStep,
} = useStepEditor(editingFlow, editingLoopStep, editingLoopChild, addingToLoopChild, returnToLoop)

// Wire up the proxy after useStepEditor is created
_openActionModalFn = openActionModal

/** ElementPickerModal 选中元素后 → 打开 ActionPickerModal */
function onElementPicked(el: SerializedElement) {
  _onElementPickedBase(el, getLoopChildActionOpts, showPickerModal, pickMode, () => bridge.cancelPickElement())
}

/** ActionPickerModal 点击「换元素」 → 保留动作状态，重新打开元素选择器 */
function onActionRePick(type: import('@shared/types/flow').ActionType, value: string | undefined) {
  _onActionRePickBase(type, value, showPickerModal, pickedCssSelector)
}

function openPicker() {
  if (!editingFlow.value) { alert('请先打开一个流程'); return }
  if (!activeTabId.value)  { alert('请先选择目标 Tab'); return }
  pickedCssSelector.value = ''
  showPickerModal.value = true
  scanDom()
}

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

function closePicker() {
  showPickerModal.value = false
  pickedCssSelector.value = ''
  if (pickMode.value) { pickMode.value = false; bridge.cancelPickElement() }
}

/** EditLoopModal "添加操作" wrapper */
function onLoopAddChild(currentState: FlowStep) {
  _onLoopAddChildRaw(currentState, () => { showPickerModal.value = true })
}

// ── 嵌入流程选择 ──────────────────────────────────────────────────

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

/** 等待步骤：弹出 prompt 修改时长 */
function editDelayStep(step: FlowStep) {
  const v = prompt('等待时长 (ms)', step.value ?? '1000')
  if (v === null) return
  const ms = Number(v) || 1000
  step.value = String(ms)
  step.label = `等待 ${ms} ms`
}
const showCallFlowPicker = ref(false)

function addCallFlowStep() {
  if (!editingFlow.value) return
  const others = flowStore.allFlows().filter(f => f.id !== editingFlow.value?.id)
  if (others.length === 0) { alert('没有可嵌入的其他流程'); return }
  showCallFlowPicker.value = true
}

function confirmCallFlow(id: string) {
  if (!editingFlow.value || !id) return
  const target = flowStore.allFlows().find(f => f.id === id)
  if (!target) return
  editingFlow.value.steps.push({
    id:      `step_${Date.now()}`,
    type:    'call_flow',
    label:   `嵌入流程：${target.name}`,
    flowRef: target.id,
  })
  showCallFlowPicker.value = false
}

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
} = useConditionEditor(editingFlow, addingToBranch, openPicker)
let   _toastTimer: ReturnType<typeof setTimeout> | null = null

function openFlow(flow: LocalFlow) {
  editingFlow.value = JSON.parse(JSON.stringify(flow))
}

function selectDelayLevel(level: StepDelayLevel) {
  if (!editingFlow.value) return
  if (level === 'none') {
    if (!confirm('不设置步骤间隔会导致操作极速触发，容易被网站风控识别和封号，确定要关闭间隔吗？')) return
  }
  editingFlow.value.stepDelayLevel = level
}

const showSettingsModal = ref(false)

// ── 预估完成时间 ──────────────────────────────────────────────────
function estimateStepListMs(steps: FlowStep[], interStepMs: number): number | null {
  let total = 0
  for (const step of steps) {
    if (step.type === 'call_flow' || step.type === 'loop_items') return null
    if (step.type === 'delay') {
      total += Number(step.value) || 0
    } else {
      total += interStepMs
    }
    if (step.foundDelay) total += (step.foundDelay[0] + step.foundDelay[1]) / 2
    if (step.type === 'condition') {
      const ifMs   = estimateStepListMs(step.children    ?? [], interStepMs)
      const elseMs = estimateStepListMs(step.elseChildren ?? [], interStepMs)
      if (ifMs === null || elseMs === null) return null
      total += Math.max(ifMs, elseMs)
    }
  }
  return total
}

const estimatedFlowTime = computed<string | null>(() => {
  if (!editingFlow.value) return null
  const flow = editingFlow.value
  let interStepMs: number
  if (flow.stepDelayLevel === 'none') {
    interStepMs = 0
  } else if (flow.stepDelayLevel === 'custom' && flow.stepDelayRange) {
    interStepMs = (flow.stepDelayRange[0] + flow.stepDelayRange[1]) / 2
  } else {
    const lvl = (flow.stepDelayLevel ?? 'medium') as 'low' | 'medium' | 'high'
    const p   = STEP_DELAY_PRESETS[lvl] ?? STEP_DELAY_PRESETS.medium
    interStepMs = (p[0] + p[1]) / 2
  }
  const ms = estimateStepListMs(flow.steps, interStepMs)
  if (ms === null) return null
  if (ms < 1000)  return '< 1 秒'
  if (ms < 60000) return `≈ ${(ms / 1000).toFixed(1)} 秒`
  const min = Math.floor(ms / 60000)
  const sec = Math.round((ms % 60000) / 1000)
  return `≈ ${min} 分 ${sec} 秒`
})

function onSettingsConfirm(data: { waitTimeout: number; stepDelayLevel: StepDelayLevel; stepDelayRange: [number, number] | undefined }) {
  if (!editingFlow.value) return
  editingFlow.value.waitTimeout    = data.waitTimeout
  editingFlow.value.stepDelayLevel = data.stepDelayLevel
  editingFlow.value.stepDelayRange = data.stepDelayRange
  showSettingsModal.value = false
}

async function saveFlow() {
  await flowStore.update(editingFlow.value.id, {
    name:           editingFlow.value.name,
    steps:          editingFlow.value.steps,
    stepDelayLevel: editingFlow.value.stepDelayLevel,
    stepDelayRange: editingFlow.value.stepDelayRange,
    waitTimeout:    editingFlow.value.waitTimeout,
    trigger:        editingFlow.value.trigger,
  })
  if (_toastTimer) clearTimeout(_toastTimer)
  saveToast.value = true
  _toastTimer = setTimeout(() => { saveToast.value = false }, 2000)
}

function findNodeInTree(nodes: FlowNode[], id: string): FlowNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n
    if (n.kind === 'folder') { const r = findNodeInTree(n.children, id); if (r) return r }
  }
}

async function deleteFlowOrFolder(id: string) {
  const node = findNodeInTree(flowStore.tree, id)
  if (!node) return
  const childCount = node.kind === 'folder' ? (node as FlowFolder).children.length : 0
  const msg = node.kind === 'folder' && childCount > 0
    ? `确定删除分组「${node.name}」及其中所有内容（${childCount} 项）？`
    : `确定删除「${node.name}」？`
  if (!confirm(msg)) return
  await flowStore.remove(id)
  if (editingFlow.value?.id === id) editingFlow.value = null
}

// ── 导出 ──────────────────────────────────────────────────────────
// ── 导出弹窗 ──────────────────────────────────────────────────────
const showExportModal = ref(false)

function handleExportSelected(ids: Set<string>) {
  const payload = flowStore.exportSelected(ids)
  const date = new Date().toISOString().slice(0, 10)
  const filename = `flowpilot-export-${date}.flowpilot`
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
  showExportModal.value = false
}

// ── 导入弹窗 ──────────────────────────────────────────────────────
const showImportModal = ref(false)

async function handleImportConfirm(payload: ExportPayload, selectedIds: Set<string>, targetId?: string) {
  const filtered = { ...payload, nodes: filterNodesByIds(payload.nodes, selectedIds) }
  const count = await flowStore.importInto(filtered, targetId)
  alert(`成功导入 ${count} 个项目`)
  showImportModal.value = false
}

// ── 预设库 ──────────────────────────────────────────────────

const showPresetsModal = ref(false)

async function onInstallPreset(preset: BuiltinPreset) {
  await flowStore.importInto(preset.payload as Parameters<typeof flowStore.importInto>[0], undefined)
}

// ── 编辑节点 ──────────────────────────────────────────────────────
const showEditModal       = ref(false)
const editingNodeId       = ref('')
const editingNodeName     = ref('')
const editingNodeKind     = ref<'flow' | 'folder'>('flow')
const editingNodeParentId = ref<string | undefined>(undefined)

function handleEdit(id: string) {
  const node = findNodeInTree(flowStore.tree, id)
  if (!node) return
  editingNodeId.value       = id
  editingNodeName.value     = node.name
  editingNodeKind.value     = node.kind
  editingNodeParentId.value = flowStore.getParentFolderId(id)
  showEditModal.value       = true
}

async function onConfirmEdit(id: string, name: string, parentId: string | undefined) {
  await flowStore.renameNode(id, name)
  const currentParent = flowStore.getParentFolderId(id)
  if (currentParent !== parentId) await flowStore.moveNode(id, parentId)
  if (editingFlow.value?.id === id) editingFlow.value.name = name
  showEditModal.value = false
}

function usePickedElement(el: SerializedElement) {
  if (!editingFlow.value) return
  const step: FlowStep = {
    id: `step_${Date.now()}`,
    type: el.kind === 'input' ? 'input' : el.kind === 'select' ? 'select' : 'click',
    label: el.label.slice(0, 40) || el.selector.cssSelector.slice(0, 40),
    selector: el.selector,
  }
  editingFlow.value.steps.push(step)
}

function removeStep(index: number) { editingFlow.value?.steps.splice(index, 1) }

function addDelayStep() {
  if (!editingFlow.value) return
  editingFlow.value.steps.push({
    id:    `step_${Date.now()}`,
    type:  'delay',
    label: '等待',
    value: '1000',
  })
}

// ── 步骤拖拽排序 ──────────────────────────────────────────────────
const { dragSrcIdx, dragInsertIdx, onHandleMouseDown, onDragStart, onDragOver, onDrop, onDragEnd } = useStepDrag(editingFlow)

// ── 批量选择删除 ───────────────────────────────────────────────
const selectedStepIds = ref<string[]>([])

function toggleSelect(id: string) {
  const idx = selectedStepIds.value.indexOf(id)
  if (idx >= 0) selectedStepIds.value.splice(idx, 1)
  else selectedStepIds.value.push(id)
}

function deleteSelected() {
  if (!editingFlow.value) return
  editingFlow.value.steps = editingFlow.value.steps.filter(s => !selectedStepIds.value.includes(s.id))
  selectedStepIds.value = []
}

// Run
const { logs, running, logDrawerOpen, runCurrentFlow, stopCurrentFlow } = useFlowRunner(bridge, editingFlow, activeTabId)

// Bridge events（DOM_SCAN_RESULT/ELEMENT_PICKED → useDomPicker；FLOW_LOG/DONE/ERROR → useFlowRunner；SMART_LOOP_ANALYZED → useSmartLoop）
bridge.on((evt) => {
  if (evt.type === 'DOM_MUTATION' && showPickerModal.value && !domScanning.value) domMutated.value = true
})

onMounted(async () => {
  await flowStore.load()
  await refreshTabs()
  document.addEventListener('click', closeMenus)
})
onUnmounted(() => { document.removeEventListener('click', closeMenus) })

// ── 侧边栏 & 日志抽屉拖拽调整 ──────────────────────────────────────
const { sidebarWidth, logDrawerHeight, startResize, startLogResize } = useResizable()

const stepTypeLabels: Record<string, string> = {
  click: '点击', input: '输入', select: '选择', focus: '聚焦',
  get_text: '获取文字', wait_appear: '等待出现', wait_disappear: '等待消失',
  scroll_to: '滚动到', navigate: '导航', loop_items: '列表循环', condition: '条件判断',
  delay: '等待', press_key: '按键', call_flow: '嵌入流程', save_canvas: '截图',
}
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
        <button class="btn btn--ghost" @click="refreshTabs">↻</button>
      </div>
      <div class="app__actions">
        <button
          :class="running ? 'btn btn--danger' : 'btn btn--primary'"
          @click="running ? stopCurrentFlow() : runCurrentFlow()"
        >{{ running ? '⏹ 停止' : '▶ 运行' }}</button>
      </div>
    </header>

    <div class="app__body">
      <aside class="app__aside" :style="{ width: sidebarWidth + 'px' }">
        <div class="panel">
          <div class="panel__toolbar">
            <span class="panel__title">已保存流程</span>
            <button
              v-if="BUILTIN_PRESETS.length > 0"
              class="btn btn--sm"
              title="浏览内置预设库"
              @click="showPresetsModal = true"
            >📦 预设</button>
            <button class="btn btn--sm" title="导入流程" @click="showImportModal = true">📥 导入</button>
            <button class="btn btn--sm" title="导出流程" @click="showExportModal = true">📤 导出</button>
            <button class="btn btn--sm btn--primary" @click="openCreateModal()">&#xFF0B; 新增</button>
          </div>

          <div class="flow-list">
            <FlowTreeNode
              :nodes="flowStore.tree"
              :active-flow-id="editingFlow?.id"
              @open="openFlow"
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
            <button
              v-if="selectedStepIds.length > 0"
              class="btn btn--danger btn--sm"
              @click="deleteSelected"
            >🗑 删除已选 ({{ selectedStepIds.length }})</button>
            <div class="add-menu add-menu--step">
              <button class="btn btn--sm btn--primary" @click.stop="stepMenuOpen = !stepMenuOpen">＋ 添加步骤 ▾</button>
              <div v-if="stepMenuOpen" class="add-menu__dropdown add-menu__dropdown--up" @click.stop>
                <button class="add-menu__item" @click="openPicker(); stepMenuOpen = false">🖱 选择元素</button>
                <button class="add-menu__item" @click="openSmartPicker(); stepMenuOpen = false">🔁 依次点击列表项</button>
                <button class="add-menu__item" @click="addConditionStep(); stepMenuOpen = false">🔀 条件判断</button>
                <button class="add-menu__item" @click="addCallFlowStep(); stepMenuOpen = false">▶ 嵌入流程</button>
                <button class="add-menu__item" @click="addDelayStep(); stepMenuOpen = false">⏱ 等待</button>
              </div>
            </div>
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

    <!-- 智能列表循环选择器 -->
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
      v-if="showEditLoopModal && editingLoopStep"
      :step="editingLoopStep"
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
      v-if="showActionModal && actionModalEl"
      :element="actionModalEl!"
      :override-sel="actionModalOverrideSel"
      :is-relative="actionModalIsRelative"
      :initial-type="editingInitialType"
      :initial-value="editingInitialValue"
      :initial-wait-timeout="editingInitialWaitTimeout"
      :initial-found-delay="editingInitialFoundDelay"
      :initial-label="editingInitialLabel"
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

  </div>

  <Transition name="toast">
    <div v-if="saveToast" class="save-toast">✅ 已保存</div>
  </Transition>

</template>

<style lang="scss">
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { background: #1e1e2e; color: #cdd6f4; font-family: -apple-system, 'Segoe UI', sans-serif; font-size: 13px; height: 100vh; overflow: hidden; }
.app { display: flex; flex-direction: column; height: 100vh; }
.app__header { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #181825; border-bottom: 1px solid #313244; flex-shrink: 0; }
.app__logo { font-weight: 700; font-size: 15px; color: #89b4fa; white-space: nowrap; }
.app__tab-selector { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 0; }
.app__actions { display: flex; gap: 8px; flex-shrink: 0; }
.app__body { display: flex; flex: 1; min-height: 0; }
.app__aside { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; border-right: none; background: #181825; min-width: 180px; max-width: 600px; }

.resize-handle { width: 4px; flex-shrink: 0; background: #313244; cursor: col-resize; transition: background 0.15s; }
.resize-handle:hover { background: #89b4fa; }
.app__main { flex: 1; overflow-y: auto; padding: 16px; background: #1e1e2e; }

.panel { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }
.panel__toolbar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; flex-shrink: 0; flex-wrap: wrap; }
.panel__title { font-weight: 600; font-size: 12px; flex: 1; }
.panel__subtitle { font-weight: 400; color: #6c7086; font-size: 11px; }
.dom-panel { overflow: hidden; }
.dom-scroll { flex: 1; overflow-y: auto; padding: 4px 0; }

.flow-list { flex: 1; overflow-y: auto; padding: 4px; }
.flow-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 4px; cursor: pointer; }
.flow-item:hover { background: #313244; }
.flow-item--active { background: #1a3a5f !important; }
.flow-item__name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.flow-item__count { font-size: 11px; color: #6c7086; flex-shrink: 0; }
.flow-item__del { background: none; border: none; cursor: pointer; font-size: 13px; opacity: 0; }
.flow-item:hover .flow-item__del { opacity: 0.6; }
.flow-item__del:hover { opacity: 1 !important; }
.create-form { padding: 6px 8px 8px; border-bottom: 1px solid #313244; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
.create-form__label { font-size: 12px; font-weight: 600; color: #89b4fa; }
.create-form__row { display: flex; gap: 4px; align-items: center; }
.create-form__location { display: flex; align-items: center; gap: 6px; }
.create-form__location-label { font-size: 11px; color: #6c7086; flex-shrink: 0; }

.editor__placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 12px; color: #6c7086; }
.editor__placeholder-icon { font-size: 48px; }

.step-list { display: flex; flex-direction: column; }
.step-insert-line { height: 3px; border-radius: 2px; margin: 1px 0; transition: background 0.1s; }
.step-insert-line--active { background: #89b4fa; box-shadow: 0 0 6px #89b4fa88; }
.step-card { display: flex; align-items: flex-start; gap: 8px; background: #313244; border-radius: 6px; padding: 8px 10px; border: 1px solid #45475a; margin: 2px 0; }
.step-card--dragging { opacity: 0.4; }
.step-card__handle { flex-shrink: 0; width: 14px; color: #45475a; font-size: 13px; line-height: 1; cursor: grab; user-select: none; padding-top: 1px; letter-spacing: -1px; }
.step-card__handle:hover { color: #6c7086; }
.step-card__handle--grabbing { cursor: grabbing; }
.step-card__check { flex-shrink: 0; width: 14px; height: 14px; margin-top: 3px; cursor: pointer; accent-color: #89b4fa; }
.step-card__index { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: #45475a; color: #cdd6f4; font-size: 11px; display: flex; align-items: center; justify-content: center; font-weight: 600; }
.step-card__body { flex: 1; min-width: 0; }
.step-card__label { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-card__type  { font-size: 11px; color: #89b4fa; margin-top: 2px; }
.step-card__wait { display: flex; align-items: center; gap: 4px; margin-top: 5px; flex-wrap: wrap; }
.step-card__wait-label { font-size: 11px; color: #6c7086; white-space: nowrap; }
.step-card__wait-sep { font-size: 11px; color: #6c7086; white-space: nowrap; margin-left: 4px; }
.step-card__wait-tilde { font-size: 11px; color: #6c7086; }
.step-card__wait-unit { font-size: 11px; color: #6c7086; }
.step-card__wait-input { width: 60px; background: #1e1e2e; border: 1px solid #313244; border-radius: 3px; color: #a6adc8; padding: 2px 4px; font-size: 11px; text-align: right; }
.step-card__wait-input:focus { outline: none; border-color: #89b4fa; }
.step-card__actions { display: flex; gap: 4px; flex-shrink: 0; }
.step-card__btn { background: none; border: 1px solid #45475a; border-radius: 3px; color: #6c7086; cursor: pointer; font-size: 11px; padding: 2px 5px; }
.step-card__btn:hover { color: #cdd6f4; border-color: #6c7086; }
.step-card__btn:disabled { opacity: 0.3; cursor: default; }
.step-card__btn--edit:hover { color: #89b4fa; border-color: #89b4fa; }
.step-card__btn--del:hover { color: #f38ba8; border-color: #f38ba8; }

.step-card__cond-toggle {
  background: none; border: 1px solid #45475a; border-radius: 3px; color: #6c7086;
  cursor: pointer; font-size: 10px; padding: 2px 6px; white-space: nowrap; margin-top: 4px; display: block;
  &:hover { color: #cdd6f4; border-color: #6c7086; }
}
.step-card__cond-count { color: #585b70; font-size: 10px; margin-left: 2px; }

.btn { padding: 5px 12px; border-radius: 4px; border: 1px solid #45475a; background: #313244; color: #cdd6f4; cursor: pointer; font-size: 12px; white-space: nowrap; }
.btn:hover:not(:disabled) { background: #45475a; }
.btn:disabled { opacity: 0.4; cursor: default; }
.btn--primary { background: #1e3a5f; border-color: #89b4fa; color: #89b4fa; }
.btn--primary:hover:not(:disabled) { background: #264a7a; }
.btn--danger { background: #3a1e1e; border-color: #f38ba8; color: #f38ba8; }
.btn--danger:hover:not(:disabled) { background: #4a2828; }
.btn--ghost { background: transparent; border-color: transparent; }
.btn--ghost:hover:not(:disabled) { background: #313244; }
.btn--sm { padding: 3px 8px; font-size: 11px; }

.input { background: #313244; border: 1px solid #45475a; border-radius: 4px; color: #cdd6f4; padding: 5px 8px; font-size: 12px; flex: 1; min-width: 0; }
.input:focus { outline: none; border-color: #89b4fa; }
.input--sm { padding: 3px 6px; font-size: 11px; }

.tab-select { flex: 1; min-width: 0; background: #313244; border: 1px solid #45475a; border-radius: 4px; color: #cdd6f4; padding: 5px 8px; font-size: 12px; }
.tab-select:focus { outline: none; border-color: #89b4fa; }

.empty-hint { color: #6c7086; font-size: 12px; text-align: center; padding: 20px; }

.step-add-toolbar {
  position: sticky; bottom: 0; z-index: 10;
  padding: 10px 0 2px; border-top: 1px solid #313244; margin-top: 8px;
  background: #1e1e2e; display: flex; justify-content: flex-end;
}
.step-add-btn { flex: 1; min-width: 90px; justify-content: center; }

.add-menu { position: relative; display: inline-block; }

.add-menu__dropdown {
  position: absolute; top: calc(100% + 4px); right: 0; z-index: 200;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 6px;
  padding: 4px; display: flex; flex-direction: column; gap: 2px; min-width: 140px;
  box-shadow: 0 4px 16px rgba(0,0,0,.4);
  animation: slideUpFromBottomRight 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  transform-origin: bottom right;
}
.add-menu__dropdown--up { top: auto; bottom: calc(100% + 4px); }
@keyframes slideUpFromBottomRight {
  from { opacity: 0; transform: translateY(8px) scale(0.95); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.add-menu__item {
  background: none; border: none; color: #cdd6f4; cursor: pointer;
  padding: 6px 10px; border-radius: 4px; text-align: left; font-size: 12px; white-space: nowrap;
  &:hover { background: #313244; }
}

.log-drawer { flex-shrink: 0; background: #181825; border-top: 1px solid #313244; }
.log-drawer__resize { height: 4px; cursor: row-resize; background: #313244; transition: background 0.15s; }
.log-drawer__resize:hover { background: #89b4fa; }
.log-drawer__header { padding: 2px 10px; cursor: pointer; display: flex; align-items: center; gap: 8px; user-select: none; }
.log-drawer__header:hover { background: #1e1e2e; }
.log-drawer__toggle { background: none; border: none; color: #89b4fa; font-size: 12px; font-weight: 600; padding: 4px 0; display: inline-flex; align-items: center; gap: 8px; flex: 1; pointer-events: none; }
.log-drawer__running { color: #a6e3a1; font-size: 11px; animation: pulse 1s infinite; }
.log-drawer__count { color: #6c7086; font-size: 11px; }
.log-drawer__action-btn { background: none; border: 1px solid #45475a; border-radius: 3px; color: #6c7086; cursor: pointer; font-size: 11px; padding: 2px 7px; white-space: nowrap; }
.log-drawer__action-btn:hover { color: #cdd6f4; border-color: #6c7086; }
.log-drawer__action-btn--danger:hover { color: #f38ba8; border-color: #f38ba8; }
.log-drawer__body { overflow: hidden; }
@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }

.save-toast {
  position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
  background: #a6e3a1; color: #1e1e2e;
  font-size: 13px; font-weight: 600;
  padding: 8px 20px; border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0,0,0,.4);
  pointer-events: none; z-index: 9999;
  white-space: nowrap;
}
.toast-enter-active { transition: opacity 0.2s, transform 0.2s; }
.toast-leave-active { transition: opacity 0.4s, transform 0.4s; }
.toast-enter-from  { opacity: 0; transform: translateX(-50%) translateY(8px); }
.toast-leave-to    { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>
