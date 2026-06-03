import { computed } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'

function estimateStepListMs(steps: FlowStep[], interStepMs: number): number | null {
  let total = 0
  for (const step of steps) {
    if (step.type === 'call_flow' || step.type === 'loop_items') return null
    if (step.type === 'delay') {
      total += Number(step.value) || 0
    } else {
      total += interStepMs
    }
    if (step.foundDelay) total += (step.foundDelay[0] + step.foundDelay[1]) / 2
    if (step.type === 'condition') {
      const ifMs   = estimateStepListMs(step.children    ?? [], interStepMs)
      const elseMs = estimateStepListMs(step.elseChildren ?? [], interStepMs)
      if (ifMs === null || elseMs === null) return null
      total += Math.max(ifMs, elseMs)
    }
  }
  return total
}

export function useFlowEstimate(editingFlow: Ref<LocalFlow | null>) {
  const estimatedFlowTime = computed<string | null>(() => {
    if (!editingFlow.value) return null
    const flow = editingFlow.value
    let interStepMs: number
    if (flow.stepDelayLevel === 'none') {
      interStepMs = 0
    } else if (flow.stepDelayLevel === 'custom' && flow.stepDelayRange) {
      interStepMs = (flow.stepDelayRange[0] + flow.stepDelayRange[1]) / 2
    } else {
      const lvl = (flow.stepDelayLevel ?? 'medium') as 'low' | 'medium' | 'high'
      const p   = STEP_DELAY_PRESETS[lvl] ?? STEP_DELAY_PRESETS.medium
      interStepMs = (p[0] + p[1]) / 2
    }
    const ms = estimateStepListMs(flow.steps, interStepMs)
    if (ms === null) return null
    if (ms < 1000)  return '< 1 秒'
    if (ms < 60000) return `≈ ${(ms / 1000).toFixed(1)} 秒`
    const min = Math.floor(ms / 60000)
    const sec = Math.round((ms % 60000) / 1000)
    return `≈ ${min} 分 ${sec} 秒`
  })

  return { estimatedFlowTime }
}
