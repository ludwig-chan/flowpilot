<script setup lang="ts">
withDefaults(defineProps<{
  modelValue: boolean | 'indeterminate'
  disabled?:  boolean
}>(), {
  disabled: false,
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()
</script>

<template>
  <input
    type="checkbox"
    class="base-checkbox"
    :checked="modelValue === true"
    :indeterminate="modelValue === 'indeterminate'"
    :disabled="disabled"
    @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
  />
</template>

<style lang="scss" scoped>
@use '@shared/styles/tokens' as *;

.base-checkbox {
  flex-shrink: 0;
  cursor: pointer;
  accent-color: $color-blue;
  width: 14px;
  height: 14px;

  &:disabled { cursor: default; opacity: 0.4; }
}
</style>
