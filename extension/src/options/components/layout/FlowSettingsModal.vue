<script setup lang="ts">
import { ref, computed } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { StepDelayLevel } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'

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
const stepDelayRange = ref<[number, number]>(
  props.flow.stepDelayRange ??
  STEP_DELAY_PRESETS[props.flow.stepDelayLevel as 'low' | 'medium' | 'high'] ??
  STEP_DELAY_PRESETS.medium
)

const enabled = computed(() => stepDelayLevel.value !== 'none')

const activePreset = computed<'low' | 'medium' | 'high' | null>(() =>
  (['low', 'medium', 'high'] as const).includes(stepDelayLevel.value as any)
    ? stepDelayLevel.value as 'low' | 'medium' | 'high'
    : null
)

function toggleEnabled(val: boolean) {
  if (!val) {
    if (!confirm('不设置步骤间隔会导致操作极速触发，容易被网站风控识别和封号，确定要关闭间隔吗？')) return
    stepDelayLevel.value = 'none'
  } else {
    stepDelayLevel.value = 'medium'
    stepDelayRange.value = STEP_DELAY_PRESETS.medium
  }
}

function selectPreset(preset: 'low' | 'medium' | 'high') {
  stepDelayLevel.value = preset
  stepDelayRange.value = [...STEP_DELAY_PRESETS[preset]]
}

function onRangeChange(side: 'min' | 'max', val: number) {
  stepDelayLevel.value = 'custom'
  stepDelayRange.value = side === 'min'
    ? [val, stepDelayRange.value[1]]
    : [stepDelayRange.value[0], val]
}

function onConfirm() {
  emit('confirm', {
    waitTimeout:    waitTimeout.value,
    stepDelayLevel: stepDelayLevel.value,
    stepDelayRange: stepDelayLevel.value !== 'none' ? stepDelayRange.value : undefined,
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
      <div class="fs-modal__field">
        <div class="fs-modal__row">
          <span class="fs-modal__label">步骤间隔：</span>
          <div class="delay-toggle">
            <button
              :class="['delay-toggle__btn', !enabled && 'delay-toggle__btn--danger']"
              @click="toggleEnabled(false)"
            >关闭</button>
            <button
              :class="['delay-toggle__btn', enabled && 'delay-toggle__btn--active']"
              @click="toggleEnabled(true)"
            >启用</button>
          </div>
        </div>

        <div v-if="enabled" class="delay-sub">
          <div class="fs-modal__row">
            <span class="fs-modal__label">快捷档位：</span>
            <div class="delay-presets">
              <button
                v-for="p in (['low', 'medium', 'high'] as const)"
                :key="p"
                :class="['delay-preset-btn', activePreset === p && 'delay-preset-btn--active']"
                @click="selectPreset(p)"
              >{{ p === 'low' ? '低' : p === 'medium' ? '中' : '高' }}</button>
            </div>
          </div>
          <div class="fs-modal__row delay-range">
            <span class="fs-modal__label">延迟范围：</span>
            <input
              class="fs-modal__num-input"
              type="number" min="0" step="100"
              :value="stepDelayRange[0]"
              @change="onRangeChange('min', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="fs-modal__unit">~</span>
            <input
              class="fs-modal__num-input"
              type="number" min="0" step="100"
              :value="stepDelayRange[1]"
              @change="onRangeChange('max', Number(($event.target as HTMLInputElement).value))"
            />
            <span class="fs-modal__unit">ms</span>
          </div>
        </div>

        <div v-else class="delay-warn">⚠ 不设置间隔可能被风控识别</div>
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

.fs-modal__field {
  display: flex; flex-direction: column; gap: 8px;
}

// 关闭 / 启用 开关
.delay-toggle {
  display: inline-flex;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  overflow: hidden;
}
.delay-toggle__btn {
  padding: 4px 14px;
  border: none;
  border-right: 1px solid $color-surface-2;
  background: $color-surface-1;
  color: $color-text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:last-child { border-right: none; }
  &:hover:not(.delay-toggle__btn--active):not(.delay-toggle__btn--danger) {
    background: $color-surface-2;
  }
  &--active {
    background: $color-focus-bg;
    color: $color-blue;
    border-right-color: $color-blue;
  }
  &--danger {
    background: $color-danger-bg;
    color: $color-red;
  }
}

// 启用后的子区域
.delay-sub {
  display: flex; flex-direction: column; gap: 8px;
  padding-left: 78px;
}

// 低 / 中 / 高 快捷档位
.delay-presets {
  display: inline-flex;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  overflow: hidden;
}
.delay-preset-btn {
  padding: 4px 14px;
  border: none;
  border-right: 1px solid $color-surface-2;
  background: $color-surface-1;
  color: $color-text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &:last-child { border-right: none; }
  &:hover:not(.delay-preset-btn--active) { background: $color-surface-2; color: $color-text; }
  &--active {
    background: $color-focus-bg;
    color: $color-blue;
  }
}

// 范围输入行
.delay-range { gap: 6px; }

// 关闭时警告
.delay-warn {
  padding-left: 78px;
  font-size: 12px;
  color: $color-red;
}
</style>
