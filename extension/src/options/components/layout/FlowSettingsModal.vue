<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { StepDelayLevel } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import RangeInput from '@shared/components/RangeInput.vue'

const props = defineProps<{ flow: LocalFlow }>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: {
    waitTimeout:    number
    stepDelayLevel: StepDelayLevel
    stepDelayRange: [number, number] | undefined
  }): void
}>()

const waitTimeout    = ref(props.flow.waitTimeout ?? 10000)
const stepDelayLevel = ref<StepDelayLevel>(props.flow.stepDelayLevel ?? 'medium')
const stepDelayRange = ref<[number | undefined, number | undefined]>(
  props.flow.stepDelayLevel === 'none'
    ? [undefined, undefined]
    : (props.flow.stepDelayRange ??
        STEP_DELAY_PRESETS[props.flow.stepDelayLevel as 'low' | 'medium' | 'high'] ??
        STEP_DELAY_PRESETS.medium)
)

const isRangeEmpty = computed(() =>
  stepDelayRange.value[0] === undefined && stepDelayRange.value[1] === undefined
)

function clearRange() {
  stepDelayRange.value = [undefined, undefined]
  stepDelayLevel.value = 'none'
}

function onDelayRangeChange(range: [number | undefined, number | undefined]) {
  stepDelayRange.value = range
  if (range[0] === undefined && range[1] === undefined) {
    stepDelayLevel.value = 'none'
    return
  }
  const matched = (Object.keys(STEP_DELAY_PRESETS) as Array<'low' | 'medium' | 'high'>)
    .find(k => STEP_DELAY_PRESETS[k][0] === range[0] && STEP_DELAY_PRESETS[k][1] === range[1])
  stepDelayLevel.value = matched ?? 'custom'
}

function onConfirm() {
  emit('confirm', {
    waitTimeout:    waitTimeout.value,
    stepDelayLevel: stepDelayLevel.value,
    stepDelayRange: isRangeEmpty.value ? undefined : stepDelayRange.value as [number, number],
  })
}
</script>

<template>
  <BaseModal title="⚙ 流程设置" width="520px" :z-index="1200" @close="emit('close')">

    <div class="fs-modal__body">

      <!-- 元素超时 -->
      <div class="fs-modal__row">
        <span class="fs-modal__label">元素超时：</span>
        <BaseNumberInput
          min="1000" step="1000"
          style="width: 90px"
          :modelValue="waitTimeout"
          @update:modelValue="waitTimeout = $event || 10000"
        />
        <span class="fs-modal__unit">ms</span>
        <span class="fs-modal__hint">（等待元素出现的最长时间，超过则停止流程）</span>
      </div>

      <!-- 步骤间隔 -->
      <div class="fs-modal__field">
        <div class="fs-modal__row">
          <span class="fs-modal__label">步骤间隔：</span>
          <RangeInput
            :model-value="stepDelayRange"
            :multiplier="100"
            :allow-empty="true"
            :presets="[
              { label: '低', value: STEP_DELAY_PRESETS.low },
              { label: '中', value: STEP_DELAY_PRESETS.medium },
              { label: '高', value: STEP_DELAY_PRESETS.high },
            ]"
            @update:model-value="onDelayRangeChange"
          />
          <button v-if="!isRangeEmpty" class="delay-clear" title="清空间隔" @click="clearRange">✕</button>
        </div>
        <span v-if="isRangeEmpty" class="delay-warn">⚠ 不设置间隔可能被风控识别</span>
      </div>

    </div>

    <template #footer>
      <BaseButton @click="emit('close')">取消</BaseButton>
      <BaseButton variant="primary" @click="onConfirm">确认</BaseButton>
    </template>

  </BaseModal>
</template>

<style lang="scss" scoped>
.fs-modal__body {
  padding: 16px; display: flex; flex-direction: column; gap: 14px;
}
.fs-modal__row {
  display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
}
.fs-modal__label {
  font-size: 12px; color: #a6adc8; white-space: nowrap; min-width: 72px; flex-shrink: 0;
}
.fs-modal__unit { font-size: 12px; color: #a6adc8; }
.fs-modal__hint { font-size: 12px; color: #6c7086; flex: 1; }

.fs-modal__field {
  display: flex; flex-direction: column; gap: 8px;
}

// 清空间隔按钮
.delay-clear {
  border: none; background: transparent;
  color: $color-text-muted; font-size: 11px;
  padding: 2px 4px; cursor: pointer; line-height: 1;
  border-radius: $radius; flex-shrink: 0;
  transition: color 0.15s;
  &:hover { color: $color-red; }
}

// 清空时警告
.delay-warn {
  padding-left: 4px;
  font-size: 12px;
  color: $color-red;
}
</style>
