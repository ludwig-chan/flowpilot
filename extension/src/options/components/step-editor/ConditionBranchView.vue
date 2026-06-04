<script setup lang="ts">
import type { FlowStep } from '@shared/types/flow'
import type { BranchDropTarget } from '../../composables/useStepDrag'

withDefaults(defineProps<{
  step:              FlowStep
  stepTypeLabels:    Record<string, string>
  ifLabel?:          string
  elseLabel?:        string
  branchDropTarget?: BranchDropTarget | null
}>(), {
  ifLabel:           '✅ 条件成立时 (IF)',
  elseLabel:         '❌ 条件不成立时 (ELSE)',
  branchDropTarget:  null,
})

const emit = defineEmits<{
  (e: 'edit-branch',    condStepId: string, branch: 'if' | 'else', child: FlowStep, ci: number): void
  (e: 'remove-branch',  condStepId: string, branch: 'if' | 'else', ci: number): void
  (e: 'open-picker',    condStepId: string, branch: 'if' | 'else'): void
  (e: 'branch-dragover', stepId: string, branch: 'if' | 'else', insertIdx: number): void
  (e: 'branch-drop'): void
}>()
</script>

<template>
  <div class="cond-branches">
    <!-- IF 分支 -->
    <div class="cond-branch">
      <div class="cond-branch__header">
        <span class="cond-branch__label cond-branch__label--if">{{ ifLabel }}</span>
      </div>
      <div class="cond-branch__steps">
        <div
          v-if="!step.children?.length"
          class="cond-branch__empty"
          :class="{ 'cond-branch__empty--drop-active': branchDropTarget?.stepId === step.id && branchDropTarget?.branch === 'if' }"
          @dragover.prevent.stop="emit('branch-dragover', step.id, 'if', 0)"
          @drop.stop="emit('branch-drop')"
        >暂无步骤，可拖入</div>
        <template v-for="(child, ci) in step.children" :key="child.id">
          <div
            class="branch-insert-line"
            :class="{ 'branch-insert-line--active': branchDropTarget?.stepId === step.id && branchDropTarget?.branch === 'if' && branchDropTarget?.insertIdx === ci }"
            @dragover.prevent.stop="emit('branch-dragover', step.id, 'if', ci)"
            @drop.stop="emit('branch-drop')"
          />
          <div class="cond-child-card">
            <div class="cond-child-card__body">
              <span class="cond-child-card__type">{{ stepTypeLabels[child.type] ?? child.type }}</span>
              <span class="cond-child-card__label">{{ child.label }}</span>
              <span v-if="child.selector" class="cond-child-card__sel" :title="child.selector.cssSelector">{{ child.selector.cssSelector.slice(0, 50) }}</span>
            </div>
            <div class="cond-child-card__actions">
              <BaseButton v-if="child.selector" class="step-card__btn step-card__btn--edit" title="编辑" @click="emit('edit-branch', step.id, 'if', child, ci)">✎</BaseButton>
              <BaseButton class="step-card__btn step-card__btn--del" @click="emit('remove-branch', step.id, 'if', ci)">✖</BaseButton>
            </div>
          </div>
        </template>
        <div
          v-if="step.children?.length"
          class="branch-insert-line"
          :class="{ 'branch-insert-line--active': branchDropTarget?.stepId === step.id && branchDropTarget?.branch === 'if' && branchDropTarget?.insertIdx === (step.children?.length ?? 0) }"
          @dragover.prevent.stop="emit('branch-dragover', step.id, 'if', step.children?.length ?? 0)"
          @drop.stop="emit('branch-drop')"
        />
      </div>
      <BaseButton size="sm" class="cond-branch__add-btn" @click="emit('open-picker', step.id, 'if')">+ 选择元素</BaseButton>
    </div>
    <!-- ELSE 分支 -->
    <div class="cond-branch cond-branch--else">
      <div class="cond-branch__header">
        <span class="cond-branch__label cond-branch__label--else">{{ elseLabel }}</span>
      </div>
      <div class="cond-branch__steps">
        <div
          v-if="!step.elseChildren?.length"
          class="cond-branch__empty"
          :class="{ 'cond-branch__empty--drop-active': branchDropTarget?.stepId === step.id && branchDropTarget?.branch === 'else' }"
          @dragover.prevent.stop="emit('branch-dragover', step.id, 'else', 0)"
          @drop.stop="emit('branch-drop')"
        >暂无步骤，可拖入</div>
        <template v-for="(child, ci) in step.elseChildren" :key="child.id">
          <div
            class="branch-insert-line"
            :class="{ 'branch-insert-line--active': branchDropTarget?.stepId === step.id && branchDropTarget?.branch === 'else' && branchDropTarget?.insertIdx === ci }"
            @dragover.prevent.stop="emit('branch-dragover', step.id, 'else', ci)"
            @drop.stop="emit('branch-drop')"
          />
          <div class="cond-child-card">
            <div class="cond-child-card__body">
              <span class="cond-child-card__type">{{ stepTypeLabels[child.type] ?? child.type }}</span>
              <span class="cond-child-card__label">{{ child.label }}</span>
              <span v-if="child.selector" class="cond-child-card__sel" :title="child.selector.cssSelector">{{ child.selector.cssSelector.slice(0, 50) }}</span>
            </div>
            <div class="cond-child-card__actions">
              <BaseButton v-if="child.selector" class="step-card__btn step-card__btn--edit" title="编辑" @click="emit('edit-branch', step.id, 'else', child, ci)">✎</BaseButton>
              <BaseButton class="step-card__btn step-card__btn--del" @click="emit('remove-branch', step.id, 'else', ci)">✖</BaseButton>
            </div>
          </div>
        </template>
        <div
          v-if="step.elseChildren?.length"
          class="branch-insert-line"
          :class="{ 'branch-insert-line--active': branchDropTarget?.stepId === step.id && branchDropTarget?.branch === 'else' && branchDropTarget?.insertIdx === (step.elseChildren?.length ?? 0) }"
          @dragover.prevent.stop="emit('branch-dragover', step.id, 'else', step.elseChildren?.length ?? 0)"
          @drop.stop="emit('branch-drop')"
        />
      </div>
      <BaseButton size="sm" class="cond-branch__add-btn" @click="emit('open-picker', step.id, 'else')">+ 选择元素</BaseButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/* 条件分支展开面板 */
.cond-branches {
  border: 1px solid #313244; border-top: none;
  border-radius: 0 0 6px 6px; margin-bottom: 4px; overflow: hidden;
}
.cond-branch {
  padding: 8px 12px; border-bottom: 1px solid #252535;
  &:last-child { border-bottom: none; }
  &--else { background: rgba(243,139,168,.04); }
  &__header { display: flex; align-items: center; margin-bottom: 6px; }
  &__label { font-size: 11px; font-weight: 700; }
  &__label--if   { color: #a6e3a1; }
  &__label--else { color: #f38ba8; }
  &__steps { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
  &__empty {
    font-size: 11px; color: #585b70; padding: 2px 0;
    &--drop-active { color: #89b4fa; background: rgba(137, 180, 250, 0.1); border-radius: 3px; padding: 4px 8px; }
  }
  &__add-btn { align-self: flex-start; }
}
.branch-insert-line {
  height: 2px; background: transparent; border-radius: 1px; transition: background 0.15s;
  &--active { background: #89b4fa; }
}
.cond-child-card {
  display: flex; align-items: center; gap: 6px;
  background: #181825; border: 1px solid #313244; border-radius: 4px; padding: 5px 8px;
  &__body { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  &__type {
    font-size: 10px; font-weight: 700; color: #6c7086;
    background: #313244; padding: 1px 4px; border-radius: 3px; white-space: nowrap; flex-shrink: 0;
  }
  &__label { font-size: 11px; color: #cdd6f4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__sel {
    font-size: 10px; color: #585b70; font-family: 'Cascadia Code', monospace;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; flex-shrink: 0;
  }
  &__actions { display: flex; gap: 3px; flex-shrink: 0; }
}
</style>
