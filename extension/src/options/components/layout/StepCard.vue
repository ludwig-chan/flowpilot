<script setup lang="ts">
import type { FlowStep } from '@shared/types/flow'
import type { BranchDropTarget } from '../../composables/useStepDrag'
import ConditionBranchView from '../step-editor/ConditionBranchView.vue'
import { displayExprWithAliases } from '@shared/utils/varAlias'

const props = defineProps<{
  step:               FlowStep
  index:              number
  dragSrcIdx:         number | null
  selected:           boolean
  stepTypeLabels:     Record<string, string>
  expandedConditions: Set<string>
  isBrokenRef:        (flowRef?: string) => boolean
  branchDropTarget?:  BranchDropTarget | null
  varAliasMap?:       Map<string, string>
}>()

const emit = defineEmits<{
  (e: 'dragstart',               event: DragEvent,  index: number): void
  (e: 'dragover',                event: DragEvent,  index: number): void
  (e: 'drop'):                   void
  (e: 'dragend'):                void
  (e: 'handle-mousedown',        event: MouseEvent): void
  (e: 'toggle-select',           stepId: string):    void
  (e: 'edit',                    step: FlowStep,    index: number): void
  (e: 'remove',                  index: number):     void
  (e: 'toggle-condition-expand', stepId: string):    void
  (e: 'edit-branch',    condStepId: string, branch: 'if' | 'else', child: FlowStep, ci: number): void
  (e: 'remove-branch',  condStepId: string, branch: 'if' | 'else', ci: number): void
  (e: 'open-picker',    condStepId: string, branch: 'if' | 'else'): void
  (e: 'add-branch-delay',     condStepId: string, branch: 'if' | 'else'): void
  (e: 'add-branch-call-flow', condStepId: string, branch: 'if' | 'else'): void
  (e: 'add-branch-condition', condStepId: string, branch: 'if' | 'else'): void
  (e: 'add-branch-save-data', condStepId: string, branch: 'if' | 'else'): void
  (e: 'convert-to-element-branch', step: FlowStep, index: number): void
  (e: 'revert-element-branch',     step: FlowStep, index: number): void
  (e: 'branch-dragover', stepId: string, branch: 'if' | 'else', insertIdx: number): void
  (e: 'branch-drop'): void
}>()
</script>

<template>
  <div
    class="step-card"
    :class="{ 'step-card--dragging': dragSrcIdx === index }"
    draggable="true"
    @dragstart="$emit('dragstart', $event, index)"
    @dragover.stop="$emit('dragover', $event, index)"
    @drop.stop="$emit('drop')"
    @dragend="$emit('dragend')"
  >
    <div
      class="step-card__handle"
      :class="{ 'step-card__handle--grabbing': dragSrcIdx === index }"
      @mousedown="$emit('handle-mousedown', $event)"
    >⋮⋮</div>
    <input
      type="checkbox"
      class="step-card__check"
      :checked="selected"
      @change="$emit('toggle-select', step.id)"
    />
    <div class="step-card__body">
      <div class="step-card__label">{{ step.label }}</div>
      <div class="step-card__type">{{ stepTypeLabels[step.type] ?? step.type }}</div>
      <!-- 多条件摘要 -->
      <div v-if="step.type === 'condition' && step.conditions?.length" class="step-card__cond-summary">
        <code v-for="(c, i) in step.conditions" :key="c.id">
          {{ c.mode === 'expr' ? displayExprWithAliases(c.value ?? '?', varAliasMap ?? new Map()) : (c.selector?.slice(0, 25) ?? '?') }}
          <span v-if="i < step.conditions.length - 1" class="step-card__cond-logic">
            {{ step.conditionLogic === 'or' ? ' 或 ' : ' 且 ' }}
          </span>
        </code>
      </div>
      <div
        v-if="step.type === 'call_flow' && isBrokenRef(step.flowRef)"
        class="step-card__broken"
        title="引用的流程不存在或已被删除"
      >⚠ 流程已丢失</div>
      <BaseButton
        v-if="step.type === 'condition' || step.type === 'element_branch'"
        class="step-card__cond-toggle"
        @click.stop="$emit('toggle-condition-expand', step.id)"
      >
        {{ expandedConditions.has(step.id) ? '▲ 收起' : '▼ 展开分支' }}
        <span class="step-card__cond-count">(IF:{{ step.children?.length ?? 0 }} | ELSE:{{ step.elseChildren?.length ?? 0 }})</span>
      </BaseButton>
    </div>
    <div class="step-card__actions">
      <BaseButton
        v-if="step.type !== 'call_flow' && step.type !== 'element_branch' && (step.type === 'condition' || step.type === 'delay' || step.type === 'loop_items' || step.type === 'save_data' || !!step.selector)"
        class="step-card__btn step-card__btn--edit"
        title="编辑步骤"
        @click="$emit('edit', step, index)"
      >✎</BaseButton>
      <BaseButton
        v-if="!!step.selector && step.type !== 'element_branch' && step.type !== 'loop_items' && step.type !== 'condition'"
        class="step-card__btn step-card__btn--branch"
        title="转为元素分支"
        @click="$emit('convert-to-element-branch', step, index)"
      >⑂</BaseButton>
      <BaseButton
        v-if="step.type === 'element_branch' && step.children?.length === 1 && !step.elseChildren?.length"
        class="step-card__btn step-card__btn--revert"
        title="还原为元素步骤"
        @click="$emit('revert-element-branch', step, index)"
      >↩</BaseButton>
      <BaseButton class="step-card__btn step-card__btn--del" @click="$emit('remove', index)">✖</BaseButton>
    </div>
  </div>
  <ConditionBranchView
    v-if="(step.type === 'condition' || step.type === 'element_branch') && expandedConditions.has(step.id)"
    :step="step"
    :step-type-labels="stepTypeLabels"
    :if-label="step.type === 'element_branch' ? '✅ 元素存在时' : undefined"
    :else-label="step.type === 'element_branch' ? '❌ 元素不存在时' : undefined"
    :branch-drop-target="branchDropTarget"
    @edit-branch="(condId, branch, child, ci) => $emit('edit-branch', condId, branch, child, ci)"
    @remove-branch="(condId, branch, ci) => $emit('remove-branch', condId, branch, ci)"
    @open-picker="(condId, branch) => $emit('open-picker', condId, branch)"
    @add-delay="(condId, branch) => $emit('add-branch-delay', condId, branch)"
    @add-call-flow="(condId, branch) => $emit('add-branch-call-flow', condId, branch)"
    @add-condition="(condId, branch) => $emit('add-branch-condition', condId, branch)"
    @add-save-data="(condId, branch) => $emit('add-branch-save-data', condId, branch)"
    @branch-dragover="(stepId, branch, idx) => $emit('branch-dragover', stepId, branch, idx)"
    @branch-drop="$emit('branch-drop')"
  />
</template>

<style scoped lang="scss">
.step-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: #313244;
  border-radius: 6px;
  padding: 8px 10px;
  border: 1px solid #45475a;
  margin: 2px 0;
}
.step-card--dragging { opacity: 0.4; }
.step-card__handle {
  flex-shrink: 0;
  width: 14px;
  color: #45475a;
  font-size: 13px;
  line-height: 1;
  cursor: grab;
  user-select: none;
  padding-top: 1px;
  letter-spacing: -1px;
  &:hover { color: #6c7086; }
}
.step-card__handle--grabbing { cursor: grabbing; }
.step-card__check { flex-shrink: 0; width: 14px; height: 14px; margin-top: 3px; cursor: pointer; accent-color: #89b4fa; }
.step-card__body { flex: 1; min-width: 0; }
.step-card__label { font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-card__type  { font-size: 11px; color: #89b4fa; margin-top: 2px; }
.step-card__cond-summary {
  margin-top: 3px; font-size: 10px; line-height: 1.5;
  code { font-family: 'Cascadia Code', monospace; color: #a6adc8; background: rgba(166, 173, 200, .08); padding: 1px 4px; border-radius: 2px; }
}
.step-card__cond-logic { color: #fab387; font-weight: 600; }
.step-card__broken { font-size: 11px; color: #f38ba8; margin-top: 2px; font-weight: 500; }
.step-card__actions { display: flex; gap: 4px; flex-shrink: 0; }
.step-card__btn {
  background: none;
  border: 1px solid #45475a;
  border-radius: 3px;
  color: #6c7086;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 5px;
  &:hover { color: #cdd6f4; border-color: #6c7086; }
  &:disabled { opacity: 0.3; cursor: default; }
  &--edit:hover   { color: #89b4fa; border-color: #89b4fa; }
  &--branch       { font-size: 9px; }
  &--branch:hover { color: #a6e3a1; border-color: #a6e3a1; }
  &--revert:hover { color: #fab387; border-color: #fab387; }
  &--del:hover    { color: #f38ba8; border-color: #f38ba8; }
}
.step-card__cond-toggle {
  background: none;
  border: 1px solid #45475a;
  border-radius: 3px;
  color: #6c7086;
  cursor: pointer;
  font-size: 10px;
  padding: 2px 6px;
  white-space: nowrap;
  margin-top: 4px;
  display: block;
  &:hover { color: #cdd6f4; border-color: #6c7086; }
}
.step-card__cond-count { color: #585b70; font-size: 10px; margin-left: 2px; }
</style>
