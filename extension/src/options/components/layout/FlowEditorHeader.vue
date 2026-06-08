<script setup lang="ts">
import type { LocalFlow } from '../stores/useFlowStore'

const props = defineProps<{
  flow:          LocalFlow
  estimatedTime: string | null
  running:       boolean
  stopping:      boolean
}>()

const emit = defineEmits<{
  (e: 'save'): void
  (e: 'open-settings'): void
  (e: 'run'): void
  (e: 'stop'): void
}>()

</script>

<template>
  <div class="editor__header">
    <div class="editor__header-row">
      <span class="editor__name-display">{{ flow.name }}</span>
      <span v-if="estimatedTime" class="editor__est-time">⏱ {{ estimatedTime }}</span>
      <BaseButton title="设置" @click="emit('open-settings')">设置</BaseButton>
      <BaseButton title="保存" kind="primary" @click="emit('save')">保存</BaseButton>
      <BaseButton
        :title="stopping ? '停止中' : running ? '停止' : '运行'"
        :kind="running ? 'danger' : 'primary'"
        :loading="stopping"
        @click="running && !stopping ? emit('stop') : !running ? emit('run') : undefined"
      >{{ stopping ? '停止中' : running ? '停止' : '运行' }}</BaseButton>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.editor__header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.editor__header-row {
  display: flex; align-items: center; gap: 8px;
}
.editor__est-time { font-size: 11px; color: #cdd6f4; margin-right: 4px; }
.editor__name-display { flex: 1; font-size: 14px; font-weight: 600; color: #cdd6f4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.editor__delay-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.editor__delay-label { font-size: 12px; color: #a6adc8; white-space: nowrap; }
.editor__delay-unit { font-size: 12px; color: #a6adc8; }
</style>
