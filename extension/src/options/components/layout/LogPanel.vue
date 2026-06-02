<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  logs:    string[]
  running: boolean
}>()

const logEl = ref<HTMLElement | null>(null)
watch(() => props.logs.length, async () => {
  await nextTick()
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight
})
</script>

<template>
  <div class="log-panel">
    <div class="log-panel__body" ref="logEl">
      <div v-if="logs.length === 0" class="log-panel__empty">暂无日志</div>
      <div v-for="(line, i) in logs" :key="i" class="log-panel__line">
        {{ line }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.log-panel {
  display: flex; flex-direction: column; height: 100%; min-height: 0;

  &__body {
    flex: 1; overflow-y: auto; padding: 6px 8px;
    font-family: 'Cascadia Code', 'Consolas', monospace; font-size: 12px; color: #cdd6f4;
  }

  &__empty { color: #6c7086; font-style: italic; }

  &__line {
    padding: 1px 0; line-height: 1.5;
    &:last-child { color: #a6e3a1; }
  }
}

@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
</style>
