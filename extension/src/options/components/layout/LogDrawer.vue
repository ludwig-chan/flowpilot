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
        <button class="log-drawer__action-btn" title="复制全部日志" @click.stop="copyLogs">📋 复制</button>
        <button class="log-drawer__action-btn log-drawer__action-btn--danger" title="清空日志" @click.stop="clearLogs">🗑 清空</button>
      </template>
    </div>
    <div v-if="open" class="log-drawer__body" :style="{ height: logDrawerHeight + 'px' }">
      <LogPanel :logs="logs" :running="running" />
    </div>
  </div>
</template>
