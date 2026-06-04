import type { FlowStep, StepDelayLevel, StepEvent } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import { screenshotCanvas }  from './screenshotCanvas'
import { screenshotElement } from './screenshotElement'
import { resolveElementByStrategy, waitForElementToDisappear } from './domResolver'
import { humanDelay, simulateClick, findScrollContainer, sleep } from './eventSimulator'
import { interpolate, evalCondition } from './conditionEval'

// ─── 运行上下文（替代模块级全局变量，支持并发独立控制）──────────────────────────
interface RunContext {
  variables: Record<string, string>
  onLog: (text: string) => void
  onStep?: (event: StepEvent) => void
  waitTimeout: number
  delayLevel: StepDelayLevel
  delayRange?: [number, number]
  depth: number
  context?: Element
  signal: { stopped: boolean }
}

let _currentSignal: { stopped: boolean } | null = null

export function stopFlow(): void {
  if (_currentSignal) _currentSignal.stopped = true
}

export async function runFlow(
  steps: FlowStep[],
  variables: Record<string, string>,
  onLog: (text: string) => void,
  onStep?: (event: StepEvent) => void,
  stepDelayLevel?: StepDelayLevel,
  stepDelayRange?: [number, number],
  waitTimeout?: number,
): Promise<void> {
  const signal = { stopped: false }
  _currentSignal = signal

  const ctx: RunContext = {
    variables,
    onLog,
    onStep,
    waitTimeout: waitTimeout ?? 10000,
    // undefined 视为 'medium'（与 UI 默认显示一致）
    delayLevel: stepDelayLevel ?? 'medium',
    delayRange: stepDelayRange,
    depth: 0,
    signal,
  }

  for (const step of steps) {
    if (signal.stopped) {
      onLog('流程已停止')
      return
    }
    await executeStep(step, ctx)
    await applyStepDelay(step, ctx)
  }

  onLog('✅ 流程执行完成')
}

async function executeStep(
  step: FlowStep,
  ctx: RunContext,
): Promise<void> {
  const { onLog, onStep, signal } = ctx
  onLog(`执行：${step.label}`)
  onStep?.({ type: 'step_start', stepId: step.id, label: step.label, depth: ctx.depth })

  // 有效超时：步骤级 > 流程级默认
  const effectiveTimeout = step.waitTimeout ?? ctx.waitTimeout

  // 元素查找 + foundDelay（元素出现后、动作执行前的随机等待）
  const resolveEl = async (strategy: import('@shared/types/flow').SelectorStrategy): Promise<Element> => {
    const isRelative = step.relativeSelector && ctx.context
    const root: ParentNode = isRelative ? ctx.context! : document
    const timeout = isRelative ? undefined : effectiveTimeout
    let el = await resolveElementByStrategy(strategy, root, timeout)
    // 兜底：相对查找失败时检查 context 本身是否匹配选择器
    // （用户将列表项容器自身作为操作目标时，querySelector 无法查到自己）
    if (!el && isRelative && ctx.context) {
      try { if (ctx.context.matches(strategy.cssSelector)) el = ctx.context } catch { /* ignore */ }
    }
    if (!el) {
      throw new Error(`等待元素超时（${effectiveTimeout}ms）：${strategy.cssSelector}`)
    }
    if (step.foundDelay) {
      await humanDelay(step.foundDelay[0], step.foundDelay[1])
    }
    return el
  }

  switch (step.type) {
    case 'click': {
      const el = await resolveEl(step.selector!) as HTMLElement
      simulateClick(el)
      break
    }

    case 'focus': {
      const el = await resolveEl(step.selector!) as HTMLElement
      el.focus()
      break
    }

    case 'input': {
      const el = await resolveEl(step.selector!) as HTMLElement
      const value = interpolate(step.value ?? '', ctx.variables)
      el.focus()

      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        // ── 标准 input / textarea：用原型链 native setter 绕过框架拦截 ──────────
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(el, value)
        } else {
          el.value = value
        }
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'insertText', data: value,
        }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        // ── contenteditable div 等：先全选再用 execCommand 插入文本 ─────────────
        // execCommand 会产生真实的 InputEvent（inputType='insertText'），
        // 对 Slate / ProseMirror / Draft.js / TipTap 等富文本框架兼容性最好
        const sel = window.getSelection()
        if (sel) {
          const range = document.createRange()
          range.selectNodeContents(el)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        const success = document.execCommand('insertText', false, value)
        if (!success) {
          // execCommand 不可用时的兜底：直接修改 textContent 并手动派发事件
          el.textContent = value
          el.dispatchEvent(new InputEvent('input', {
            bubbles: true, cancelable: true, inputType: 'insertText', data: value,
          }))
        }
      }
      break
    }

    case 'select': {
      const el = await resolveEl(step.selector!) as HTMLSelectElement
      const value = interpolate(step.value ?? '', ctx.variables)
      el.value = value
      el.dispatchEvent(new Event('change', { bubbles: true }))
      break
    }

    case 'wait_appear': {
      await resolveEl(step.selector!)
      break
    }

    case 'wait_disappear': {
      await waitForElementToDisappear(step.selector!.cssSelector)
      break
    }

    case 'scroll_to': {
      const el = await resolveEl(step.selector!)
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      break
    }

    case 'navigate': {
      const url = interpolate(step.value ?? '', ctx.variables)
      window.location.href = url
      break
    }

    case 'delay': {
      const ms = parseInt(step.value ?? '1000', 10)
      await sleep(ms)
      break
    }

    case 'loop_items': {
      if (!step.selector) break
      const itemsArr = Array.from(document.querySelectorAll(step.selector.cssSelector))
      const loopTotal = itemsArr.length
      onLog(`找到 ${loopTotal} 个条目，开始循环...`)
      const scrollBehavior = step.scrollBehavior ?? 'none'
      for (let _li = 0; _li < itemsArr.length; _li++) {
        const item = itemsArr[_li]
        if (signal.stopped) return
        onStep?.({ type: 'loop_progress', stepId: step.id, index: _li + 1, total: loopTotal })
        if (scrollBehavior === 'item') {
          ;(item as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
          await sleep(400)
        }
        onLog(`  → 处理：${item.textContent?.trim().slice(0, 50)}`)
        if (step.children?.length) {
          for (const child of step.children) {
            if (signal.stopped) return
            await executeStep(child, { ...ctx, context: item as Element, depth: ctx.depth + 1 })
            await applyStepDelay(child, ctx)
          }
        }
        if (scrollBehavior === 'bottom') {
          const container = findScrollContainer(item)
          container.scrollTop = container.scrollHeight
          await sleep(300)
        }
        await humanDelay(...(step.itemDelay ?? [800, 2000]))
      }
      break
    }

    case 'get_text': {
      const el = step.selector
        ? await resolveEl(step.selector).catch(() => null)
        : null
      const raw = el?.textContent?.trim() ?? ''
      const varKey = step.value?.trim()
      if (varKey) {
        ctx.variables[varKey] = raw
        onLog(`  获取文本 「${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}」 → {{${varKey}}}`)
      } else {
        onLog(`  获取文本 「${raw.slice(0, 40)}${raw.length > 40 ? '…' : ''}」（未指定变量名）`)
      }
      break
    }

    case 'save_canvas': {
      if (!step.selector) { onLog('  [跳过] 截图缺少 selector'); break }
      const sel = step.selector.cssSelector
      const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

      // 同步检查元素类型：是 canvas（含 iframe 内 canvas）→ canvas 专属路径；否则 → 通用元素路径
      const quickEl      = (() => { try { return document.querySelector(sel) } catch { return null } })()
      const likelyCanvas = quickEl === null || quickEl.tagName.toLowerCase() === 'canvas'

      let dataUrl: string | null = null

      if (likelyCanvas) {
        dataUrl = await screenshotCanvas(sel, onLog)
      }
      if (dataUrl === null) {
        if (likelyCanvas && quickEl !== null) onLog('  [降级] canvas 路径失败，尝试通用元素截图...')
        try {
          const el = await resolveEl(step.selector) as HTMLElement
          dataUrl = await screenshotElement(el, onLog)
        } catch (err) {
          onLog(`  [截图] 失败：${(err as Error).message}`)
        }
      }

      if (!dataUrl) { onLog('  [跳过] 截图失败，无法保存'); break }

      const filename = `screenshot-${ts}.png`
      const saved = await chrome.runtime.sendMessage({
        type: 'SAVE_SCREENSHOT',
        dataUrl,
        filename,
      }) as { ok: boolean; path?: string; error?: string } | undefined

      if (saved?.ok) {
        onLog(`  已保存 → ${saved.path ?? filename}（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
      } else {
        // 降级：客户端未运行时回退到浏览器下载
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = filename
        a.style.display = 'none'
        document.body.appendChild(a)
        a.click()
        a.remove()
        onLog(`  已保存（浏览器下载）→ ${filename}（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
      }
      break
    }

    case 'condition': {
      let condMet = false
      if (step.value?.trim()) {
        const expr = interpolate(step.value.trim(), ctx.variables)
        condMet = evalCondition(expr)
        onLog(`  条件表达式：${expr} → ${condMet ? '成立' : '不成立'}`)
      } else if (step.selector) {
        condMet = !!document.querySelector(step.selector.cssSelector)
        onLog(`  元素存在条件：${condMet ? '成立' : '不成立'}`)
      }
      const branchSteps = condMet ? step.children : step.elseChildren
      if (branchSteps?.length) {
        onLog(`  执行${condMet ? '成立' : '否则'}分支 (${branchSteps.length} 步)...`)
        for (const child of branchSteps) {
          if (signal.stopped) return
          await executeStep(child, { ...ctx, context: undefined, depth: ctx.depth + 1 })
          await applyStepDelay(child, ctx)
        }
      } else {
        onLog(`  条件${condMet ? '成立' : '不成立'}，无对应分支，跳过`)
      }
      break
    }

    case 'element_branch': {
      if (!step.selector) { onLog('[跳过] element_branch 缺少 selector'); break }
      const elemExists = !!document.querySelector(step.selector.cssSelector)
      onLog(`  元素分支：${step.selector.cssSelector.slice(0, 50)} → ${elemExists ? '存在' : '不存在'}`)
      const branchSteps = elemExists ? step.children : step.elseChildren
      if (branchSteps?.length) {
        onLog(`  执行${elemExists ? '存在' : '不存在'}分支 (${branchSteps.length} 步)...`)
        for (const child of branchSteps) {
          if (signal.stopped) return
          await executeStep(child, { ...ctx, context: undefined, depth: ctx.depth + 1 })
          await applyStepDelay(child, ctx)
        }
      } else {
        onLog(`  元素${elemExists ? '存在' : '不存在'}，无对应分支，跳过`)
      }
      break
    }

    case 'hover': {
      const el = await resolveEl(step.selector!) as HTMLElement
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width  * (0.3 + Math.random() * 0.4)
      const y = rect.top  + rect.height * (0.3 + Math.random() * 0.4)
      const opts: MouseEventInit = {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y,
        screenX: window.screenX + x, screenY: window.screenY + y,
        view: window,
      }
      el.dispatchEvent(new MouseEvent('mouseenter', { ...opts, bubbles: false }))
      el.dispatchEvent(new MouseEvent('mouseover',  opts))
      el.dispatchEvent(new MouseEvent('mousemove',  opts))
      break
    }

    case 'double_click': {
      const el = await resolveEl(step.selector!) as HTMLElement
      simulateClick(el)
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width  * (0.3 + Math.random() * 0.4)
      const y = rect.top  + rect.height * (0.3 + Math.random() * 0.4)
      const opts: MouseEventInit = {
        bubbles: true, cancelable: true, detail: 2,
        clientX: x, clientY: y,
        screenX: window.screenX + x, screenY: window.screenY + y,
        view: window, button: 0, buttons: 0,
      }
      el.dispatchEvent(new MouseEvent('dblclick', opts))
      break
    }

    case 'right_click': {
      const el = await resolveEl(step.selector!) as HTMLElement
      const rect = el.getBoundingClientRect()
      const x = rect.left + rect.width  * (0.3 + Math.random() * 0.4)
      const y = rect.top  + rect.height * (0.3 + Math.random() * 0.4)
      const opts: MouseEventInit = {
        bubbles: true, cancelable: true,
        clientX: x, clientY: y,
        screenX: window.screenX + x, screenY: window.screenY + y,
        view: window, button: 2, buttons: 2,
      }
      el.dispatchEvent(new MouseEvent('mousedown',   opts))
      el.dispatchEvent(new MouseEvent('mouseup',     opts))
      el.dispatchEvent(new MouseEvent('contextmenu', opts))
      break
    }

    case 'clear': {
      const el = await resolveEl(step.selector!) as HTMLElement
      el.focus()
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
        if (nativeSetter) {
          nativeSetter.call(el, '')
        } else {
          el.value = ''
        }
        el.dispatchEvent(new InputEvent('input',  { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      } else {
        // contenteditable div 等：全选后删除
        const sel = window.getSelection()
        if (sel) {
          const range = document.createRange()
          range.selectNodeContents(el)
          sel.removeAllRanges()
          sel.addRange(range)
        }
        const success = document.execCommand('delete', false)
        if (!success) {
          el.textContent = ''
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'deleteContentBackward' }))
        }
      }
      break
    }

    case 'check': {
      const el = await resolveEl(step.selector!) as HTMLInputElement
      const val = step.value?.trim().toLowerCase()
      const targetChecked = val === 'true' ? true : val === 'false' ? false : !el.checked
      if (el.checked !== targetChecked) {
        // 用 click() 触发 change 事件并更新 checked 状态，与真实用户操作一致
        el.click()
      }
      onLog(`  勾选状态：${el.checked} → ${targetChecked}`)
      break
    }

    case 'press_key': {
      const key = step.value ?? 'Enter'
      const target = step.selector
        ? (await resolveEl(step.selector)) as HTMLElement
        : (document.activeElement as HTMLElement | null) ?? document.body
      const opts: KeyboardEventInit = { key, code: key, bubbles: true, cancelable: true }
      target.dispatchEvent(new KeyboardEvent('keydown', opts))
      target.dispatchEvent(new KeyboardEvent('keypress', opts))
      target.dispatchEvent(new KeyboardEvent('keyup', opts))
      if (key === 'Enter') {
        const form = target.closest?.('form') as HTMLFormElement | null
        form?.requestSubmit?.()
      }
      break
    }

    case 'call_flow': {
      if (!step.flowRef) { onLog('[跳过] call_flow 缺少 flowRef'); break }
      let subRes: { ok: boolean; flows: Array<{ id: string; name: string; steps: FlowStep[] }> } | undefined
      try {
        subRes = await chrome.runtime.sendMessage({ type: 'GET_BUILT_FLOWS' })
      } catch { /* ignore */ }
      const subFlow = subRes?.flows?.find(f => f.id === step.flowRef)
      if (!subFlow) { onLog(`[跳过] 找不到嵌入流程 ${step.flowRef}`); break }
      onLog(`→ 嵌入执行：${subFlow.name}`)
      for (const s of subFlow.steps) {
        if (signal.stopped) return
        await executeStep(s, { ...ctx, context: undefined, depth: ctx.depth + 1 })
        await applyStepDelay(s, ctx)
      }
      break
    }

    default:
      onLog(`[跳过] 暂未实现的动作类型：${(step as FlowStep).type}`)
  }
  onStep?.({ type: 'step_done', stepId: step.id, depth: ctx.depth })
}

// ─── 步骤间延迟（统一逻辑，消除重复）─────────────────────────────────────────────
async function applyStepDelay(step: FlowStep, ctx: RunContext): Promise<void> {
  if (step.delay) {
    await humanDelay(step.delay[0], step.delay[1])
  } else if (ctx.delayLevel !== 'none') {
    const range = ctx.delayLevel === 'custom' ? ctx.delayRange : STEP_DELAY_PRESETS[ctx.delayLevel]
    if (range) await humanDelay(range[0], range[1])
  }
}


