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
  <BaseModal title="编辑选择列表" width="500px" :z-index="1070" @close="emit('close')">
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
      <label class="elm-label">项内目标</label>
      <div class="elm-selector-row">
        <code class="elm-selector-val" :title="step.itemTargetRelativeSelector || step.itemTargetSelector?.cssSelector">
          {{ step.itemTargetRelativeSelector || step.itemTargetSelector?.cssSelector || '默认点击整项' }}
        </code>
        <BaseButton
          class="elm-resel-btn"
          :disabled="!step.selector?.cssSelector"
          @click="emit('reselect-target', currentState())"
        >选择第一项内元素</BaseButton>
        <BaseButton
          v-if="step.itemTargetSelector || step.itemTargetRelativeSelector"
          class="elm-resel-btn"
          @click="clearItemTarget"
        >清除</BaseButton>
      </div>
      <p class="elm-hint">选择头像、按钮等第一项内的元素后，循环会在每一项里找到对应元素。</p>
    </div>

    <div class="elm-section">
      <label class="elm-label">项内动作</label>
      <div class="elm-selector-row">
        <code class="elm-selector-val" :title="step.itemAction?.label || step.itemAction?.type || '点击'">
          {{ step.itemAction?.label || '点击' }}
        </code>
        <BaseButton
          class="elm-resel-btn"
          :disabled="!step.itemTargetSelector && !step.itemTargetRelativeSelector"
          @click="emit('configure-action', currentState())"
        >选择动作</BaseButton>
      </div>
      <p class="elm-hint">默认点击目标元素；也可以改为聚焦、输入、获取文字、截图等动作。</p>
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
</style>
