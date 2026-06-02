<script setup lang="ts">
import { ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { StepDelayLevel } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'

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
  <div class="fs-overlay" @click.self="emit('close')">
    <div class="fs-modal">

      <div class="fs-modal__header">
        <span class="fs-modal__title">⚙ 流程设置</span>
        <button class="btn btn--ghost btn--icon" @click="emit('close')">✖</button>
      </div>

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

      <div class="fs-modal__footer">
        <button class="btn" @click="emit('close')">取消</button>
        <button class="btn btn--primary" @click="onConfirm">确认</button>
      </div>

    </div>
  </div>
</template>

<style lang="scss" scoped>
.fs-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center;
}

.fs-modal {
  width: 520px; max-width: 92vw;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; overflow: hidden;

  &__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 16px; border-bottom: 1px solid #313244; flex-shrink: 0;
  }
  &__title { font-weight: 700; font-size: 14px; color: #cdd6f4; }

  &__body {
    padding: 16px; display: flex; flex-direction: column; gap: 14px;
  }
  &__row {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
  }
  &__label {
    font-size: 12px; color: #a6adc8; white-space: nowrap; min-width: 72px; flex-shrink: 0;
  }
  &__num-input {
    width: 80px; background: #313244; border: 1px solid #45475a; border-radius: 4px;
    color: #cdd6f4; padding: 4px 6px; font-size: 12px; text-align: right;
    &:focus { outline: none; border-color: #89b4fa; }
  }
  &__unit { font-size: 12px; color: #a6adc8; }
  &__hint { font-size: 12px; color: #6c7086; flex: 1; }

  &__footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 12px 16px; border-top: 1px solid #313244; flex-shrink: 0;
  }
}
</style>
