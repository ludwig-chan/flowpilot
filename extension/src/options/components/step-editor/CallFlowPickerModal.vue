<script setup lang="ts">
import { ref } from 'vue'

interface FlowOption {
  id:   string
  name: string
}

const props = defineProps<{
  flows: FlowOption[]
}>()

const emit = defineEmits<{
  (e: 'confirm', id: string): void
  (e: 'cancel'): void
}>()

const selectedId = ref(props.flows[0]?.id ?? '')
</script>

<template>
  <BaseModal title="▶ 嵌入流程" width="360px" :z-index="1200" @close="emit('cancel')">
    <div class="cfp-body">
      <BaseSelect v-model="selectedId" :options="flows.map(f => ({ value: f.id, label: f.name }))" style="width: 100%">
      </BaseSelect>
    </div>
    <template #footer>
      <BaseButton @click="emit('cancel')">取消</BaseButton>
      <BaseButton kind="primary" :disabled="!selectedId" @click="emit('confirm', selectedId)">确认嵌入</BaseButton>
    </template>
  </BaseModal>
</template>

<style lang="scss" scoped>
.cfp-body {
  padding: 12px;
}
</style>
