import { ref, computed, onUnmounted } from 'vue'
import type { BridgeEvent } from './useExtensionBridge'
import { MSG } from '@shared/types/message'
import type { Bridge } from './useBridge'
import type { StepEvent } from '@shared/types/flow'

export interface ProgressEntry {
  stepId:        string
  label:         string
  status:        'running' | 'done' | 'error'
  loopProgress?: { index: number; total: number }
  childStack?:   Record<number, string>
}

export function useFlowProgress(bridge: Bridge) {
  const progressOpen = ref(true)
  const entries      = ref<ProgressEntry[]>([])
  const elapsedMs    = ref(0)

  let startTime: number | null = null
  let timer: ReturnType<typeof setInterval> | null = null

  function reset() {
    entries.value   = []
    elapsedMs.value = 0
    startTime       = null
    if (timer) { clearInterval(timer); timer = null }
  }

  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null }
  }

  const formattedElapsed = computed(() => {
    const s = Math.floor(elapsedMs.value / 1000)
    const m = Math.floor(s / 60)
    const h = Math.floor(m / 60)
    if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    return `${m}:${String(s % 60).padStart(2, '0')}`
  })

  function handleStepEvent(event: StepEvent) {
    if (event.type === 'step_start') {
      if (event.depth === 0) {
        entries.value.push({ stepId: event.stepId, label: event.label, status: 'running' })
      } else {
        // 子步骤：按 depth 写入最近一个 running 顶层条目的 childStack
        const parent = [...entries.value].reverse().find(e => e.status === 'running')
        if (parent) {
          parent.childStack = { ...parent.childStack, [event.depth]: event.label }
        }
      }
    } else if (event.type === 'step_done') {
      if (event.depth === 0) {
        const entry = [...entries.value].reverse().find(e => e.stepId === event.stepId && e.status === 'running')
        if (entry) { entry.status = 'done'; entry.childStack = undefined }
      } else {
        // 清除 >= 当前 depth 的所有层级（该层及其子层已完成）
        const parent = [...entries.value].reverse().find(e => e.status === 'running')
        if (parent?.childStack) {
          const next: Record<number, string> = {}
          for (const [k, v] of Object.entries(parent.childStack)) {
            if (Number(k) < event.depth) next[Number(k)] = v
          }
          parent.childStack = Object.keys(next).length > 0 ? next : undefined
        }
      }
    } else if (event.type === 'loop_progress') {
      const entry = [...entries.value].reverse().find(e => e.stepId === event.stepId && e.status === 'running')
      if (entry) entry.loopProgress = { index: event.index, total: event.total }
    }
  }

  const handler = (evt: BridgeEvent) => {
    if (evt.type === MSG.FLOW_STEP_EVENT_FROM_TAB) {
      handleStepEvent(evt.event)
    }
    if (evt.type === MSG.FLOW_DONE_FROM_TAB) {
      entries.value.forEach(e => { if (e.status === 'running') { e.status = 'done'; e.childStack = undefined } })
      stopTimer()
    }
    if (evt.type === 'FLOW_ERROR_FROM_TAB') {
      entries.value.forEach(e => { if (e.status === 'running') { e.status = 'error'; e.childStack = undefined } })
      stopTimer()
    }
  }

  bridge.on(handler)
  onUnmounted(() => { bridge.off(handler); if (timer) clearInterval(timer) })

  function onRunStart() {
    reset()
    progressOpen.value = true
    startTime = Date.now()
    timer = setInterval(() => {
      if (startTime !== null) elapsedMs.value = Date.now() - startTime
    }, 500)
  }

  return { progressOpen, entries, elapsedMs, formattedElapsed, onRunStart }
}
