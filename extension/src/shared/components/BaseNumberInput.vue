<script setup lang="ts">
defineProps<{
  modelValue?: number
}>()

defineEmits<{
  (e: 'update:modelValue', v: number | undefined): void
}>()

defineOptions({ inheritAttrs: false })
</script>

<template>
  <input
    class="num-input"
    type="number"
    :value="modelValue ?? ''"
    v-bind="$attrs"
    @change="$emit('update:modelValue', ($event.target as HTMLInputElement).value === '' ? undefined : Number(($event.target as HTMLInputElement).value))"
  />
</template>

<style lang="scss" scoped>
.num-input {
  background: $color-surface-1;
  border: 1px solid $color-surface-2;
  border-radius: $radius;
  color: $color-text;
  padding: 4px 8px;
  font-size: 12px;
  text-align: right;

  &:focus {
    outline: none;
    border-color: $color-blue;
  }

  // 隐藏上下箭头（Chrome/Safari/Edge）
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  // 隐藏上下箭头（Firefox）
  -moz-appearance: textfield;
}
</style>
