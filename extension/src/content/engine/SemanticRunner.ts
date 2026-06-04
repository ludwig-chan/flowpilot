import type { FlowStep, StepDelayLevel, StepEvent } from '@shared/types/flow'
import { STEP_DELAY_PRESETS } from '@shared/types/flow'
import { screenshotCanvas }  from './screenshotCanvas'
import { screenshotElement } from './screenshotElement'

let _stopped = false

export function stopFlow(): void {
  _stopped = true
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
  _stopped = false
  const defaultWaitTimeout = waitTimeout ?? 10000

  // undefined 视为 'medium'（与 UI 默认显示一致）
  const effectiveDelayLevel: StepDelayLevel = stepDelayLevel ?? 'medium'

  for (const step of steps) {
    if (_stopped) {
      onLog('流程已停止')
      return
    }
    await executeStep(step, variables, onLog, onStep, undefined, defaultWaitTimeout, effectiveDelayLevel, stepDelayRange, 0)

    // 步骤间延迟：优先使用步骤自身的 delay，否则使用全局档位
    if (step.delay) {
      await humanDelay(step.delay[0], step.delay[1])
    } else if (effectiveDelayLevel !== 'none') {
      const range = effectiveDelayLevel === 'custom'
        ? stepDelayRange
        : STEP_DELAY_PRESETS[effectiveDelayLevel]
      if (range) await humanDelay(range[0], range[1])
    }
  }

  onLog('✅ 流程执行完成')
}

async function executeStep(
  step: FlowStep,
  variables: Record<string, string>,
  onLog: (text: string) => void,
  onStep: ((event: StepEvent) => void) | undefined,
  context?: Element,       // loop_items 传入当前列表项，relativeSelector=true 的子步骤在此范围内查找
  waitTimeout = 10000,     // 等待元素出现的超时（流程级默认，可被步骤级覆盖）
  delayLevel?: StepDelayLevel,   // 全局延迟档位，子步骤无自身 delay 时 fallback
  delayRange?: [number, number], // 自定义档位对应的范围
  depth = 0,
): Promise<void> {
  onLog(`执行：${step.label}`)
  onStep?.({ type: 'step_start', stepId: step.id, label: step.label, depth })

  // 有效超时：步骤级 > 流程级默认
  const effectiveTimeout = step.waitTimeout ?? waitTimeout

  // 元素查找 + foundDelay（元素出现后、动作执行前的随机等待）
  const resolveEl = async (strategy: import('@shared/types/flow').SelectorStrategy): Promise<Element> => {
    const isRelative = step.relativeSelector && context
    const root: ParentNode = isRelative ? context : document
    const timeout = isRelative ? undefined : effectiveTimeout
    let el = await resolveElementByStrategy(strategy, root, timeout)
    // 兜底：相对查找失败时检查 context 本身是否匹配选择器
    // （用户将列表项容器自身作为操作目标时，querySelector 无法查到自己）
    if (!el && isRelative && context) {
      try { if ((context as Element).matches(strategy.cssSelector)) el = context as Element } catch { /* ignore */ }
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
      const value = interpolate(step.value ?? '', variables)
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
      const value = interpolate(step.value ?? '', variables)
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
      const url = interpolate(step.value ?? '', variables)
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
        if (_stopped) return
        onStep?.({ type: 'loop_progress', stepId: step.id, index: _li + 1, total: loopTotal })
        if (scrollBehavior === 'item') {
          ;(item as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' })
          await sleep(400)
        }
        onLog(`  → 处理：${item.textContent?.trim().slice(0, 50)}`)
        if (step.children?.length) {
          for (const child of step.children) {
            if (_stopped) return
            await executeStep(child, variables, onLog, onStep, item, waitTimeout, delayLevel, delayRange, depth + 1)
            if (child.delay) {
              await humanDelay(child.delay[0], child.delay[1])
            } else if (delayLevel && delayLevel !== 'none') {
              const range = delayLevel === 'custom' ? delayRange : STEP_DELAY_PRESETS[delayLevel]
              if (range) await humanDelay(range[0], range[1])
            }
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
        variables[varKey] = raw
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

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `screenshot-${ts}.png`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      a.remove()
      onLog(`  已保存 → screenshot-${ts}.png（${Math.round(dataUrl.length * 0.75 / 1024)} KB）`)
      break
    }

    case 'condition': {
      let condMet = false
      if (step.value?.trim()) {
        const expr = interpolate(step.value.trim(), variables)
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
          if (_stopped) return
          await executeStep(child, variables, onLog, onStep, undefined, waitTimeout, delayLevel, delayRange, depth + 1)
          if (child.delay) {
            await humanDelay(child.delay[0], child.delay[1])
          } else if (delayLevel && delayLevel !== 'none') {
            const range = delayLevel === 'custom' ? delayRange : STEP_DELAY_PRESETS[delayLevel]
            if (range) await humanDelay(range[0], range[1])
          }
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
          if (_stopped) return
          await executeStep(child, variables, onLog, onStep, undefined, waitTimeout, delayLevel, delayRange, depth + 1)
          if (child.delay) {
            await humanDelay(child.delay[0], child.delay[1])
          } else if (delayLevel && delayLevel !== 'none') {
            const range = delayLevel === 'custom' ? delayRange : STEP_DELAY_PRESETS[delayLevel]
            if (range) await humanDelay(range[0], range[1])
          }
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
        if (_stopped) return
        await executeStep(s, variables, onLog, onStep, undefined, waitTimeout, delayLevel, delayRange, depth + 1)
        if (s.delay) {
          await humanDelay(s.delay[0], s.delay[1])
        } else if (delayLevel && delayLevel !== 'none') {
          const range = delayLevel === 'custom' ? delayRange : STEP_DELAY_PRESETS[delayLevel]
          if (range) await humanDelay(range[0], range[1])
        }
      }
      break
    }

    default:
      onLog(`[跳过] 暂未实现的动作类型：${(step as FlowStep).type}`)
  }
  onStep?.({ type: 'step_done', stepId: step.id, depth })
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────────

/**
 * 按 SelectorStrategy 多策略查找元素，优先使用语义属性，CSS 选择器最后兜底。
 * - 有语义属性时：用语义属性过滤候选，再用 cssSelector 交叉确认（宽松匹配）
 * - CSS 含 nth-child 时：结果与文本内容交叉核验，防止位置偏移后误匹配
 * root: 查找范围（全局 document 或列表项 context）
 * timeout: 仅 root===document 时等待元素出现；context 内直接同步查找
 */
async function resolveElementByStrategy(
  strategy: import('@shared/types/flow').SelectorStrategy,
  root: ParentNode,
  timeout?: number,
): Promise<Element | null> {
  // ── iframe 穿透：若 selector 携带 iframeSelector，先找 iframe 再在其内部查找 ──
  if (strategy.iframeSelector) {
    const iframeEl = document.querySelector(strategy.iframeSelector) as HTMLIFrameElement | null
    const iframeDoc = iframeEl?.contentDocument
    if (!iframeDoc) return null
    return resolveElementByStrategy({ ...strategy, iframeSelector: undefined }, iframeDoc, timeout)
  }

  const isGlobal = root === document

  // ── 1. 语义候选池（ariaLabel / role / dataTestId / text）──────────────────
  const semanticFind = (): Element | null => {
    const { ariaLabel, role, dataTestId, text, cssSelector } = strategy

    // 先用 cssSelector 拿候选（可能多个），再语义筛选
    let candidates: Element[]
    try {
      candidates = Array.from((root as Element | Document).querySelectorAll(cssSelector))
    } catch {
      candidates = []
    }

    // 语义筛选（任一属性命中即可）
    const semantic = candidates.filter(el => {
      if (ariaLabel && el.getAttribute('aria-label') === ariaLabel) return true
      if (dataTestId && el.getAttribute('data-testid') === dataTestId) return true
      if (role && el.getAttribute('role') === role) return true
      if (text) {
        const t = el.textContent?.trim()
        // 精确匹配或前缀匹配（text 可能被截断到 80 字符）
        if (t === text || (text.length >= 20 && t?.startsWith(text.slice(0, 20)))) return true
      }
      return false
    })
    if (semantic.length === 1) return semantic[0]
    if (semantic.length > 1) {
      // 多个命中：优先精确匹配 ariaLabel，否则取第一个
      return semantic.find(el => el.getAttribute('aria-label') === ariaLabel) ?? semantic[0]
    }

    // 语义没匹配到时降级：检查 cssSelector 是否含 nth-child
    // 若不含，直接信任 CSS 结果；若含，尝试用文本内容找最近似的
    if (candidates.length === 1) return candidates[0]
    if (candidates.length > 1) return candidates[0]

    // 还是没有：当 CSS 含 nth-child 时，尝试在同类兄弟中按文本找
    if (text && strategy.cssSelector.includes('nth-child')) {
      // 去掉最后的 nth-child 段，扩大搜索范围
      const broader = strategy.cssSelector.replace(/:nth-child\(\d+\)/g, '')
      try {
        const broader_els = Array.from((root as Element | Document).querySelectorAll(broader))
        const byText = broader_els.find(el => {
          const t = el.textContent?.trim()
          return t === text || (text.length >= 10 && t?.includes(text.slice(0, 10)))
        })
        if (byText) return byText
      } catch { /* ignore */ }
    }

    // CSS 候选为空时：纯语义全文档兜底（应对动态 id 导致 cssSelector 完全失效）
    if (candidates.length === 0 && (ariaLabel || dataTestId || text)) {
      const all = Array.from((root as Element | Document).querySelectorAll('*'))
      const tag = strategy.cssSelector.split(/[\s>]/).pop()?.replace(/:.*$/, '').replace(/#.*$/, '') ?? ''
      const scoped = tag ? all.filter(el => el.tagName.toLowerCase() === tag) : all
      const fallback = scoped.find(el => {
        if (ariaLabel && el.getAttribute('aria-label') === ariaLabel) return true
        if (dataTestId && el.getAttribute('data-testid') === dataTestId) return true
        if (text) {
          const t = el.textContent?.trim()
          return t === text || (text.length >= 10 && t?.startsWith(text.slice(0, 10)))
        }
        return false
      })
      if (fallback) return fallback
    }

    return null
  }

  // context 内直接同步查找
  if (!isGlobal) return semanticFind()

  // 全局：先同步，找不到就等待 DOM 变化后重试
  const immediate = semanticFind()
  if (immediate) return immediate

  if (!timeout) return null

  return new Promise<Element | null>(resolve => {
    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)

    const observer = new MutationObserver(() => {
      const el = semanticFind()
      if (el) {
        clearTimeout(timer)
        observer.disconnect()
        resolve(el)
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

function waitForElementToDisappear(selector: string, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(selector)) {
      resolve()
      return
    }

    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error(`等待元素消失超时：${selector}`))
    }, timeout)

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        clearTimeout(timer)
        observer.disconnect()
        resolve()
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function humanDelay(min: number, max: number): Promise<void> {
  // Box-Muller 变换，模拟人类反应时间的正态分布（比均匀分布更难被行为分析识别）
  const u1 = Math.random() || 1e-10  // 避免 log(0)
  const u2 = Math.random()
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  const mid = (min + max) / 2
  const sigma = (max - min) / 6
  const ms = Math.max(min, Math.min(max, mid + normal * sigma))
  return sleep(ms)
}

function simulateClick(el: HTMLElement): void {
  const rect = el.getBoundingClientRect()
  // 在元素内随机取一个点，而不是固定用中心点
  const x = rect.left + rect.width  * (0.3 + Math.random() * 0.4)
  const y = rect.top  + rect.height * (0.3 + Math.random() * 0.4)
  const opts: MouseEventInit = {
    bubbles: true, cancelable: true,
    clientX: x, clientY: y,
    screenX: window.screenX + x, screenY: window.screenY + y,
    view: window,
  }
  el.dispatchEvent(new MouseEvent('mouseover',  opts))
  el.dispatchEvent(new MouseEvent('mousemove',  opts))
  el.dispatchEvent(new MouseEvent('mousedown',  { ...opts, button: 0, buttons: 1 }))
  el.dispatchEvent(new MouseEvent('mouseup',    { ...opts, button: 0, buttons: 0 }))
  el.dispatchEvent(new MouseEvent('click',      { ...opts, button: 0, buttons: 0 }))
}

function findScrollContainer(el: Element): HTMLElement {
  let cur = el.parentElement
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur)
    const oy = style.overflowY
    if ((oy === 'scroll' || oy === 'auto') && cur.scrollHeight > cur.clientHeight) return cur
    cur = cur.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.body
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? '')
}

// 安全地对字符串表达式求值（支持 > < >= <= == != contains）
// 示例：'35 > 30'、'hello contains world'、'18 >= 18'
function evalCondition(expr: string): boolean {
  const trim = (s: string) => s.trim().replace(/^["']|["']$/g, '')
  // 从字符串中提取数字（支持 "¥350"、"共 42 条" 等格式）
  const num = (s: string) => {
    const n = parseFloat(s)
    if (!isNaN(n)) return n
    const m = s.match(/-?\d+\.?\d*/)
    return m ? parseFloat(m[0]) : NaN
  }

  // 按运算符优先级从长到短匹配，避免 >= 被 > 提前截断
  const ops = ['>=', '<=', '!=', '==', 'not_contains', 'contains', '>', '<']
  for (const op of ops) {
    const idx = expr.indexOf(op)
    if (idx === -1) continue
    const left = trim(expr.slice(0, idx))
    const right = trim(expr.slice(idx + op.length))
    if (op === 'contains') return left.includes(right)
    if (op === 'not_contains') return !left.includes(right)
    const l = num(left), r = num(right)
    if (!isNaN(l) && !isNaN(r)) {
      if (op === '>') return l > r
      if (op === '<') return l < r
      if (op === '>=') return l >= r
      if (op === '<=') return l <= r
      if (op === '==') return l === r
      if (op === '!=') return l !== r
    }
    // 字符串比较
    if (op === '==') return left === right
    if (op === '!=') return left !== right
    return false
  }
  // 无运算符：非空视为真
  return expr.trim().length > 0
}
