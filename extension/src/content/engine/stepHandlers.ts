import type { FlowStep } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import type { ResolveFn, RunChildStepFn, RunContext } from './types'
import { MSG } from '@shared/types/message'
import { toLocalTimeString } from '@shared/utils/time'
import { screenshotCanvas } from './screenshotCanvas'
import { screenshotElement } from './screenshotElement'
import { waitForElementToDisappear } from './domResolver'
import { humanDelay, simulateClickAsync, dispatchDoubleClickAsync, dispatchRightClickAsync, dispatchHoverAsync, findScrollContainer, sleep, randomPosInRect } from './eventSimulator'
import { interpolate, evalCondition, evalMultiCondition } from './conditionEval'

// ─── 内部工具 ──────────────────────────────────────────────────────────────────

/**
 * 向可编辑元素写入文本，同时处理 React/Vue 等框架对 value 的劫持。
 * input 和 clear 共用此函数，inputType 区分 'insertText' / 'deleteContentBackward'。
 */
function writeToElement(el: HTMLElement, text: string, inputType: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // 标准 input / textarea：用原型链 native setter 绕过框架拦截
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(el, text)
    } else {
      el.value = text
    }
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType, data: text }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } else {
    // contenteditable div 等：先全选再用 execCommand
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.selectNodeContents(el)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    const command = text === '' ? 'delete' : 'insertText'
    const success = document.execCommand(command, false, text || undefined)
    if (!success) {
      el.textContent = text
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType, data: text }))
    }
  }
}

/**
 * 条件/元素分支的公共执行逻辑：
 * 根据 condition 布尔值选择 children 或 elseChildren，递归执行。
 */
async function executeBranch(
  condMet: boolean,
  step: FlowStep,
  ctx: RunContext,
  runChild: RunChildStepFn,
): Promise<void> {
  const { onLog, signal } = ctx
  const branchSteps = condMet ? step.children : step.elseChildren
  if (branchSteps?.length) {
    onLog(`  执行${condMet ? '成立' : '否则'}分支 (${branchSteps.length} 步)...`)
    for (const child of branchSteps) {
      if (signal.stopped) return
      await runChild(child, { ...ctx, depth: ctx.depth + 1 })
    }
  } else {
    onLog(`  条件${condMet ? '成立' : '不成立'}，无对应分支，跳过`)
  }
}

// ─── 截图保存三级管线 ────────────────────────────────────────────────────────

/** Step 1: 截图（canvas 优先 → 通用元素降级） */
async function captureScreenshot(
  selector: import('@shared/types/flow').SelectorStrategy,
  sel: string,
  resolve: ResolveFn,
  onLog: (s: string) => void,
  fallbackEl?: HTMLElement,
): Promise<string | null> {
  const quickEl = (() => { try { return document.querySelector(sel) } catch { return null } })()
  const likelyCanvas = quickEl === null || quickEl.tagName.toLowerCase() === 'canvas'

  let dataUrl: string | null = null
  if (likelyCanvas) dataUrl = await screenshotCanvas(sel, onLog)
  if (dataUrl === null) {
    if (likelyCanvas && quickEl !== null) onLog('  [降级] canvas 路径失败，尝试通用元素截图...')
    try {
      const el = fallbackEl ?? await resolve(selector) as HTMLElement
      dataUrl = await screenshotElement(el, onLog)
    } catch (err) {
      onLog(`  [截图] 失败：${(err as Error).message}`)
    }
  }
  return dataUrl
}

/** Step 2: 通过桥接服务保存到本地 */
async function saveViaBridge(
  dataUrl: string,
  filename: string,
  ctx: RunContext,
): Promise<{ ok: boolean; id?: string; filename?: string; path?: string; error?: string }> {
  try {
    const saved = await chrome.runtime.sendMessage({
      type: MSG.SAVE_SCREENSHOT,
      dataUrl, filename,
      runId: ctx.runId, runStartedAt: ctx.runStartedAt,
      flowId: ctx.flowId, flowName: ctx.flowName,
      sourceUrl: location.href, sourceTitle: document.title,
    }) as { ok: boolean; id?: string; filename?: string; path?: string; error?: string } | undefined
    return saved ?? { ok: false, error: '桥接服务未响应' }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Step 3: 降级到浏览器下载 */
function downloadFallback(dataUrl: string, filename: string, onLog: (s: string) => void): void {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename; a.style.display = 'none'
  document.body.appendChild(a); a.click(); a.remove()
  onLog(`  已保存（浏览器下载）→ ${filename}（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
}

// ─── 步骤处理器 ────────────────────────────────────────────────────────────────

function selectorSegment(el: Element): string {
  const siblings = el.parentElement ? [...el.parentElement.children] : []
  const idx = siblings.indexOf(el) + 1
  return `${el.tagName.toLowerCase()}:nth-child(${idx})`
}

function buildRelativeSelector(root: Element, target: Element): string | null {
  if (root === target) return ':scope'
  if (!root.contains(target)) return null

  const parts: string[] = []
  let cur: Element | null = target
  while (cur && cur !== root) {
    parts.unshift(selectorSegment(cur))
    cur = cur.parentElement
  }
  return parts.length ? `:scope > ${parts.join(' > ')}` : null
}

function queryWithinItem(item: Element, relativeSelector?: string | null): Element | null {
  const rel = relativeSelector?.trim()
  if (!rel) return null
  if (rel === ':scope') return item
  try { return item.querySelector(rel) } catch { return null }
}

function resolveLoopActionTarget(loopStep: FlowStep, action: FlowStep, item: Element, firstItem: Element): Element {
  const relativeSelector = action.selector?.relativeSelector || loopStep.itemTargetRelativeSelector
  const savedTarget = queryWithinItem(item, relativeSelector)
  if (savedTarget) return savedTarget

  const targetSelector = action.selector?.cssSelector || loopStep.itemTargetSelector?.cssSelector
  if (!targetSelector) return item

  let firstTarget: Element | null = null
  try { firstTarget = document.querySelector(targetSelector) } catch { return item }
  if (!firstTarget || !firstItem.contains(firstTarget)) return item

  if (item === firstItem) return firstTarget

  const relative = buildRelativeSelector(firstItem, firstTarget)
  return queryWithinItem(item, relative) ?? item
}

function getLoopItemActions(step: FlowStep): FlowStep[] {
  if (step.itemActions?.length) return step.itemActions
  if (step.itemAction) {
    return [{
      ...step.itemAction,
      selector: step.itemAction.selector ?? step.itemTargetSelector,
    }]
  }
  if (step.itemTargetSelector || step.itemTargetRelativeSelector) {
    return [{
      id: `${step.id}_item_action`,
      type: 'click',
      label: '点击',
      selector: step.itemTargetSelector
        ? {
            ...step.itemTargetSelector,
            relativeSelector: step.itemTargetRelativeSelector || step.itemTargetSelector.relativeSelector,
          }
        : undefined,
    }]
  }
  return [{
    id: `${step.id}_item_action`,
    type: 'click',
    label: '点击',
  }]
}

function getLoopItemText(item: Element): string {
  return item.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) ?? ''
}

function rangeAverage(range?: [number, number]): number {
  return range ? (range[0] + range[1]) / 2 : 0
}

function normalizePositiveInt(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const normalized = Math.floor(value)
  return normalized > 0 ? normalized : undefined
}

function isElementInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect()
  const height = window.innerHeight || document.documentElement.clientHeight
  const width = window.innerWidth || document.documentElement.clientWidth
  return rect.top >= 0 && rect.left >= 0 && rect.bottom <= height && rect.right <= width
}

async function scrollElementIntoViewIfNeeded(el: HTMLElement, waitRange?: [number, number]): Promise<void> {
  if (!isElementInViewport(el)) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    await humanDelay(...(waitRange ?? [500, 1800]))
  }
}

// dispatchDoubleClick / dispatchRightClick / dispatchHover 已由 eventSimulator.ts 的 async 版本替代

async function waitForLoopTargetToDisappear(item: Element, relativeSelector?: string, timeout = 10000): Promise<void> {
  if (!relativeSelector) return
  if (!queryWithinItem(item, relativeSelector)) return

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`等待项内元素消失超时：${relativeSelector}`))
    }, timeout)

    const observer = new MutationObserver(() => {
      if (queryWithinItem(item, relativeSelector)) return
      clearTimeout(timer)
      observer.disconnect()
      resolve()
    })

    observer.observe(item, { childList: true, subtree: true })
  })
}

async function applyLoopQueueStepDelay(action: FlowStep, ctx: RunContext): Promise<void> {
  if (action.delay) {
    await humanDelay(action.delay[0], action.delay[1])
  } else if (ctx.delayLevel !== 'none') {
    const range = ctx.delayLevel === 'custom' ? ctx.delayRange : STEP_DELAY_PRESETS[ctx.delayLevel]
    if (range) await humanDelay(range[0], range[1])
  }
}

async function executeLoopItemAction(
  action: FlowStep,
  target: Element,
  item: Element,
  ctx: RunContext,
  index: number,
  runChild: RunChildStepFn,
): Promise<void> {
  const el = target as HTMLElement
  if (action.foundDelay) await humanDelay(action.foundDelay[0], action.foundDelay[1])

  switch (action.type) {
    case 'click':
      await simulateClickAsync(el)
      break
    case 'double_click':
      await dispatchDoubleClickAsync(el)
      break
    case 'right_click':
      await dispatchRightClickAsync(el)
      break
    case 'hover':
      await dispatchHoverAsync(el)
      break
    case 'focus':
      el.focus()
      break
    case 'input':
      el.focus()
      writeToElement(el, interpolate(action.value ?? '', ctx.variables), 'insertText')
      break
    case 'clear':
      el.focus()
      writeToElement(el, '', 'deleteContentBackward')
      break
    case 'select':
      ;(el as HTMLSelectElement).value = interpolate(action.value ?? '', ctx.variables)
      el.dispatchEvent(new Event('change', { bubbles: true }))
      break
    case 'check': {
      const input = el as HTMLInputElement
      const val = action.value?.trim().toLowerCase()
      const targetChecked = val === 'true' ? true : val === 'false' ? false : !input.checked
      if (input.checked !== targetChecked) input.click()
      ctx.onLog(`  勾选状态：${input.checked} → ${targetChecked}`)
      break
    }
    case 'press_key': {
      const key = action.value ?? 'Enter'
      const opts: KeyboardEventInit = { key, code: key, bubbles: true, cancelable: true }
      el.dispatchEvent(new KeyboardEvent('keydown',  opts))
      el.dispatchEvent(new KeyboardEvent('keypress', opts))
      el.dispatchEvent(new KeyboardEvent('keyup',    opts))
      if (key === 'Enter') {
        const form = el.closest?.('form') as HTMLFormElement | null
        form?.requestSubmit?.()
      }
      break
    }
    case 'get_text': {
      const raw = target.textContent?.trim() ?? ''
      const varKey = action.value?.trim()
      if (varKey) {
        ctx.variables[varKey] = raw
        ctx.onLog(`  获取文本 「${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}」 → {{${varKey}}}`)
      } else {
        ctx.onLog(`  获取文本 「${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}」（未指定变量名）`)
      }
      break
    }
    case 'wait_appear':
      break
    case 'wait_disappear':
      await waitForLoopTargetToDisappear(item, action.selector?.relativeSelector, action.waitTimeout ?? ctx.waitTimeout)
      break
    case 'scroll_to':
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      break
    case 'save_canvas': {
      const dataUrl = action.selector
        ? await captureScreenshot(action.selector, action.selector.cssSelector, async () => target, ctx.onLog, el)
        : await screenshotElement(el, ctx.onLog)
      if (!dataUrl) { ctx.onLog('  [跳过] 截图失败，无法保存'); return }
      const ts = toLocalTimeString().replace(/:/g, '-')
      const filename = `screenshot-${ts}-item-${index}.png`
      const saved = await saveViaBridge(dataUrl, filename, ctx)
      if (saved.ok) {
        ctx.screenshotCount++
        const varKey = action.value?.trim()
        if (varKey) {
          ctx.variables[varKey] = saved.id ?? saved.path ?? filename
          ctx.onLog(`  截图变量 → {{${varKey}}}`)
        }
        ctx.onLog(`  已保存 → ${saved.path ?? filename}（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
      } else {
        ctx.onLog(`  [降级] 本地截图服务失败：${saved.error ?? '本地截图服务未返回保存结果'}`)
        downloadFallback(dataUrl, filename, ctx.onLog)
      }
      break
    }
    case 'call_flow': {
      if (!action.flowRef) { ctx.onLog('[跳过] 循环项内嵌入流程缺少 flowRef'); break }
      const subFlow = ctx.flowCache?.get(action.flowRef)
      if (!subFlow) { ctx.onLog(`[跳过] 找不到嵌入流程 ${action.flowRef}`); break }
      ctx.onLog(`  嵌入执行：${subFlow.name}`)
      for (const s of subFlow.steps) {
        if (ctx.signal.stopped) return
        await runChild(s, { ...ctx, depth: ctx.depth + 1 })
      }
      break
    }
    case 'save_data': {
      const fieldNames = action.recordFields ?? []
      if (!fieldNames.length) { ctx.onLog('  [跳过] 保存数据：未选择任何变量'); break }
      const fields: Record<string, string> = {}
      for (const name of fieldNames) {
        const val = ctx.variables[name]
        if (val !== undefined) fields[name] = val
        else ctx.onLog(`  变量 {{${name}}} 尚未赋值，跳过`)
      }
      if (!Object.keys(fields).length) { ctx.onLog('  [跳过] 保存数据：所有变量均未赋值'); break }
      ctx.onLog(`  保存数据：${Object.keys(fields).join(', ')}`)
      try {
        const result = await chrome.runtime.sendMessage({
          type: MSG.SAVE_DATA_RECORD,
          fields,
          runId: ctx.runId,
          runStartedAt: ctx.runStartedAt,
          flowId: ctx.flowId,
          flowName: ctx.flowName,
          sourceUrl: location.href,
          sourceTitle: document.title,
        }) as { ok?: boolean; id?: string; error?: string } | undefined
        if (result?.ok) ctx.onLog(`  数据已保存 → 记录 ${result.id}`)
        else ctx.onLog(`  [失败] 保存数据：${result?.error ?? '本地服务未响应'}`)
      } catch (err) {
        ctx.onLog(`  [失败] 保存数据：${(err as Error).message}`)
      }
      break
    }
    default:
      ctx.onLog(`[跳过] 循环项内暂不支持动作：${action.type}`)
  }
}

interface DownloadWaitResult {
  ok?: boolean
  id?: string
  filename?: string
  filePath?: string
  fileSize?: number
  sourceUrl?: string
  error?: string
}

async function handleClick(step: FlowStep, ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement

  if (!step.captureDownload) {
    await simulateClickAsync(el)
    return
  }

  const varKey = step.downloadVarName?.trim()
  if (!varKey) {
    ctx.onLog('  [下载] 已标记下载点击，但未填写下载变量名')
    await simulateClickAsync(el)
    return
  }

  const timeout = step.downloadWaitTimeout ?? 30_000
  ctx.onLog(`  等待下载：{{${varKey}}}，超时 ${timeout}ms`)
  const downloadPromise = chrome.runtime.sendMessage({
    type: MSG.WAIT_FOR_NEXT_DOWNLOAD,
    timeout,
    runId: ctx.runId,
    runStartedAt: ctx.runStartedAt,
    flowId: ctx.flowId,
    flowName: ctx.flowName,
  }) as Promise<DownloadWaitResult | undefined>

  await simulateClickAsync(el)

  const result = await downloadPromise
  if (!result?.ok || !result.id) {
    throw new Error(result?.error ?? '等待下载失败')
  }

  ctx.variables[varKey] = result.id
  ctx.attachmentVariables[varKey] = {
    id: result.id,
    filename: result.filename,
    fileSize: result.fileSize,
    sourceUrl: result.sourceUrl,
    source: 'download',
  }
  ctx.onLog(`  下载附件变量 → {{${varKey}}}（${result.filename ?? result.id}）`)
}

async function handleFocus(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  el.focus()
}

async function handleInput(step: FlowStep, ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  const value = interpolate(step.value ?? '', ctx.variables)
  el.focus()
  writeToElement(el, value, 'insertText')
}

async function handleClear(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  el.focus()
  writeToElement(el, '', 'deleteContentBackward')
}

async function handleSelect(step: FlowStep, ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLSelectElement
  el.value = interpolate(step.value ?? '', ctx.variables)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

async function handleCheck(step: FlowStep, ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLInputElement
  const val = step.value?.trim().toLowerCase()
  const targetChecked = val === 'true' ? true : val === 'false' ? false : !el.checked
  if (el.checked !== targetChecked) el.click()
  ctx.onLog(`  勾选状态：${el.checked} → ${targetChecked}`)
}

async function handleGetText(step: FlowStep, ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = step.selector ? await resolve(step.selector).catch(() => null) : null
  const raw = el?.textContent?.trim() ?? ''
  const varKey = step.value?.trim()
  if (varKey) {
    ctx.variables[varKey] = raw
    ctx.onLog(`  获取文本 「${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}」 → {{${varKey}}}`)
  } else {
    ctx.onLog(`  获取文本 「${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}」（未指定变量名）`)
  }
}

async function handleHover(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  await dispatchHoverAsync(el)
}

async function handleDoubleClick(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  await dispatchDoubleClickAsync(el)
}

async function handleRightClick(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  await dispatchRightClickAsync(el)
}

async function handlePressKey(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const key = step.value ?? 'Enter'
  const target = step.selector
    ? await resolve(step.selector) as HTMLElement
    : (document.activeElement as HTMLElement | null) ?? document.body
  const opts: KeyboardEventInit = { key, code: key, bubbles: true, cancelable: true }
  target.dispatchEvent(new KeyboardEvent('keydown',  opts))
  target.dispatchEvent(new KeyboardEvent('keypress', opts))
  target.dispatchEvent(new KeyboardEvent('keyup',    opts))
  if (key === 'Enter') {
    const form = target.closest?.('form') as HTMLFormElement | null
    form?.requestSubmit?.()
  }
}

async function handleWaitAppear(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  await resolve(step.selector!)
}

async function handleWaitDisappear(step: FlowStep, _ctx: RunContext, _resolve: ResolveFn): Promise<void> {
  await waitForElementToDisappear(step.selector!.cssSelector)
}

async function handleScrollTo(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!)
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

async function handleNavigate(step: FlowStep, ctx: RunContext, _resolve: ResolveFn): Promise<void> {
  window.location.href = interpolate(step.value ?? '', ctx.variables)
}

async function handleDelay(step: FlowStep, _ctx: RunContext, _resolve: ResolveFn): Promise<void> {
  await sleep(parseInt(step.value ?? '1000', 10))
}

async function handleLoopItems(
  step: FlowStep,
  ctx: RunContext,
  _resolve: ResolveFn,
  runChild: RunChildStepFn,
): Promise<void> {
  const { onLog, onStep, signal } = ctx
  if (!step.selector) return
  const allItems = Array.from(document.querySelectorAll(step.selector.cssSelector))
  const itemsArr = allItems
  onLog(`找到 ${allItems.length} 个条目，开始循环...`)
  const executionMode = step.executionMode ?? 'natural'
  const hasChildSteps = !!step.children?.length
  const childSteps = step.children ?? []
  const firstItem = itemsArr[0]
  const itemActions = getLoopItemActions(step)

  // 处理单个列表项（childSteps 或 itemActions）
  const processOneItem = async (item: Element, idx: number) => {
    const itemText = getLoopItemText(item)
    onStep?.({ type: 'loop_progress', stepId: step.id, index: idx + 1, total: itemsArr.length, itemText })
    onLog(`  → 处理：${itemText.slice(0, 50)}`)
    if (hasChildSteps) {
      for (const child of childSteps) {
        if (signal.stopped) return
        await runChild(child, { ...ctx, depth: ctx.depth + 1 })
      }
    } else {
      for (let actionIdx = 0; actionIdx < itemActions.length; actionIdx++) {
        const action = itemActions[actionIdx]
        if (signal.stopped) return
        const itemTarget = firstItem ? resolveLoopActionTarget(step, action, item, firstItem) : item
        if (action.selector && itemTarget === item) onLog('  未找到项内目标，回退对整项执行动作')
        const actionLabel = action.label ?? action.type
        onStep?.({
          type: 'loop_progress',
          stepId: step.id,
          index: idx + 1,
          total: itemsArr.length,
          itemText,
          actionIndex: actionIdx + 1,
          actionTotal: itemActions.length,
          actionLabel,
        })
        onLog(`  执行动作：${actionLabel}`)
        await executeLoopItemAction(action, itemTarget, item, ctx, idx + 1, runChild)
        await applyLoopQueueStepDelay(action, ctx)
      }
    }
  }

  if (executionMode === 'natural') {
    // ── 自然模式：按随机批次滚动像素距离，模拟真人浏览 ──
    const container = findScrollContainer(firstItem)
    const itemHeight = firstItem.getBoundingClientRect().height
    const NATURAL_BATCH_SIZES = [3, 4, 5, 5, 6, 6, 7]

    let i = 0
    while (i < itemsArr.length) {
      if (signal.stopped) return

      const naturalBatch = NATURAL_BATCH_SIZES[Math.floor(Math.random() * NATURAL_BATCH_SIZES.length)]
      const actualBatch = Math.min(naturalBatch, itemsArr.length - i)

      const jitter = 0.8 + Math.random() * 0.5
      const scrollPX = itemHeight * naturalBatch * jitter
      container.scrollBy({ top: scrollPX, behavior: 'smooth' })
      onLog(`  � 自然模式 ${Math.round(scrollPX)}px，处理 ${actualBatch} 项`)

      for (let j = 0; j < actualBatch; j++) {
        if (signal.stopped) return
        await processOneItem(itemsArr[i + j], i + j)
      }

      i += actualBatch
    }
  } else {
    // ── 快速模式：每项处理前精确居中 ──
    for (let i = 0; i < itemsArr.length; i++) {
      const item = itemsArr[i]
      if (signal.stopped) return

      if (!hasChildSteps) {
        const firstTarget = firstItem ? resolveLoopActionTarget(step, itemActions[0], item, firstItem) : item
        await scrollElementIntoViewIfNeeded(firstTarget as HTMLElement)
      } else {
        await scrollElementIntoViewIfNeeded(item as HTMLElement)
      }

      await processOneItem(item, i)
    }
  }
}

async function handleCondition(
  step: FlowStep,
  ctx: RunContext,
  _resolve: ResolveFn,
  runChild: RunChildStepFn,
): Promise<void> {
  const { onLog, variables } = ctx
  let condMet = false
  if (step.conditions?.length) {
    condMet = evalMultiCondition(step.conditions, step.conditionLogic ?? 'and', variables)
    onLog(`  多条件(${step.conditionLogic === 'or' ? 'OR' : 'AND'}) → ${condMet ? '成立' : '不成立'}`)
  } else if (step.value?.trim()) {
    const expr = interpolate(step.value.trim(), variables)
    condMet = evalCondition(expr)
    onLog(`  条件表达式：${expr} → ${condMet ? '成立' : '不成立'}`)
  } else if (step.selector) {
    condMet = !!document.querySelector(step.selector.cssSelector)
    onLog(`  元素存在条件：${condMet ? '成立' : '不成立'}`)
  }
  await executeBranch(condMet, step, ctx, runChild)
}

async function handleElementBranch(
  step: FlowStep,
  ctx: RunContext,
  _resolve: ResolveFn,
  runChild: RunChildStepFn,
): Promise<void> {
  const { onLog } = ctx
  if (!step.selector) { onLog('[跳过] element_branch 缺少 selector'); return }
  const elemExists = !!document.querySelector(step.selector.cssSelector)
  onLog(`  元素分支：${step.selector.cssSelector.slice(0, 50)} → ${elemExists ? '存在' : '不存在'}`)
  await executeBranch(elemExists, step, ctx, runChild)
}

async function handleCallFlow(
  step: FlowStep,
  ctx: RunContext,
  _resolve: ResolveFn,
  runChild: RunChildStepFn,
): Promise<void> {
  const { onLog, signal } = ctx
  if (!step.flowRef) { onLog('[跳过] call_flow 缺少 flowRef'); return }
  const subFlow = ctx.flowCache?.get(step.flowRef)
  if (!subFlow) { onLog(`[跳过] 找不到嵌入流程 ${step.flowRef}`); return }
  onLog(`→ 嵌入执行：${subFlow.name}`)
  for (const s of subFlow.steps) {
    if (signal.stopped) return
    await runChild(s, { ...ctx, depth: ctx.depth + 1 })
  }
}

async function handleSaveCanvas(
  step: FlowStep,
  ctx: RunContext,
  resolve: ResolveFn,
  _runChild: RunChildStepFn,
): Promise<void> {
  const { onLog } = ctx
  if (!step.selector) { onLog('  [跳过] 截图缺少 selector'); return }

  const sel = step.selector.cssSelector
  const dataUrl = await captureScreenshot(step.selector, sel, resolve, onLog)
  if (!dataUrl) { onLog('  [跳过] 截图失败，无法保存'); return }

  const ts = toLocalTimeString().replace(/:/g, '-')
  const filename = `screenshot-${ts}.png`
  const saved = await saveViaBridge(dataUrl, filename, ctx)

  if (saved.ok) {
    ctx.screenshotCount++
    const varKey = step.value?.trim()
    if (varKey) {
      ctx.variables[varKey] = saved.id ?? saved.path ?? filename
      onLog(`  截图变量 → {{${varKey}}}`)
    }
    onLog(`  已保存 → ${saved.path ?? filename}（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
  } else {
    onLog(`  [降级] 本地截图服务失败：${saved.error ?? '本地截图服务未返回保存结果'}`)
    downloadFallback(dataUrl, filename, onLog)
  }
}

async function handleSaveData(
  step: FlowStep,
  ctx: RunContext,
  _resolve: ResolveFn,
  _runChild: RunChildStepFn,
): Promise<void> {
  const { onLog } = ctx
  const fieldNames = step.recordFields ?? []
  if (!fieldNames.length) { onLog('  [跳过] 保存数据：未选择任何变量'); return }

  const fields: Record<string, string> = {}
  for (const name of fieldNames) {
    const val = ctx.variables[name]
    if (val !== undefined) {
      fields[name] = val
    } else {
      onLog(`  变量 {{${name}}} 尚未赋值，跳过`)
    }
  }

  if (!Object.keys(fields).length) { onLog('  [跳过] 保存数据：所有变量均未赋值'); return }

  onLog(`  保存数据：${Object.keys(fields).join(', ')}`)

  try {
    const result = await chrome.runtime.sendMessage({
      type: MSG.SAVE_DATA_RECORD,
      fields,
      fieldAliases: step.recordFieldAliases,
      runId: ctx.runId,
      runStartedAt: ctx.runStartedAt,
      flowId: ctx.flowId,
      flowName: ctx.flowName,
      sourceUrl: location.href,
      sourceTitle: document.title,
    }) as { ok?: boolean; id?: string; error?: string } | undefined

    if (result?.ok) {
      onLog(`  数据已保存 → 记录 ${result.id}`)
    } else {
      onLog(`  [失败] 保存数据：${result?.error ?? '本地服务未响应'}`)
    }
  } catch (err) {
    onLog(`  [失败] 保存数据：${(err as Error).message}`)
  }
}

// ─── 注册表 ────────────────────────────────────────────────────────────────────

export const STEP_HANDLERS: Record<string, (step: FlowStep, ctx: RunContext, resolve: ResolveFn, runChild: RunChildStepFn) => Promise<void>> = {
  click:          handleClick,
  focus:          handleFocus,
  input:          handleInput,
  clear:          handleClear,
  select:         handleSelect,
  check:          handleCheck,
  get_text:       handleGetText,
  hover:          handleHover,
  double_click:   handleDoubleClick,
  right_click:    handleRightClick,
  press_key:      handlePressKey,
  wait_appear:    handleWaitAppear,
  wait_disappear: handleWaitDisappear,
  scroll_to:      handleScrollTo,
  navigate:       handleNavigate,
  delay:          handleDelay,
  loop_items:     handleLoopItems,
  condition:      handleCondition,
  element_branch: handleElementBranch,
  call_flow:      handleCallFlow,
  save_canvas:    handleSaveCanvas,
  save_data:      handleSaveData,
}
