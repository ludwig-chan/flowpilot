<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ProgressEntry } from '../../composables/useFlowProgress'

const props = defineProps<{
  entries:              ProgressEntry[]
  running:              boolean
  formattedElapsed:     string
  progressDrawerHeight: number
  startProgressResize:  (e: MouseEvent) => void
  screenshotCount:      number
}>()

const open = defineModel<boolean>('open', { default: true })

const bodyEl = ref<HTMLElement | null>(null)
watch(() => props.entries.length, async () => {
  await nextTick()
  if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
})

function getChildRows(entry: ProgressEntry): [number, string][] {
  if (!entry.childStack) return []
  return Object.entries(entry.childStack)
    .map(([d, lbl]) => [Number(d), lbl] as [number, string])
    .sort((a, b) => a[0] - b[0])
}
</script>

<template>
  <div class="progress-drawer" :class="{ 'progress-drawer--open': open }">
    <div v-if="open" class="progress-drawer__resize" @mousedown.stop="startProgressResize"></div>
    <div class="progress-drawer__header" @click="open = !open">
      <span class="progress-drawer__toggle">
        {{ open ? '▼' : '▲' }} 执行进度
        <span v-if="running" class="progress-drawer__running">● 运行中</span>
        <span v-else-if="entries.length > 0" class="progress-drawer__count">
          （{{ entries.filter(e => e.status === 'done').length }}/{{ entries.length }} 步完成）
        </span>
      </span>
      <span v-if="running || entries.length > 0" class="progress-drawer__elapsed">
        ⏱ {{ formattedElapsed }}
      </span>
    </div>
    <div v-if="open" class="progress-drawer__body" :style="{ height: progressDrawerHeight + 'px' }" ref="bodyEl">
      <div v-if="entries.length === 0" class="progress-drawer__empty">点击「运行」开始执行流程</div>
      <div
        v-if="!running && entries.length > 0 && screenshotCount > 0"
        class="progress-drawer__screenshot-hint"
      >
        📸 本流程共保存 {{ screenshotCount }} 张截图，请在 <strong>FlowPilot 客户端</strong>中查看
      </div>
      <div
        v-for="entry in entries"
        :key="entry.stepId + entry.status"
        class="progress-entry-group"
      >
        <div class="progress-entry" :class="`progress-entry--${entry.status}`">
          <span class="progress-entry__icon">
            <span v-if="entry.status === 'running'" class="progress-entry__spin">▶</span>
            <span v-else-if="entry.status === 'done'">✅</span>
            <span v-else-if="entry.status === 'error'">❌</span>
          </span>
          <span class="progress-entry__label">
            {{ entry.label }}
            <span v-if="entry.loopProgress" class="progress-entry__loop">
              ({{ entry.loopProgress.index }}/{{ entry.loopProgress.total }})
            </span>
          </span>
        </div>
        <div
          v-for="[d, lbl] in getChildRows(entry)"
          :key="d"
          class="progress-child"
          :style="{ paddingLeft: (d * 14) + 'px' }"
        >
          <span class="progress-child__arrow">↳</span>
          <span class="progress-child__label">{{ lbl }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.progress-drawer {
  flex-shrink: 0;
  background: #181825;
  border-top: 1px solid #313244;
}
.progress-drawer__resize {
  height: 4px;
  cursor: row-resize;
  background: #313244;
  transition: background 0.15s;
  &:hover { background: #cba6f7; }
}
.progress-drawer__header {
  padding: 2px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  &:hover { background: #1e1e2e; }
}
.progress-drawer__toggle {
  color: #cba6f7;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  pointer-events: none;
}
.progress-drawer__running { color: #a6e3a1; font-size: 11px; animation: pulse 1s infinite; }
.progress-drawer__count   { color: #6c7086; font-size: 11px; }
.progress-drawer__elapsed { color: #f9e2af; font-size: 11px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
.progress-drawer__body    { overflow-y: auto; padding: 6px 10px; }
.progress-drawer__empty   { color: #6c7086; font-size: 12px; font-style: italic; padding: 4px 0; }

.progress-entry {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 0;
  font-size: 12px;
  line-height: 1.6;
  &--running { color: #89b4fa; }
  &--done    { color: #585b70; }
  &--error   { color: #f38ba8; }
}
.progress-entry__icon  { flex-shrink: 0; font-size: 11px; width: 14px; }
.progress-entry__spin  { display: inline-block; animation: pulse 0.8s infinite; }
.progress-entry__label { flex: 1; }
.progress-entry__loop  { color: #fab387; margin-left: 4px; font-size: 11px; }

.progress-child {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-size: 11px;
  color: #a6e3a1;
  padding: 1px 0;

.progress-drawer__screenshot-hint {
  margin-top: 8px;
  padding: 6px 10px;
  background: #1e1e2e;
  border: 1px solid #f9e2af;
  border-radius: 4px;
  color: #f9e2af;
  font-size: 12px;
  line-height: 1.6;
}
  line-height: 1.6;
}
.progress-child__arrow { color: #585b70; flex-shrink: 0; }
.progress-child__label { flex: 1; }

@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }
</style>
