<script setup lang="ts">
defineProps<{
  tabs: chrome.tabs.Tab[]
}>()

const emit = defineEmits<{
  (e: 'confirm', tabId: number): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <BaseModal title="🌐 选择目标 Tab" width="460px" @close="emit('cancel')">
    <div class="tpm-body">
      <p class="tpm-hint">当前操作需要目标页面，请选择一个 Tab 后继续</p>
      <select
        class="tab-select tpm-select"
        @change="e => emit('confirm', Number((e.target as HTMLSelectElement).value))"
      >
        <option value="" disabled selected>选择目标 Tab…</option>
        <option v-for="tab in tabs" :key="tab.id" :value="tab.id">
          {{ tab.title?.slice(0, 60) ?? tab.url }}
        </option>
      </select>
    </div>
    <template #footer>
      <BaseButton variant="ghost" size="sm" @click="emit('cancel')">取消</BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped lang="scss">
.tpm-body { padding: 16px 20px 8px; display: flex; flex-direction: column; gap: 10px; }
.tpm-hint { font-size: 12px; color: #6c7086; }
.tpm-select { width: 100%; }
</style>
