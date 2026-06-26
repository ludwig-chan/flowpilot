import type { FlowStep, SelectorStrategy, StepDelayLevel, StepEvent } from '@shared/types/flow'

export type CachedFlow = { id: string; name: string; steps: FlowStep[] }

export interface RunMetadata {
  runId?: string
  runStartedAt?: string
  flowId?: string
  flowName?: string
}

/** 运行上下文（替代模块级全局变量，支持并发独立控制） */
export interface RunContext {
  variables: Record<string, string>
  attachmentVariables: Record<string, { id: string; filename?: string; fileSize?: number; sourceUrl?: string; source: 'download' | 'screenshot' }>
  onLog: (text: string) => void
  onStep?: (event: StepEvent) => void
  waitTimeout: number
  delayLevel: StepDelayLevel
  delayRange?: [number, number]
  depth: number
  signal: { stopped: boolean }
  flowCache?: Map<string, CachedFlow>
  runId: string
  runStartedAt: string
  flowId?: string
  flowName?: string
  screenshotCount: number
}

/** 元素查找器：resolveEl 包装后的类型 */
export type ResolveFn = (strategy: SelectorStrategy) => Promise<Element>

/** 子步骤执行回调：封装 executeStep + applyStepDelay */
export type RunChildStepFn = (step: FlowStep, ctx: RunContext) => Promise<void>

/** 步骤处理器统一签名 */
export type StepHandler = (
  step: FlowStep,
  ctx: RunContext,
  resolve: ResolveFn,
  runChild: RunChildStepFn,
) => Promise<void>
