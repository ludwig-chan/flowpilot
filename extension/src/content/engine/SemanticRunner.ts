import type { FlowStep, SelectorStrategy, StepDelayLevel, StepEvent } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import { MSG } from '@shared/types/message'
import { toLocalTimeString } from '@shared/utils/time'
import { resolveElementByStrategy } from './domResolver'
import { humanDelay } from './eventSimulator'
import type { CachedFlow, RunMetadata, RunContext } from './types'
import { STEP_HANDLERS } from './stepHandlers'

// ─── 工具 ──────────────────────────────────────────────────────────────────────

function createRunId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `run_${crypto.randomUUID()}`
    : `run_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

// ─── 流程入口 ──────────────────────────────────────────────────────────────────

export function runFlow(
  steps: FlowStep[],
  variables: Record<string, string>,
  onLog: (text: string) => void,
  onStep?: (event: StepEvent) => void,
  stepDelayLevel?: StepDelayLevel,
  stepDelayRange?: [number, number],
  waitTimeout?: number,
  metadata: RunMetadata = {},
): { done: Promise<{ screenshotCount: number }>; stop: () => void } {
  const signal = { stopped: false }

  const done = (async () => {
    // 一次性预载所有流程，供 call_flow 使用（避免每步都发消息）
    let flowCache: Map<string, CachedFlow> | undefined
    try {
      const res = await chrome.runtime.sendMessage({ type: MSG.GET_BUILT_FLOWS }) as
        { ok: boolean; flows: CachedFlow[] } | undefined
      if (res?.flows) flowCache = new Map(res.flows.map(f => [f.id, f]))
    } catch { /* 无流程或发消息失败，不影响主流程 */ }

    const ctx: RunContext = {
      variables,
      attachmentVariables: {},
      onLog,
      onStep,
      waitTimeout: waitTimeout ?? 10000,
      delayLevel: stepDelayLevel ?? 'medium',
      delayRange: stepDelayRange,
      depth: 0,
      signal,
      flowCache,
      runId: metadata.runId ?? createRunId(),
      runStartedAt: metadata.runStartedAt ?? toLocalTimeString(),
      flowId: metadata.flowId,
      flowName: metadata.flowName,
      screenshotCount: 0,
    }

    for (const step of steps) {
      if (signal.stopped) { onLog('流程已停止'); return { screenshotCount: ctx.screenshotCount } }
      await executeStep(step, ctx)
    }

    onLog('✅ 流程执行完成')
    return { screenshotCount: ctx.screenshotCount }
  })()

  return { done, stop: () => { signal.stopped = true } }
}

// ─── 核心调度 ──────────────────────────────────────────────────────────────────

async function executeStep(step: FlowStep, ctx: RunContext): Promise<void> {
  const { onLog, onStep } = ctx
  onLog(`执行：${step.label}`)
  onStep?.({ type: 'step_start', stepId: step.id, label: step.label, depth: ctx.depth })

  const effectiveTimeout = step.waitTimeout ?? ctx.waitTimeout

  // 元素查找器（闭包捕获 step / ctx / effectiveTimeout，包装为 ResolveFn）
  const resolveEl = async (strategy: SelectorStrategy): Promise<Element> => {
    const el = await resolveElementByStrategy(strategy, document, effectiveTimeout)
    if (!el) throw new Error(`等待元素超时（${effectiveTimeout}ms）：${strategy.cssSelector}`)
    if (step.foundDelay) await humanDelay(step.foundDelay[0], step.foundDelay[1])
    return el
  }

  // 子步骤执行器：executeStep + applyStepDelay 封装，传给需要递归的 handler
  const runChild = async (child: FlowStep, childCtx: RunContext) => {
    await executeStep(child, childCtx)
    await applyStepDelay(child, childCtx)
  }

  // 查表分发
  const handler = STEP_HANDLERS[step.type]
  if (handler) {
    await handler(step, ctx, resolveEl, runChild)
  } else {
    onLog(`[跳过] 暂未实现的动作类型：${step.type}`)
  }

  onStep?.({ type: 'step_done', stepId: step.id, depth: ctx.depth })
  await applyStepDelay(step, ctx)
}

// ─── 步骤间延迟 ────────────────────────────────────────────────────────────────

async function applyStepDelay(step: FlowStep, ctx: RunContext): Promise<void> {
  if (step.delay) {
    await humanDelay(step.delay[0], step.delay[1])
  } else if (ctx.delayLevel !== 'none') {
    const range = ctx.delayLevel === 'custom' ? ctx.delayRange : STEP_DELAY_PRESETS[ctx.delayLevel]
    if (range) await humanDelay(range[0], range[1])
  }
}


