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
  (e: 'add-delay'):     void
}>()
</script>

<template>
  <DropdownMenu :align="align">
    <template #trigger="{ toggle, isOpen }">
      <BaseButton size="sm" @click="toggle">{{ label }} {{ isOpen ? '▴' : '▾' }}</BaseButton>
    </template>
    <template #default="{ close }">
      <button class="asm-item" @click="emit('pick-element'); close()">🖱 选择元素</button>
      <button class="asm-item" @click="emit('add-condition'); close()">🔀 条件判断</button>
      <button class="asm-item" @click="emit('add-call-flow'); close()">▶ 嵌入流程</button>
      <button class="asm-item" @click="emit('add-delay'); close()">⏱ 等待</button>
    </template>
  </DropdownMenu>
</template>

<style lang="scss" scoped>
.asm-item {
  background: none;
  border: none;
  color: $color-text;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: $radius;
  text-align: left;
  font-size: 12px;
  white-space: nowrap;
  width: 100%;
  &:hover { background: $color-surface-2; }
}
</style>
