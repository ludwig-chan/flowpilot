import type { FlowStep } from '@shared/types/flow'
import type { ResolveFn, RunChildStepFn, RunContext } from './types'
import { MSG } from '@shared/types/message'
import { screenshotCanvas } from './screenshotCanvas'
import { screenshotElement } from './screenshotElement'
import { waitForElementToDisappear } from './domResolver'
import { humanDelay, simulateClick, findScrollContainer, sleep, randomPosInRect } from './eventSimulator'
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
      await runChild(child, { ...ctx, context: undefined, depth: ctx.depth + 1 })
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
): Promise<string | null> {
  const quickEl = (() => { try { return document.querySelector(sel) } catch { return null } })()
  const likelyCanvas = quickEl === null || quickEl.tagName.toLowerCase() === 'canvas'

  let dataUrl: string | null = null
  if (likelyCanvas) dataUrl = await screenshotCanvas(sel, onLog)
  if (dataUrl === null) {
    if (likelyCanvas && quickEl !== null) onLog('  [降级] canvas 路径失败，尝试通用元素截图...')
    try {
      const el = await resolve(selector) as HTMLElement
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
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const saved = await chrome.runtime.sendMessage({
      type: MSG.SAVE_SCREENSHOT,
      dataUrl, filename,
      runId: ctx.runId, runStartedAt: ctx.runStartedAt,
      flowId: ctx.flowId, flowName: ctx.flowName,
      sourceUrl: location.href, sourceTitle: document.title,
    }) as { ok: boolean; path?: string; error?: string } | undefined
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

async function handleClick(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  simulateClick(el)
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
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  const opts: MouseEventInit = {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y,
    screenX: window.screenX + x, screenY: window.screenY + y,
    view: window,
  }
  el.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }))
  el.dispatchEvent(new MouseEvent('mouseover',  opts))
  el.dispatchEvent(new MouseEvent('mousemove',  opts))
}

async function handleDoubleClick(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  simulateClick(el)
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  el.dispatchEvent(new MouseEvent('dblclick', {
    bubbles: true, cancelable: true, detail: 2,
    clientX: x, clientY: y,
    screenX: window.screenX + x, screenY: window.screenY + y,
    view: window, button: 0, buttons: 0,
  }))
}

async function handleRightClick(step: FlowStep, _ctx: RunContext, resolve: ResolveFn): Promise<void> {
  const el = await resolve(step.selector!) as HTMLElement
  const rect = el.getBoundingClientRect()
  const { x, y } = randomPosInRect(rect)
  const opts: MouseEventInit = {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y,
    screenX: window.screenX + x, screenY: window.screenY + y,
    view: window, button: 2, buttons: 2,
  }
  el.dispatchEvent(new MouseEvent('mousedown',   opts))
  el.dispatchEvent(new MouseEvent('mouseup',     opts))
  el.dispatchEvent(new MouseEvent('contextmenu', opts))
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
  const itemsArr = Array.from(document.querySelectorAll(step.selector.cssSelector))
  onLog(`找到 ${itemsArr.length} 个条目，开始循环...`)
  const scrollBehavior = step.scrollBehavior ?? 'none'

  for (let i = 0; i < itemsArr.length; i++) {
    const item = itemsArr[i]
    if (signal.stopped) return
    onStep?.({ type: 'loop_progress', stepId: step.id, index: i + 1, total: itemsArr.length })
    if (scrollBehavior === 'item') {
      (item as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
      await sleep(400)
    }
    onLog(`  → 处理：${item.textContent?.trim().slice(0, 50)}`)
    if (step.children?.length) {
      for (const child of step.children) {
        if (signal.stopped) return
        await runChild(child, { ...ctx, context: item as Element, depth: ctx.depth + 1 })
      }
    }
    if (scrollBehavior === 'bottom') {
      const container = findScrollContainer(item)
      container.scrollTop = container.scrollHeight
      await sleep(300)
    }
    await humanDelay(...(step.itemDelay ?? [800, 2000]))
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
    await runChild(s, { ...ctx, context: undefined, depth: ctx.depth + 1 })
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

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const filename = `screenshot-${ts}.png`
  const saved = await saveViaBridge(dataUrl, filename, ctx)

  if (saved.ok) {
    ctx.screenshotCount++
    onLog(`  已保存 → ${saved.path ?? filename}（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
  } else {
    onLog(`  [降级] 本地截图服务失败：${saved.error ?? '本地截图服务未返回保存结果'}`)
    downloadFallback(dataUrl, filename, onLog)
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
}
