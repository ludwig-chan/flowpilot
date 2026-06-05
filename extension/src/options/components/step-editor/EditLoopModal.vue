<script setup lang="ts">
import { ref } from 'vue'
import type { FlowStep } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import BaseInput from '@shared/components/BaseInput.vue'
import RangeInput from '@shared/components/RangeInput.vue'
import AddStepMenu from './AddStepMenu.vue'

const props = defineProps<{
  step: FlowStep
}>()

const emit = defineEmits<{
  (e: 'save',                 step: FlowStep): void
  (e: 'close'):                                void
  (e: 'reselect'):                             void
  (e: 'reselect-child',       currentState: FlowStep): void
  (e: 'edit-child',           childIdx: number, currentState: FlowStep): void
  (e: 'add-child',            currentState: FlowStep): void
  (e: 'add-call-flow',        currentState: FlowStep): void
  (e: 'add-condition',        currentState: FlowStep): void
  (e: 'add-delay',            currentState: FlowStep): void
  (e: 'add-branch-child',     condChildId: string, branch: 'if' | 'else', currentState: FlowStep): void
  (e: 'add-branch-call-flow', condChildId: string, branch: 'if' | 'else', currentState: FlowStep): void
  (e: 'add-branch-condition', condChildId: string, branch: 'if' | 'else', currentState: FlowStep): void
  (e: 'edit-branch-child',    condChildId: string, branch: 'if' | 'else', childIdx: number, currentState: FlowStep): void
}>()

const label          = ref(props.step.label)
const itemDelay      = ref<[number | undefined, number | undefined]>([props.step.itemDelay?.[0] ?? 800, props.step.itemDelay?.[1] ?? 2000])
const childSel       = ref(props.step.loopChildSelector ?? '')
const scrollBehavior = ref<'none' | 'item' | 'bottom'>(props.step.scrollBehavior ?? 'none')
const children           = ref<FlowStep[]>(JSON.parse(JSON.stringify(props.step.children ?? [])))
const showAdvanced       = ref(false)
const expandedConditions = ref(new Set<string>())

const ACTION_LABELS: Record<string, string> = {
  click: '点击', double_click: '双击', right_click: '右键', hover: '悬停',
  input: '输入文本', clear: '清空', select: '选择选项', check: '勾选',
  focus: '聚焦', press_key: '按键', get_text: '获取文字',
  wait_appear: '等待出现', wait_disappear: '等待消失',
  scroll_to: '滚动到', navigate: '导航', save_canvas: '截图',
  delay: '等待', loop_items: '循环列表', condition: '条件', call_flow: '嵌入流程',
}

function currentState(): FlowStep {
  return {
    ...props.step,
    label:             label.value.trim() || props.step.label,
    itemDelay:         [Math.max(0, itemDelay.value[0] ?? 0), Math.max(0, itemDelay.value[1] ?? 0)],
    loopChildSelector: childSel.value || undefined,
    children:          children.value,
    scrollBehavior:    scrollBehavior.value === 'none' ? undefined : scrollBehavior.value,
  }
}

function onSave() {
  emit('save', currentState())
}

function onEditChild(idx: number) {
  emit('edit-child', idx, currentState())
}

function onDeleteChild(idx: number) {
  children.value.splice(idx, 1)
}

function toggleCondExpand(id: string) {
  const s = new Set(expandedConditions.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  expandedConditions.value = s
}

// ── 顶层步骤菜单 ──────────────────────────────────────────────────────────
function onTopMenuSelect(type: 'pick-element' | 'add-condition' | 'add-call-flow' | 'add-delay') {
  const state = currentState()
  if (type === 'pick-element')  emit('add-child',     state)
  if (type === 'add-condition') emit('add-condition', state)
  if (type === 'add-call-flow') emit('add-call-flow', state)
  if (type === 'add-delay')     emit('add-delay',     state)
}

// ── 条件分支内步骤管理 ────────────────────────────────────────────────────
function getBranchArr(condChildId: string, branch: 'if' | 'else'): FlowStep[] | null {
  const cond = children.value.find(c => c.id === condChildId)
  if (!cond) return null
  if (branch === 'if') { cond.children = cond.children ?? []; return cond.children }
  cond.elseChildren = cond.elseChildren ?? []; return cond.elseChildren
}

function onBranchMenuSelect(
  type: 'pick-element' | 'add-condition' | 'add-call-flow' | 'add-delay',
  condChildId: string,
  branch: 'if' | 'else',
) {
  const state = currentState()
  if (type === 'pick-element')  { emit('add-branch-child',     condChildId, branch, state); return }
  if (type === 'add-call-flow') { emit('add-branch-call-flow', condChildId, branch, state); return }
  if (type === 'add-condition') { emit('add-branch-condition', condChildId, branch, state); return }
  if (type === 'add-delay') {
    getBranchArr(condChildId, branch)?.push({
      id:    `step_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type:  'delay',
      label: '等待 1000 ms',
      value: '1000',
    })
  }
}

function onEditBranchChild(condChildId: string, branch: 'if' | 'else', childIdx: number) {
  emit('edit-branch-child', condChildId, branch, childIdx, currentState())
}

function onDeleteBranchChild(condChildId: string, branch: 'if' | 'else', childIdx: number) {
  getBranchArr(condChildId, branch)?.splice(childIdx, 1)
}
</script>

<template>
  <BaseModal title="✏ 编辑循环步骤" width="500px" :z-index="1070" @close="emit('close')">

      <!-- 步骤名称 -->
      <div class="elm-section">
        <label class="elm-label">步骤名称</label>
        <BaseInput v-model="label" class="elm-input" placeholder="循环列表…" />
      </div>

      <!-- 循环选择器 -->
      <div class="elm-section">
        <label class="elm-label">循环选择器</label>
        <div class="elm-selector-row">
          <code class="elm-selector-val" :title="step.selector?.cssSelector">
            {{ step.selector?.cssSelector || '（未设置）' }}
          </code>
          <BaseButton class="elm-resel-btn" @click="emit('reselect')">重新选择…</BaseButton>
        </div>
      </div>

      <!-- 子元素路径 -->
      <div class="elm-section">
        <label class="elm-label">操作目标子元素路径</label>
        <div class="elm-selector-row">
          <code v-if="childSel" class="elm-selector-val" :title="childSel">{{ childSel }}</code>
          <span v-else class="elm-selector-empty">（未设置，将操作列表项本身）</span>
          <BaseButton class="elm-resel-btn" @click="emit('reselect-child', currentState())">重选子项…</BaseButton>
        </div>
      </div>

      <!-- 子步骤列表 -->
      <div class="elm-section">
        <label class="elm-label">每项执行的步骤</label>
        <div v-if="children.length === 0" class="elm-empty">暂无步骤</div>
        <template v-for="(child, ci) in children" :key="child.id">
          <!-- 步骤行 -->
          <div class="elm-child-row">
            <BaseButton
              v-if="child.type === 'condition'"
              class="elm-cond-toggle"
              :title="expandedConditions.has(child.id) ? '折叠分支' : '展开分支'"
              @click="toggleCondExpand(child.id)"
            >{{ expandedConditions.has(child.id) ? '▾' : '▸' }}</BaseButton>
            <span class="elm-child-type">{{ ACTION_LABELS[child.type] ?? child.type }}</span>
            <span class="elm-child-label" :title="child.label">{{ child.label }}</span>
            <div class="elm-child-actions">
              <BaseButton
                v-if="child.selector || child.type === 'call_flow' || child.type === 'condition'"
                size="icon"
                class="elm-child-btn"
                title="编辑"
                @click="onEditChild(ci)"
              >✎</BaseButton>
              <BaseButton size="icon" class="elm-child-btn elm-child-btn--del" title="删除" @click="onDeleteChild(ci)">✖</BaseButton>
            </div>
          </div>

          <!-- 条件分支展开区域 -->
          <div v-if="child.type === 'condition' && expandedConditions.has(child.id)" class="elm-cond-branches">
            <!-- IF 分支 -->
            <div class="elm-cond-branch">
              <div class="elm-cond-branch__header">
                <span class="elm-cond-branch__label elm-cond-branch__label--if">✅ 条件成立 (IF)</span>
              </div>
              <div class="elm-cond-branch__steps">
                <div v-if="!child.children?.length" class="elm-empty">暂无步骤</div>
                <div v-for="(bc, bci) in child.children" :key="bc.id" class="elm-cond-child-card">
                  <div class="elm-cond-child-card__body">
                    <span class="elm-cond-child-card__type">{{ ACTION_LABELS[bc.type] ?? bc.type }}</span>
                    <span class="elm-cond-child-card__label">{{ bc.label }}</span>
                  </div>
                  <div class="elm-cond-child-card__actions">
                    <BaseButton v-if="bc.selector || bc.type === 'call_flow'" size="icon" class="elm-child-btn" title="编辑" @click="onEditBranchChild(child.id, 'if', bci)">✎</BaseButton>
                    <BaseButton size="icon" class="elm-child-btn elm-child-btn--del" title="删除" @click="onDeleteBranchChild(child.id, 'if', bci)">✖</BaseButton>
                  </div>
                </div>
              </div>
              <AddStepMenu
                context="loop" label="＋ 添加" align="left"
                @pick-element="onBranchMenuSelect('pick-element', child.id, 'if')"
                @add-condition="onBranchMenuSelect('add-condition', child.id, 'if')"
                @add-call-flow="onBranchMenuSelect('add-call-flow', child.id, 'if')"
                @add-delay="onBranchMenuSelect('add-delay', child.id, 'if')"
              />
            </div>
            <!-- ELSE 分支 -->
            <div class="elm-cond-branch elm-cond-branch--else">
              <div class="elm-cond-branch__header">
                <span class="elm-cond-branch__label elm-cond-branch__label--else">❌ 条件不成立 (ELSE)</span>
              </div>
              <div class="elm-cond-branch__steps">
                <div v-if="!child.elseChildren?.length" class="elm-empty">暂无步骤</div>
                <div v-for="(bc, bci) in child.elseChildren" :key="bc.id" class="elm-cond-child-card">
                  <div class="elm-cond-child-card__body">
                    <span class="elm-cond-child-card__type">{{ ACTION_LABELS[bc.type] ?? bc.type }}</span>
                    <span class="elm-cond-child-card__label">{{ bc.label }}</span>
                  </div>
                  <div class="elm-cond-child-card__actions">
                    <BaseButton v-if="bc.selector || bc.type === 'call_flow'" size="icon" class="elm-child-btn" title="编辑" @click="onEditBranchChild(child.id, 'else', bci)">✎</BaseButton>
                    <BaseButton size="icon" class="elm-child-btn elm-child-btn--del" title="删除" @click="onDeleteBranchChild(child.id, 'else', bci)">✖</BaseButton>
                  </div>
                </div>
              </div>
              <AddStepMenu
                context="loop" label="＋ 添加" align="left"
                @pick-element="onBranchMenuSelect('pick-element', child.id, 'else')"
                @add-condition="onBranchMenuSelect('add-condition', child.id, 'else')"
                @add-call-flow="onBranchMenuSelect('add-call-flow', child.id, 'else')"
                @add-delay="onBranchMenuSelect('add-delay', child.id, 'else')"
              />
            </div>
          </div>
        </template>
      </div>

      <div class="elm-child-add">
        <AddStepMenu
          context="loop"
          @pick-element="onTopMenuSelect('pick-element')"
          @add-condition="onTopMenuSelect('add-condition')"
          @add-call-flow="onTopMenuSelect('add-call-flow')"
          @add-delay="onTopMenuSelect('add-delay')"
        />
      </div>

      <!-- 高级设置折叠 -->
      <div class="elm-advanced-header" @click="showAdvanced = !showAdvanced">
        <span class="elm-advanced-title">高级设置</span>
        <span class="elm-advanced-icon" :class="{ 'elm-advanced-icon--open': showAdvanced }">›</span>
      </div>
      <div v-if="showAdvanced" class="elm-section elm-advanced-body">
        <label class="elm-label">每项处理间隔</label>
        <RangeInput
          v-model="itemDelay"
          :presets="[
            { label: '低', value: STEP_DELAY_PRESETS.low },
            { label: '中', value: STEP_DELAY_PRESETS.medium },
            { label: '高', value: STEP_DELAY_PRESETS.high },
          ]"
        />
        <label class="elm-label" style="margin-top: 10px;">滚动行为</label>
        <div class="elm-scroll-options">
          <label class="elm-check-label">
            <input v-model="scrollBehavior" type="radio" value="none" class="elm-checkbox" />
            不滚动
          </label>
          <label class="elm-check-label">
            <input v-model="scrollBehavior" type="radio" value="item" class="elm-checkbox" />
            滚动到当前项（反检测）
          </label>
          <label class="elm-check-label">
            <input v-model="scrollBehavior" type="radio" value="bottom" class="elm-checkbox" />
            滚动到底部（触发懒加载）
          </label>
        </div>
      </div>

      <!-- 底部 -->
      <template #footer>
        <BaseButton @click="emit('close')">取消</BaseButton>
        <BaseButton variant="primary" @click="onSave">保存</BaseButton>
      </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.elm-section {
  padding: 10px 14px;
  border-bottom: 1px solid #1a1a28;
  &--row { display: flex; align-items: center; gap: 8px; }
}

.elm-label {
  display: block; font-size: 11px; color: $color-text-muted; margin-bottom: 6px; font-weight: 600;
}

.elm-input { width: 100%; box-sizing: border-box; }

.elm-selector-row {
  display: flex; align-items: center; gap: 8px;
}

.elm-selector-val {
  flex: 1; min-width: 0;
  font-family: 'Cascadia Code', monospace; font-size: 11px; color: $color-green;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.elm-resel-btn { font-size: 11px; padding: 3px 10px; flex-shrink: 0; }

.elm-empty {
  font-size: 11px; color: $color-text-muted-2; text-align: center; padding: 8px 0;
}

.elm-child-row {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 0; border-bottom: 1px solid #1a1a28;
  &:last-child { border-bottom: none; }
}

.elm-selector-empty {
  flex: 1; font-size: 11px; color: $color-text-muted-2; font-style: italic;
}

.elm-child-type {
  font-size: 10px; background: $color-surface-1; color: $color-blue;
  padding: 1px 5px; border-radius: $radius-sm; flex-shrink: 0;
}

.elm-child-label {
  flex: 1; min-width: 0; font-size: 11px; color: $color-text;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.elm-child-actions { display: flex; gap: 2px; flex-shrink: 0; }

.elm-child-btn {
  padding: 1px 5px; font-size: 11px;
  &--del { color: $color-text-muted-2; &:hover { color: $color-red !important; } }
}

.elm-child-add { padding: 8px 14px; }

.elm-cond-toggle {
  background: none;
  border: none;
  color: $color-text-muted;
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  flex-shrink: 0;
  line-height: 1;
  &:hover { color: $color-text; }
}

.elm-cond-branches {
  margin: 0 0 4px 12px;
  border-left: 2px solid $color-surface-2;
}

.elm-cond-branch {
  padding: 8px 10px;
  border-bottom: 1px solid $color-surface-1;
  &:last-child { border-bottom: none; }
  &--else { background: rgba(243, 139, 168, 0.04); }

  &__header { display: flex; align-items: center; margin-bottom: 6px; }
  &__label { font-size: 11px; font-weight: 700; }
  &__label--if   { color: #a6e3a1; }
  &__label--else { color: #f38ba8; }

  &__steps { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }
}

.elm-cond-child-card {
  display: flex; align-items: center; gap: 6px;
  background: $color-surface-0; border: 1px solid $color-surface-2;
  border-radius: $radius-sm; padding: 4px 8px;

  &__body { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  &__type {
    font-size: 10px; font-weight: 700; color: $color-text-muted;
    background: $color-surface-2; padding: 1px 4px; border-radius: $radius-sm;
    white-space: nowrap; flex-shrink: 0;
  }
  &__label {
    font-size: 11px; color: $color-text;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  &__actions { display: flex; gap: 2px; flex-shrink: 0; }
}

.elm-check-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: $color-text; cursor: pointer;
}

.elm-checkbox { accent-color: $color-blue; cursor: pointer; }

.elm-advanced-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; cursor: pointer; user-select: none;
  border-bottom: 1px solid #1a1a28;
  &:hover { background: $color-surface-1; }
}

.elm-advanced-title {
  font-size: 11px; color: $color-text-muted; font-weight: 600;
}

.elm-advanced-icon {
  font-size: 14px; color: $color-text-muted-2;
  transition: transform 0.2s ease;
  transform: rotate(0deg);
  &--open { transform: rotate(90deg); }
}

.elm-advanced-body { border-top: none; }

.elm-scroll-options {
  display: flex; flex-direction: column; gap: 6px;
}
</style>