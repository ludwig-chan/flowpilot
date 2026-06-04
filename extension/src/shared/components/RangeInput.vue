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
  allowEmpty?:     boolean
  placeholderMin?: string
  placeholderMax?: string
}>(), {
  unit:           'ms',
  step:           100,
  allowEmpty:     false,
  placeholderMin: '',
  placeholderMax: '',
})

const emit = defineEmits<{
  (e: 'update:modelValue', v: [number | undefined, number | undefined]): void
}>()

const activePreset = computed<RangePreset | null>(() => {
  const [min, max] = props.modelValue
  if (min === undefined || max === undefined) return null
  return props.presets?.find(p => p.value[0] === min && p.value[1] === max) ?? null
})

function onMinChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  emit('update:modelValue', [
    val === '' ? (props.allowEmpty ? undefined : 0) : Number(val),
    props.modelValue[1],
  ])
}

function onMaxChange(e: Event) {
  const val = (e.target as HTMLInputElement).value
  emit('update:modelValue', [
    props.modelValue[0],
    val === '' ? (props.allowEmpty ? undefined : 0) : Number(val),
  ])
}

function selectPreset(p: RangePreset) {
  emit('update:modelValue', [...p.value])
}
</script>

<template>
  <div class="ri">
    <input
      class="ri__num"
      type="number" min="0" :step="step"
      :value="modelValue[0] ?? ''"
      :placeholder="placeholderMin"
      @change="onMinChange"
    />
    <span class="ri__sep">~</span>
    <input
      class="ri__num"
      type="number" min="0" :step="step"
      :value="modelValue[1] ?? ''"
      :placeholder="placeholderMax"
      @change="onMaxChange"
    />
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

  &__num {
    width: 72px;
    background: $color-surface-1; border: 1px solid $color-surface-2;
    border-radius: $radius; color: $color-text;
    padding: 4px 6px; font-size: 12px; text-align: right;
    &:focus { outline: none; border-color: $color-blue; }
  }

  &__sep, &__unit { font-size: 12px; color: $color-text-muted; flex-shrink: 0; }

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
