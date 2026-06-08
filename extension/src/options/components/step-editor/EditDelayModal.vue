<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  initialMs?: number
}>()

const emit = defineEmits<{
  (e: 'confirm', ms: number): void
  (e: 'cancel'): void
}>()

const ms = ref<number>(props.initialMs ?? 1000)

function confirm() {
  const v = Math.max(0, Number(ms.value) || 1000)
  emit('confirm', v)
}
</script>

<template>
  <BaseModal title="⏱ 等待时长" width="300px" :z-index="1200" @close="emit('cancel')">
    <div class="edm-body">
      <BaseNumberInput
        min="0"
        step="100"
        style="width: 120px"
        autofocus
        :modelValue="ms"
        @update:modelValue="ms = $event ?? ms"
        @keyup.enter="confirm"
      />
      <span class="edm-unit">ms</span>
    </div>
    <template #footer>
      <BaseButton @click="emit('cancel')">取消</BaseButton>
      <BaseButton kind="primary" @click="confirm">确认</BaseButton>
    </template>
  </BaseModal>
</template>

<style lang="scss" scoped>
.edm-body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
}

.edm-unit {
  font-size: 13px;
  color: $color-text-muted;
  white-space: nowrap;
}
</style>
