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
      <BaseSelect
        :model-value="''"
        :options="tabs.map(t => ({ value: t.id!, label: t.title?.slice(0, 60) ?? t.url! }))"
        placeholder="选择目标 Tab…"
        @update:model-value="emit('confirm', $event as number)"
      />
    </div>
    <template #footer>
      <BaseButton variant="ghost" size="sm" @click="emit('cancel')">取消</BaseButton>
    </template>
  </BaseModal>
</template>

<style scoped lang="scss">
.tpm-body { padding: 16px 20px 8px; display: flex; flex-direction: column; gap: 10px; }
.tpm-hint { font-size: 12px; color: #6c7086; }
</style>
