<script setup lang="ts">
import LogPanel from './LogPanel.vue'

const props = defineProps<{
  logs: string[]
  running: boolean
  logDrawerHeight: number
  startLogResize: (e: MouseEvent) => void
}>()

const emit = defineEmits<{
  'update:logs': [logs: string[]]
}>()

const open = defineModel<boolean>('open', { default: false })

function copyLogs() {
  navigator.clipboard.writeText(props.logs.join('\n'))
}

function clearLogs() {
  emit('update:logs', [])
}
</script>

<template>
  <div class="log-drawer" :class="{ 'log-drawer--open': open }">
    <div v-if="open" class="log-drawer__resize" @mousedown.stop="startLogResize"></div>
    <div class="log-drawer__header" @click="open = !open">
      <span class="log-drawer__toggle">
        {{ open ? '▼' : '▲' }} 运行日志
        <span v-if="running" class="log-drawer__running">● 运行中</span>
        <span v-else-if="logs.length > 0" class="log-drawer__count">（{{ logs.length }} 条）</span>
      </span>
      <template v-if="open">
        <BaseButton class="log-drawer__action-btn" icon="📋" title="复制全部日志" @click.stop="copyLogs">复制</BaseButton>
        <BaseButton class="log-drawer__action-btn log-drawer__action-btn--danger" icon="🗑" title="清空日志" @click.stop="clearLogs">清空</BaseButton>
      </template>
    </div>
    <div v-if="open" class="log-drawer__body" :style="{ height: logDrawerHeight + 'px' }">
      <LogPanel :logs="logs" :running="running" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.log-drawer {
  flex-shrink: 0;
  background: #181825;
  border-top: 1px solid #313244;
}
.log-drawer__resize {
  height: 4px;
  cursor: row-resize;
  background: #313244;
  transition: background 0.15s;
  &:hover { background: #89b4fa; }
}
.log-drawer__header {
  padding: 2px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  &:hover { background: #1e1e2e; }
}
.log-drawer__toggle {
  background: none;
  border: none;
  color: #89b4fa;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  pointer-events: none;
}
.log-drawer__running { color: #a6e3a1; font-size: 11px; animation: pulse 1s infinite; }
.log-drawer__count { color: #6c7086; font-size: 11px; }
.log-drawer__action-btn {
  background: none;
  border: 1px solid #45475a;
  border-radius: 3px;
  color: #6c7086;
  cursor: pointer;
  font-size: 11px;
  padding: 2px 7px;
  white-space: nowrap;
  &:hover { color: #cdd6f4; border-color: #6c7086; }
  &--danger:hover { color: #f38ba8; border-color: #f38ba8; }
}
.log-drawer__body { overflow: hidden; }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}
</style>
