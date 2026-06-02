<script setup lang="ts">
defineProps<{
  modelValue?: string | number
}>()

defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

defineOptions({ inheritAttrs: false })
</script>

<template>
  <input
    class="input"
    :value="modelValue"
    v-bind="$attrs"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
