<script setup lang="ts">
import { ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { StepDelayLevel } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import BaseModal from '@shared/components/BaseModal.vue'
import BaseButton from '@shared/components/BaseButton.vue'

const DELAY_LEVELS: { value: StepDelayLevel; label: string; hint?: string }[] = [
  { value: 'none',   label: '无' },
  { value: 'low',    label: '低',   hint: `${STEP_DELAY_PRESETS.low[0]}~${STEP_DELAY_PRESETS.low[1]} ms` },
  { value: 'medium', label: '中',   hint: `${STEP_DELAY_PRESETS.medium[0]}~${STEP_DELAY_PRESETS.medium[1]} ms` },
  { value: 'high',   label: '高',   hint: `${STEP_DELAY_PRESETS.high[0]}~${STEP_DELAY_PRESETS.high[1]} ms` },
  { value: 'custom', label: '自定义' },
]

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
const stepDelayRange = ref<[number, number]>(props.flow.stepDelayRange ?? [500, 2000])

function selectDelayLevel(level: StepDelayLevel) {
  if (level === 'none') {
    if (!confirm('不设置步骤间隔会导致操作极速触发，容易被网站风控识别和封号，确定要关闭间隔吗？')) return
  }
  stepDelayLevel.value = level
}

function onConfirm() {
  emit('confirm', {
    waitTimeout:    waitTimeout.value,
    stepDelayLevel: stepDelayLevel.value,
    stepDelayRange: stepDelayLevel.value === 'custom' ? stepDelayRange.value : undefined,
  })
}
</script>

<template>
  <BaseModal title="⚙ 流程设置" width="520px" :z-index="1200" @close="emit('close')">

    <div class="fs-modal__body">

      <!-- 元素超时 -->
      <div class="fs-modal__row">
        <span class="fs-modal__label">元素超时：</span>
        <input
          class="fs-modal__num-input"
          type="number" min="1000" step="1000"
          :value="waitTimeout"
          @change="waitTimeout = Number(($event.target as HTMLInputElement).value) || 10000"
        />
        <span class="fs-modal__unit">ms</span>
        <span class="fs-modal__hint">（等待元素出现的最长时间，超过则停止流程）</span>
      </div>

      <!-- 步骤间隔 -->
      <div class="fs-modal__row">
        <span class="fs-modal__label">步骤间隔：</span>
        <button
          v-for="lvl in DELAY_LEVELS"
          :key="lvl.value"
          :class="['delay-btn', {
            'delay-btn--active': stepDelayLevel === lvl.value,
            'delay-btn--danger': lvl.value === 'none' && stepDelayLevel === 'none',
          }]"
          :title="lvl.hint"
          @click="selectDelayLevel(lvl.value)"
        >{{ lvl.label }}</button>
        <span v-if="stepDelayLevel === 'none'" class="editor__delay-warn">⚠️ 不设置间隔可能被风控识别</span>
        <template v-if="stepDelayLevel !== 'none'">
          <span class="fs-modal__hint" v-if="stepDelayLevel !== 'custom'">
            {{ DELAY_LEVELS.find(l => l.value === stepDelayLevel)?.hint }}
          </span>
          <template v-else>
            <input
              class="fs-modal__num-input"
              type="number" min="0" step="100"
              placeholder="最小"
              :value="stepDelayRange[0]"
              @change="stepDelayRange = [Number(($event.target as HTMLInputElement).value), stepDelayRange[1]]"
            />
            <span class="editor__delay-tilde">~</span>
            <input
              class="fs-modal__num-input"
              type="number" min="0" step="100"
              placeholder="最大"
              :value="stepDelayRange[1]"
              @change="stepDelayRange = [stepDelayRange[0], Number(($event.target as HTMLInputElement).value)]"
            />
            <span class="fs-modal__unit">ms</span>
          </template>
        </template>
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
.fs-modal__num-input {
  width: 80px; background: $color-surface-1; border: 1px solid $color-surface-2; border-radius: $radius;
  color: $color-text; padding: 4px 6px; font-size: 12px; text-align: right;
  &:focus { outline: none; border-color: $color-blue; }
}
.fs-modal__unit { font-size: 12px; color: #a6adc8; }
.fs-modal__hint { font-size: 12px; color: #6c7086; flex: 1; }
</style>
