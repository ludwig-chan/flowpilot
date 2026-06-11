<script setup lang="ts">
import DropdownMenu from '@shared/components/DropdownMenu.vue'

withDefaults(defineProps<{
  context: 'root' | 'loop'
  label?:  string
  align?:  'left' | 'right'
}>(), {
  label: '＋ 添加步骤',
  align: 'left',
})

const emit = defineEmits<{
  (e: 'pick-element'):  void
  (e: 'add-condition'): void
  (e: 'add-call-flow'): void
  (e: 'add-save-data'): void
  (e: 'add-delay'):     void
}>()
</script>

<template>
  <DropdownMenu :align="align">
    <template #trigger="{ toggle, isOpen }">
      <BaseButton size="sm" @click="toggle">{{ label }} {{ isOpen ? '▴' : '▾' }}</BaseButton>
    </template>
    <template #default="{ close }">
      <BaseButton @click="emit('pick-element'); close()">选择元素</BaseButton>
      <BaseButton @click="emit('add-condition'); close()">条件判断</BaseButton>
      <BaseButton @click="emit('add-call-flow'); close()">嵌入流程</BaseButton>
      <BaseButton @click="emit('add-save-data'); close()">保存数据</BaseButton>
      <BaseButton @click="emit('add-delay'); close()">等待</BaseButton>
    </template>
  </DropdownMenu>
</template>

<style lang="scss" scoped>
</style>