<script setup lang="ts">
import { computed } from 'vue'

export interface RangePreset {
  label: string
  value: [number, number]
}

const props = withDefaults(defineProps<{
  modelValue:      [number | undefined, number | undefined]
  presets?:        RangePreset[]
  unit?:           string
  step?:           number
  multiplier?:     number
  allowEmpty?:     boolean
  placeholderMin?: string
  placeholderMax?: string
}>(), {
  unit:           'ms',
  step:           100,
  multiplier:     1,
  allowEmpty:     false,
  placeholderMin: '',
  placeholderMax: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: [number | undefined, number | undefined]): void
}>()

// e.g. multiplier=100 → suffix="00"
const suffix = computed(() => {
  if (props.multiplier <= 1) return ''
  return '0'.repeat(String(props.multiplier).length - 1)
})

const displayStep = computed(() => Math.max(1, Math.round(props.step / props.multiplier)))

const inputWidth = computed(() => {
  if (props.multiplier >= 100) return '36px'
  if (props.multiplier >= 10)  return '52px'
  return '68px'
})

function toDisplay(v: number | undefined): string {
  if (v === undefined) return ''
  return String(Math.round(v / props.multiplier))
}

const activePreset = computed<RangePreset | null>(() => {
  const [min, max] = props.modelValue
  if (min === undefined || max === undefined) return null
  return props.presets?.find(p => p.value[0] === min && p.value[1] === max) ?? null
})

function onMinChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  const raw = val === '' ? (props.allowEmpty ? undefined : 0) : Number(val) * props.multiplier
  emit('update:modelValue', [raw, props.modelValue[1]])
}

function onMaxChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  const raw = val === '' ? (props.allowEmpty ? undefined : 0) : Number(val) * props.multiplier
  emit('update:modelValue', [props.modelValue[0], raw])
}

function selectPreset(p: RangePreset) {
  emit('update:modelValue', [...p.value])
}
</script>

<template>
  <div class="ri">
    <div class="ri__box">
      <input
        class="ri__num"
        type="number" min="0" :step="displayStep"
        :style="{ width: inputWidth }"
        :value="toDisplay(modelValue[0])"
        :placeholder="placeholderMin"
        @change="onMinChange"
      />
      <span class="ri__sep">~</span>
      <input
        class="ri__num"
        type="number" min="0" :step="displayStep"
        :style="{ width: inputWidth }"
        :value="toDisplay(modelValue[1])"
        :placeholder="placeholderMax"
        @change="onMaxChange"
      />
      <span v-if="suffix" class="ri__suffix">{{ suffix }}</span>
    </div>
    <span class="ri__unit">{{ unit }}</span>
    <div v-if="presets?.length" class="ri__presets">
      <button
        v-for="p in presets" :key="p.label" type="button"
        :class="['ri__btn', activePreset === p && 'ri__btn--active']"
        @click="selectPreset(p)"
      >{{ p.label }}</button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ri {
  display: flex; align-items: center; gap: 6px;

  &__box {
    display: flex; align-items: center; gap: 2px;
    padding: 0 8px;
    background: $color-surface-1;
    border: 1px solid $color-surface-2;
    border-radius: $radius;
    &:focus-within { border-color: $color-blue; }
  }

  &__num {
    background: transparent;
    border: none;
    color: $color-text;
    padding: 4px 0;
    font-size: 12px;
    text-align: right;
    &:focus { outline: none; }
    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    -moz-appearance: textfield;
  }

  &__sep    { font-size: 12px; color: $color-text-muted; flex-shrink: 0; padding: 0 2px; }
  &__suffix { font-size: 12px; color: $color-text-muted; flex-shrink: 0; }
  &__unit   { font-size: 12px; color: $color-text-muted; flex-shrink: 0; }

  &__presets {
    display: inline-flex; margin-left: 2px;
    border: 1px solid $color-surface-2; border-radius: $radius; overflow: hidden;
  }

  &__btn {
    padding: 3px 10px; border: none;
    border-right: 1px solid $color-surface-2;
    background: $color-surface-1; color: $color-text-secondary;
    font-size: 11px; cursor: pointer;
    transition: background 0.15s, color 0.15s;
    &:last-child { border-right: none; }
    &:hover:not(.ri__btn--active) { background: $color-surface-2; color: $color-text; }
    &--active { background: $color-focus-bg; color: $color-blue; }
  }
}
</style>
