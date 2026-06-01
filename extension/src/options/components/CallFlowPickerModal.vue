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
  <div class="call-flow-overlay" @click.self="emit('cancel')">
    <div class="call-flow-modal">
      <div class="call-flow-modal__header">
        <span class="call-flow-modal__title">▶ 嵌入流程</span>
        <button class="btn btn--ghost" @click="emit('cancel')">✖</button>
      </div>
      <div class="call-flow-modal__body">
        <select v-model="selectedId" class="tab-select" style="width: 100%">
          <option v-for="f in flows" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <div class="call-flow-modal__footer">
          <button class="btn" @click="emit('cancel')">取消</button>
          <button class="btn btn--primary" :disabled="!selectedId" @click="emit('confirm', selectedId)">确认嵌入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.call-flow-overlay {
  position: fixed; inset: 0; z-index: 1200;
  background: rgba(0, 0, 0, .55);
  display: flex; align-items: center; justify-content: center;
}
.call-flow-modal {
  width: 360px; max-width: 92vw;
  background: #1e1e2e; border: 1px solid #45475a; border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .5);
  display: flex; flex-direction: column; overflow: hidden;
  &__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; border-bottom: 1px solid #313244;
  }
  &__title { font-size: 13px; font-weight: 600; color: #cdd6f4; }
  &__body { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
  &__footer { display: flex; gap: 8px; justify-content: flex-end; }
}
</style>
