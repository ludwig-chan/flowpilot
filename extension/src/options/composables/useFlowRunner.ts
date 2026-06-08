import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { type BridgeEvent } from './useExtensionBridge'
import { MSG } from '@shared/types/message'
import type { Bridge } from './useBridge'
import type { LocalFlow } from '../stores/useFlowStore'
import { showAlert, showConfirm } from '@shared/utils/dialog'

export function useFlowRunner(
  editingFlow: Ref<LocalFlow | null>,
  allFlows:    () => LocalFlow[],
  bridge:      Bridge,
) {
  const logs          = ref<string[]>([])
  const running       = ref(false)
  const stopping      = ref(false)
  const logDrawerOpen = ref(false)

  function tsLog(text: string): string {
    const n  = new Date()
    const hh = String(n.getHours()).padStart(2, '0')
    const mm = String(n.getMinutes()).padStart(2, '0')
    const ss = String(n.getSeconds()).padStart(2, '0')
    const ms = String(n.getMilliseconds()).padStart(3, '0')
    return `[${hh}:${mm}:${ss}.${ms}] ${text}`
  }

  async function runCurrentFlow() {
    if (!editingFlow.value) { await showAlert('请先打开一个流程'); return }
    // 运行前检查断裂引用
    const validIds = new Set(allFlows().map(f => f.id))
    function collectBrokenRefs(steps: LocalFlow['steps']): string[] {
      const result: string[] = []
      for (const s of steps) {
        if (s.type === 'call_flow' && s.flowRef && !validIds.has(s.flowRef))
          result.push(s.label || s.flowRef)
        result.push(...collectBrokenRefs(s.children ?? []))
        result.push(...collectBrokenRefs(s.elseChildren ?? []))
      }
      return result
    }
    const broken = collectBrokenRefs(editingFlow.value.steps)
    if (broken.length > 0) {
      const ok = await showConfirm(
        `以下嵌入流程已丢失，运行时将被跳过：\n${broken.map(n => `• ${n}`).join('\n')}\n\n是否继续执行？`
      )
      if (!ok) return
    }
    running.value = true
    logs.value.push(tsLog(`▶ 开始运行流程 "${editingFlow.value.name}"`))
    await bridge.runFlow(
      editingFlow.value.steps, {},
      editingFlow.value.stepDelayLevel,
      editingFlow.value.stepDelayRange,
      editingFlow.value.waitTimeout,
      editingFlow.value.id,
      editingFlow.value.name,
    )
  }

  async function stopCurrentFlow() {
    stopping.value = true
    await bridge.stopFlow()
  }

  const handler = (evt: BridgeEvent) => {
    if (evt.type === MSG.FLOW_LOG_FROM_TAB)   logs.value.push(tsLog(evt.text))
    if (evt.type === MSG.FLOW_DONE_FROM_TAB)  { running.value = false; stopping.value = false; logs.value.push(tsLog('\u2705 流程运行完成')) }
    if (evt.type === MSG.FLOW_ERROR_FROM_TAB) { running.value = false; stopping.value = false; logs.value.push(tsLog(`\u274c 错误：${evt.error}`)) }
  }
  bridge.on(handler)
  onUnmounted(() => bridge.off(handler))

  return { logs, running, stopping, logDrawerOpen, runCurrentFlow, stopCurrentFlow }
}
