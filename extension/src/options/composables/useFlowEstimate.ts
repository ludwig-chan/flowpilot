import { computed } from 'vue'
import type { Ref } from 'vue'
import type { LocalFlow } from '../stores/useFlowStore'
import type { FlowStep } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'

interface EstimateResult {
  fixed:   number  // 固定耗时 ms（不含循环部分）
  perItem: number  // 每个循环项耗时 ms（0 表示无循环）
}

function avg(range?: [number, number]): number {
  return range ? (range[0] + range[1]) / 2 : 0
}

function positiveInt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : undefined
}

function loopActionSteps(step: FlowStep): FlowStep[] {
  if (step.children?.length) return step.children
  if (step.itemActions?.length) return step.itemActions
  if (step.itemAction) return [step.itemAction]
  return []
}

function estimateStepListMs(steps: FlowStep[], interStepMs: number): EstimateResult | null {
  let fixed   = 0
  let perItem = 0

  for (const step of steps) {
    if (step.type === 'call_flow') return null

    if (step.type === 'loop_items') {
      const actionSteps = loopActionSteps(step)
      const childResult = estimateStepListMs(actionSteps, interStepMs)
      if (childResult === null) return null
      if (childResult.perItem > 0) return null  // 嵌套循环，放弃估算
      const itemDelayMs = avg(step.itemDelay)
      const scrollWaitMs = avg(step.scrollWait)
      const maxItems = positiveInt(step.maxLoopItems)
      const batchSize = positiveInt(step.loopBatchSize)
      const cooldownMs = avg(step.loopCooldown)
      const cooldownPerItem = batchSize && cooldownMs > 0
        ? cooldownMs / batchSize
        : 0
      const perLoopItemMs = childResult.fixed + itemDelayMs + scrollWaitMs
      if (maxItems) {
        const cooldownCount = batchSize && cooldownMs > 0
          ? Math.max(0, Math.floor((maxItems - 1) / batchSize))
          : 0
        fixed += perLoopItemMs * maxItems + cooldownMs * cooldownCount
      } else {
        perItem += perLoopItemMs + cooldownPerItem
      }
      if (step.foundDelay) fixed += (step.foundDelay[0] + step.foundDelay[1]) / 2
      continue
    }

    if (step.type === 'delay') {
      fixed += Number(step.value) || 0
    } else {
      fixed += interStepMs
    }
    if (step.foundDelay) fixed += (step.foundDelay[0] + step.foundDelay[1]) / 2

    if (step.type === 'condition') {
      const ifResult   = estimateStepListMs(step.children    ?? [], interStepMs)
      const elseResult = estimateStepListMs(step.elseChildren ?? [], interStepMs)
      if (ifResult === null || elseResult === null) return null
      if (ifResult.perItem > 0 || elseResult.perItem > 0) return null  // 条件分支含循环，放弃估算
      fixed += Math.max(ifResult.fixed, elseResult.fixed)
    }
  }

  return { fixed, perItem }
}

function formatMs(ms: number): string {
  if (ms < 1000)  return '< 1秒'
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`
  const min = Math.floor(ms / 60000)
  const sec = Math.round((ms % 60000) / 1000)
  return `${min}分${sec}秒`
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

    const result = estimateStepListMs(flow.steps, interStepMs)
    if (result === null) return null

    const { fixed, perItem } = result

    if (perItem === 0) {
      if (fixed < 1000)  return '< 1 秒'
      if (fixed < 60000) return `≈ ${(fixed / 1000).toFixed(1)} 秒`
      const min = Math.floor(fixed / 60000)
      const sec = Math.round((fixed % 60000) / 1000)
      return `≈ ${min} 分 ${sec} 秒`
    }

    const perItemStr = `${formatMs(perItem)}/项`
    if (fixed === 0) return `≈ ${perItemStr}`
    return `≈ ${formatMs(fixed)} + ${perItemStr}`
  })

  return { estimatedFlowTime }
}
