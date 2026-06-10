<script setup lang="ts">
import type { FlowStep } from '@shared/types/flow'

const props = defineProps<{
  step: FlowStep
}>()

const emit = defineEmits<{
  (e: 'save',                 step: FlowStep): void
  (e: 'close'):                                void
  (e: 'reselect',             currentState: FlowStep): void
  (e: 'reselect-target',      currentState: FlowStep): void
  (e: 'configure-action',     currentState: FlowStep): void
}>()

function autoLabel(step: FlowStep): string {
  const selector = step.selector?.cssSelector
  return selector ? `逐项点击列表：${selector.slice(0, 40)}` : '逐项点击列表'
}

function currentState(): FlowStep {
  return {
    ...props.step,
    label:    autoLabel(props.step),
    children: props.step.children ?? [],
  }
}

function onSave() {
  emit('save', currentState())
}

function clearItemTarget() {
  props.step.itemTargetSelector = undefined
  props.step.itemTargetRelativeSelector = undefined
  props.step.itemAction = undefined
}
</script>

<template>
  <BaseModal title="编辑选择列表" width="680px" :z-index="1070" @close="emit('close')">
    <div class="elm-section">
      <label class="elm-label">选择列表</label>
      <div class="elm-selector-row">
        <code class="elm-selector-val" :title="step.selector?.cssSelector">
          {{ step.selector?.cssSelector || '（未设置）' }}
        </code>
        <BaseButton class="elm-resel-btn" @click="emit('reselect', currentState())">重新选择</BaseButton>
      </div>
    </div>

    <div class="elm-section">
      <label class="elm-label">项内目标与动作</label>
      <div class="elm-item-row">
        <div class="elm-inline-field elm-inline-field--target">
          <span class="elm-inline-label">目标</span>
          <code class="elm-selector-val" :title="step.itemTargetRelativeSelector || step.itemTargetSelector?.cssSelector">
            {{ step.itemTargetRelativeSelector || step.itemTargetSelector?.cssSelector || '默认整项' }}
          </code>
          <BaseButton
            class="elm-resel-btn"
            :disabled="!step.selector?.cssSelector"
            @click="emit('reselect-target', currentState())"
          >选元素</BaseButton>
          <BaseButton
            v-if="step.itemTargetSelector || step.itemTargetRelativeSelector"
            class="elm-resel-btn"
            @click="clearItemTarget"
          >清除</BaseButton>
        </div>
        <div class="elm-inline-field elm-inline-field--action">
          <span class="elm-inline-label">动作</span>
          <code class="elm-action-val" :title="step.itemAction?.label || step.itemAction?.type || '点击'">
            {{ step.itemAction?.label || '点击' }}
          </code>
          <BaseButton
            class="elm-resel-btn"
            :disabled="!step.itemTargetSelector && !step.itemTargetRelativeSelector"
            @click="emit('configure-action', currentState())"
          >选择动作</BaseButton>
        </div>
      </div>
      <p class="elm-hint">选择第一项内的元素后，循环会在每一项里找到对应元素，并执行所选动作。</p>
    </div>

    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton kind="primary" @click="onSave">保存</BaseButton>
    </template>
  </BaseModal>
</template>

<style lang="scss" scoped>
.elm-section {
  padding: 14px;
  border-bottom: 1px solid #1a1a28;
}

.elm-label {
  display: block;
  font-size: 11px;
  color: $color-text-muted;
  margin-bottom: 8px;
  font-weight: 600;
}

.elm-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.elm-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, 0.52fr);
  gap: 10px;
  align-items: center;
}

.elm-inline-field {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.elm-inline-field--action {
  padding-left: 10px;
  border-left: 1px solid #313244;
}

.elm-inline-label {
  flex-shrink: 0;
  font-size: 11px;
  color: $color-text-muted;
  font-weight: 600;
}

.elm-selector-val {
  flex: 1;
  min-width: 0;
  font-family: 'Cascadia Code', monospace;
  font-size: 11px;
  color: $color-green;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.elm-action-val {
  flex: 1;
  min-width: 64px;
  font-family: 'Cascadia Code', monospace;
  font-size: 11px;
  color: $color-green;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.elm-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: $color-text-muted;
  line-height: 1.5;
}

.elm-resel-btn {
  font-size: 11px;
  padding: 3px 10px;
  flex-shrink: 0;
}

@media (max-width: 620px) {
  .elm-item-row {
    grid-template-columns: 1fr;
  }

  .elm-inline-field--action {
    padding-left: 0;
    border-left: 0;
  }
}
</style>
