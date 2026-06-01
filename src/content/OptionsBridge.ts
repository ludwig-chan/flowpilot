/**
 * Optionsbridge.ts
 * Content script 侧：处理来自 Options 页面（经 background 中转）的消息
 * - DOM 扫描并序列化
 * - 元素拾取模式
 * - 元素高亮
 * - 流程执行（转发给 SemanticRunner）
 */

import type {
  SerializedDomNode,
  SerializedElement,
  RequestDomScanMessage,
  RequestPickElementMessage,
  CancelPickElementMessage,
  RequestHighlightMessage,
  RequestTestClickMessage,
  RunFlowInTabMessage,
  StopFlowInTabMessage,
} from '@shared/types/dom'
import type { SelectorStrategy } from '@shared/types/flow'
import type { RepeatingCandidate } from '@shared/types/message'
import { runFlow, stopFlow } from './engine/SemanticRunner'

// ─── 排除标签（与 ConsolePanel 保持一致） ─────────────────────────────────────
const EXCLUDE_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD',
  'HTML', 'BR', 'HR', 'NOSCRIPT', 'TEMPLATE', 'SLOT'])

// ─── 元素拾取状态 ──────────────────────────────────────────────────────────────
let pickCleanup: (() => void) | null = null

// ─── 智能循环候选高亮状态 ─────────────────────────────────────────────────────
const loopHighlightEls: HTMLElement[] = []

// ─── 元素出现触发器 ───────────────────────────────────────────────────────────
function watchElementTrigger(flowId: string, selector: string, delay: number): void {
  try {
    if (document.querySelector(selector)) {
      setTimeout(() => chrome.runtime.sendMessage({ type: 'ELEMENT_TRIGGER_FIRED', flowId }).catch(() => {}), delay)
      return
    }
  } catch { return } // 非法选择器，直接忽略

  const observer = new MutationObserver(() => {
    try {
      if (!document.querySelector(selector)) return
    } catch { observer.disconnect(); return }
    observer.disconnect()
    setTimeout(() => chrome.runtime.sendMessage({ type: 'ELEMENT_TRIGGER_FIRED', flowId }).catch(() => {}), delay)
  })
  try {
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
  } catch { /* 页面尚未准备好，忽略 */ }
}

// ─── 初始化：注册消息监听 ─────────────────────────────────────────────────────
export function initOptionsBridge(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'REQUEST_DOM_SCAN') {
      handleDomScan()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'REQUEST_PICK_ELEMENT') {
      handlePickElement()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'CANCEL_PICK_ELEMENT') {
      pickCleanup?.()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'REQUEST_HIGHLIGHT') {
      handleHighlight((msg as RequestHighlightMessage).cssSelector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'REQUEST_TEST_CLICK') {
      handleTestClick((msg as RequestTestClickMessage).cssSelector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'RUN_FLOW_IN_TAB') {
      const m = msg as RunFlowInTabMessage
      runFlow(m.steps, m.variables ?? {}, (text) => {
        chrome.runtime.sendMessage({ type: 'FLOW_LOG_FROM_TAB', text }).catch(() => {})
      }, m.stepDelayLevel, m.stepDelayRange, m.waitTimeout).then(() => {
        chrome.runtime.sendMessage({ type: 'FLOW_DONE_FROM_TAB' }).catch(() => {})
      }).catch((e: unknown) => {
        chrome.runtime.sendMessage({ type: 'FLOW_ERROR_FROM_TAB', error: String(e) }).catch(() => {})
      })
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'STOP_FLOW_IN_TAB') {
      stopFlow()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'WATCH_ELEMENT_TRIGGER') {
      const { flowId, selector, delay = 0 } = msg as { type: string; flowId: string; selector: string; delay: number }
      watchElementTrigger(flowId, selector, delay)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'REQUEST_SMART_LOOP_ANALYZE') {
      handleSmartLoopAnalyze()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'HIGHLIGHT_LOOP_CANDIDATES') {
      handleHighlightCandidates((msg as { type: string; selector: string }).selector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === 'CLEAR_LOOP_HIGHLIGHTS') {
      clearLoopHighlights()
      sendResponse({ ok: true })
      return
    }
  })
}

// ─── DOM Mutation Observer（页面结构变化时通知 Options 自动刷新树） ─────────────
let _mutationTimer: ReturnType<typeof setTimeout> | null = null
let _mutationObserver: MutationObserver | null = null

function ensureDomObserver(): void {
  if (_mutationObserver) return
  _mutationObserver = new MutationObserver((mutations) => {
    // 只关心真实的结构变化（新增/删除节点），忽略纯 attribute / characterData 变化
    const hasStructuralChange = mutations.some(m => {
      if (m.type !== 'childList') return false
      // 过滤掉只含 text / script / style 节点的变化
      const relevant = (list: NodeList) => Array.from(list).some(n => {
        if (n.nodeType === Node.TEXT_NODE) return false
        if (n.nodeType !== Node.ELEMENT_NODE) return false
        const tag = (n as Element).tagName
        return !EXCLUDE_TAGS.has(tag)
      })
      return relevant(m.addedNodes) || relevant(m.removedNodes)
    })
    if (!hasStructuralChange) return
    if (_mutationTimer) clearTimeout(_mutationTimer)
    _mutationTimer = setTimeout(() => {
      chrome.runtime.sendMessage({ type: 'DOM_MUTATION' }).catch(() => {})
    }, 1200)
  })
  if (document.body) {
    _mutationObserver.observe(document.body, { childList: true, subtree: true })
  }
}

// ─── DOM 扫描 ─────────────────────────────────────────────────────────────────
function handleDomScan(): void {
  ensureDomObserver()
  const tree = buildSerializedTree()
  chrome.runtime.sendMessage({
    type:     'DOM_SCAN_RESULT',
    tabTitle: document.title,
    tabUrl:   location.href,
    tree,
  }).catch(() => {})
}

function buildSerializedTree(): SerializedDomNode[] {
  const MAX_DEPTH = 30
  const MAX_NODES = 5000
  let nodeCount = 0

  const walk = (el: Element, depth: number, iframeEl: HTMLIFrameElement | null = null): SerializedDomNode | null => {
    if (EXCLUDE_TAGS.has(el.tagName)) return null
    if (nodeCount >= MAX_NODES) return null

    const elHTML = el as HTMLElement
    const isInlineHidden = elHTML.hidden
      || elHTML.style?.display === 'none'
      || elHTML.style?.visibility === 'hidden'
      || el.getAttribute('aria-hidden') === 'true'
    if (isInlineHidden && el.children.length > 2) return null

    const tagLower = el.tagName.toLowerCase()
    const cr = el.getBoundingClientRect()
    const node: SerializedDomNode = {
      depth,
      tag:      tagLower,
      id:       el.id ?? '',
      classes:  typeof el.className === 'string' ? el.className : '',
      item:     serializeElement(el, iframeEl),
      children: [],
      w:       cr.width  > 0 ? Math.round(cr.width)  : undefined,
      h:       cr.height > 0 ? Math.round(cr.height) : undefined,
      scrollW: el.scrollWidth  > el.clientWidth  + 1 ? el.scrollWidth  : undefined,
      scrollH: el.scrollHeight > el.clientHeight + 1 ? el.scrollHeight : undefined,
    }
    nodeCount++

    if (tagLower === 'svg') return node

    if (tagLower === 'iframe') {
      try {
        const iframeDoc = (el as HTMLIFrameElement).contentDocument
        if (iframeDoc?.body) {
          for (const child of iframeDoc.body.children) {
            if (nodeCount >= MAX_NODES) break
            const childNode = walk(child, depth + 1, el as HTMLIFrameElement)
            if (childNode) node.children.push(childNode)
          }
        }
      } catch { /* cross-origin */ }
      return node
    }

    if (depth < MAX_DEPTH) {
      const shadowRoot = (el as Element & { shadowRoot?: ShadowRoot | null }).shadowRoot
      if (shadowRoot) {
        for (const child of shadowRoot.children) {
          if (nodeCount >= MAX_NODES) break
          const childNode = walk(child, depth + 1, iframeEl)
          if (childNode) node.children.push(childNode)
        }
      }
      for (const child of el.children) {
        if (nodeCount >= MAX_NODES) break
        const childNode = walk(child, depth + 1, iframeEl)
        if (childNode) node.children.push(childNode)
      }
    }
    return node
  }

  const result: SerializedDomNode[] = []
  if (document.body) {
    for (const child of document.body.children) {
      const node = walk(child, 0)
      if (node) result.push(node)
    }
  }
  return result
}

// ─── 元素序列化（可操作性分类，不含 Element 引用） ───────────────────────────
function serializeElement(el: Element, iframeEl: HTMLIFrameElement | null = null): SerializedElement | null {
  if (EXCLUDE_TAGS.has(el.tagName)) return null

  const tag       = el.tagName.toLowerCase()
  const role      = el.getAttribute('role') ?? ''
  const inputType = (el as HTMLInputElement).type?.toLowerCase() ?? ''
  const cs        = window.getComputedStyle(el as HTMLElement)
  const hidden    = cs.display === 'none' || cs.visibility === 'hidden' || (el as HTMLElement).hidden

  let kind:       SerializedElement['kind']       = 'unknown'
  let confidence: SerializedElement['confidence'] = 'low'

  if (tag === 'input' && !['hidden', 'submit', 'button', 'image', 'reset'].includes(inputType)) {
    kind = 'input'; confidence = 'high'
  } else if (tag === 'textarea' || el.getAttribute('contenteditable') === 'true') {
    kind = 'input'; confidence = 'high'
  } else if (tag === 'select') {
    kind = 'select'; confidence = 'high'
  } else if (tag === 'button' || tag === 'a' || tag === 'summary') {
    kind = 'click'; confidence = 'high'
  } else if (['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'option'].includes(role)) {
    kind = 'click'; confidence = 'high'
  } else if (tag === 'input' && ['submit', 'button', 'image', 'reset'].includes(inputType)) {
    kind = 'click'; confidence = 'high'
  } else if (el.hasAttribute('onclick') || el.hasAttribute('data-testid')) {
    kind = 'click'; confidence = 'medium'
  } else if (cs.cursor === 'pointer') {
    kind = 'click'; confidence = 'medium'
  } else if (el.hasAttribute('tabindex')) {
    kind = 'click'; confidence = 'medium'
  } else {
    const txt = el.textContent?.trim() ?? ''
    if (!txt && el.children.length > 3) return null
    confidence = 'low'
    kind = 'unknown'
  }

  if (hidden) confidence = 'low'

  const selector = buildSelector(el, iframeEl)
  if (!selector) return null

  const matchCount = (() => {
    try { return el.ownerDocument.querySelectorAll(selector.cssSelector).length }
    catch { return 1 }
  })()

  return {
    kind,
    confidence,
    label:      buildLabel(el),
    matchCount,
    selector,
  }
}

function buildLabel(el: Element): string {
  const tag         = el.tagName.toLowerCase()
  const ariaLabel   = el.getAttribute('aria-label')
  const title       = el.getAttribute('title')
  const placeholder = (el as HTMLInputElement).placeholder
  const text        = el.textContent?.trim().slice(0, 40)
  const name        = (el as HTMLInputElement).name
  const desc        = ariaLabel || title || placeholder || text || name || ''
  const idPart      = el.id ? `#${el.id}` : ''
  const clsPart     = el.classList.length
    ? [...el.classList].slice(0, 2).map(c => `.${c}`).join('')
    : ''
  return `${tag}${idPart}${clsPart}${desc ? `  "${desc}"` : ''}`
}

function buildSelector(el: Element, iframeEl: HTMLIFrameElement | null = null): SelectorStrategy | null {
  const cssSelector = getCssSelector(el)
  if (!cssSelector) return null
  return {
    cssSelector,
    iframeSelector: iframeEl ? getCssSelector(iframeEl) : undefined,
    ariaLabel:  el.getAttribute('aria-label') ?? undefined,
    role:       el.getAttribute('role') ?? undefined,
    dataTestId: el.getAttribute('data-testid') ?? undefined,
    text:       el.textContent?.trim().slice(0, 80) || undefined,
  }
}

function isDynamicId(id: string): boolean {
  return id.split(/[-_]/).some(seg => seg.length >= 5 && /[a-z]/i.test(seg) && /[0-9]/.test(seg))
}

function getCssSelector(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el
  const root = el.ownerDocument.documentElement
  while (cur && cur !== root) {
    let seg = cur.tagName.toLowerCase()
    if (cur.id && !isDynamicId(cur.id)) {
      seg += `#${CSS.escape(cur.id)}`
      parts.unshift(seg)
      break
    }
    const siblings = cur.parentElement ? [...cur.parentElement.children] : []
    const idx      = siblings.indexOf(cur) + 1
    if (siblings.filter(s => s.tagName === cur!.tagName).length > 1) seg += `:nth-child(${idx})`
    parts.unshift(seg)
    cur = cur.parentElement
  }
  return parts.join(' > ')
}

// ─── 智能循环辅助函数 ─────────────────────────────────────────────────────────

/** class 名看起来像自动生成（含大量数字/过长），则视为不稳定 */
function isAutoGeneratedClass(cls: string): boolean {
  if (/^[a-f0-9]{5,}$/i.test(cls)) return true  // 纯 hex hash
  if (/[0-9]{3,}/.test(cls)) return true          // 含 3+ 位连续数字
  if (cls.length > 20) return true                 // 过长
  return false
}

/** 构建列表项的匹配片段（tag + 稳定 class，不含位置伪类） */
function buildItemSegment(el: Element): string {
  const tag           = el.tagName.toLowerCase()
  const stableClasses = [...el.classList].filter(c => !isAutoGeneratedClass(c)).slice(0, 2)
  if (stableClasses.length === 0) return tag
  return tag + stableClasses.map(c => `.${CSS.escape(c)}`).join('')
}

/** 构建相对路径中某层元素的片段（尽量用 class，否则 nth-child 兜底） */
function buildRelativeSegment(el: Element): string {
  const tag      = el.tagName.toLowerCase()
  const parent   = el.parentElement
  if (!parent) return tag
  const siblings = Array.from(parent.children)

  // 同 tag 只有一个 → tag 即可唯一定位
  if (siblings.filter(s => s.tagName === el.tagName).length === 1) return tag

  // 尝试 tag + 稳定 class 组合
  const stableClasses = [...el.classList].filter(c => !isAutoGeneratedClass(c)).slice(0, 2)
  if (stableClasses.length > 0) {
    const clsPart    = stableClasses.map(c => `.${CSS.escape(c)}`).join('')
    const matchCount = siblings.filter(s => {
      if (s.tagName !== el.tagName) return false
      const sCls = [...s.classList].filter(c => !isAutoGeneratedClass(c)).slice(0, 2)
      return sCls.join(',') === stableClasses.join(',')
    }).length
    if (matchCount === 1) return `${tag}${clsPart}`
  }

  // 兜底：nth-child
  return `${tag}:nth-child(${siblings.indexOf(el) + 1})`
}

/** 将 pathUp（从 item 子节点到 pickedEl 的元素列表）拼成相对选择器 */
function buildRelativePath(pathUp: Element[]): string {
  return pathUp.map(el => buildRelativeSegment(el)).join(' > ')
}

/** 根据 tagName / role / class 推断人类可读的中文标签 */
function inferCandidateLabel(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const tagLabels: Record<string, string> = {
    tr: '表格行', li: '列表项', td: '表格列', th: '表头列',
    option: '下拉选项', dt: '定义项', dd: '定义说明',
  }
  if (tagLabels[tag]) return tagLabels[tag]

  const role = el.getAttribute('role') ?? ''
  const roleLabels: Record<string, string> = {
    row: '表格行', listitem: '列表项', option: '选项',
    treeitem: '树节点', tab: '标签页', menuitem: '菜单项',
  }
  if (roleLabels[role]) return roleLabels[role]

  const cls = [...el.classList].join(' ').toLowerCase()
  if (cls.includes('card'))    return '卡片'
  if (cls.includes('item'))    return '列表项'
  if (cls.includes('row'))     return '行'
  if (cls.includes('result'))  return '结果项'
  if (cls.includes('entry'))   return '条目'
  if (cls.includes('product')) return '商品'
  return `${tag} 元素组`
}

/**
 * 从拾取的元素往上爬 DOM，找出所有「同级有重复兄弟」的祖先层作为候选列表项。
 * 每个候选包含：覆盖所有列表项的选择器、从列表项到目标元素的相对路径、匹配数量。
 */
function analyzeRepeatingAncestors(pickedEl: Element): RepeatingCandidate[] {
  const candidates: RepeatingCandidate[] = []
  const MAX_DEPTH = 8
  let current: Element | null = pickedEl
  const pathUp: Element[] = []  // 从 pickedEl 往上逐层 unshift，记录相对路径
  let depth = 0

  while (
    current &&
    current !== document.body &&
    current !== document.documentElement &&
    depth <= MAX_DEPTH
  ) {
    const parent = current.parentElement
    if (parent && parent !== document.documentElement) {
      const sameSiblings = Array.from(parent.children).filter(s => s.tagName === current!.tagName)
      if (sameSiblings.length >= 2) {
        const parentSel  = getCssSelector(parent)
        const itemSel    = `${parentSel} > ${buildItemSegment(current)}`
        let count = 0
        try { count = document.querySelectorAll(itemSel).length } catch { /* 无效选择器，跳过 */ }
        if (count >= 2) {
          candidates.push({
            itemSelector:     itemSel,
            relativeSelector: buildRelativePath(pathUp),
            count,
            tagName:          current.tagName,
            inferredLabel:    inferCandidateLabel(current),
            depth,
          })
        }
      }
    }
    pathUp.unshift(current)
    current = current.parentElement
    depth++
  }
  return candidates
}

// ─── 元素拾取 ─────────────────────────────────────────────────────────────────
function handlePickElement(): void {
  pickCleanup?.()  // 取消之前可能存在的拾取

  const ov    = document.createElement('div')
  const hlDiv = document.createElement('div')
  ov.style.cssText    = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair'
  hlDiv.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;' +
    'border:2px solid #89b4fa;background:rgba(137,180,250,.15);' +
    'box-sizing:border-box;border-radius:2px;transition:all .05s'
  document.body.append(ov, hlDiv)

  let cur: Element | null = null
  let curIframe: HTMLIFrameElement | null = null

  const onMove = (e: MouseEvent) => {
    ov.style.pointerEvents = 'none'
    const t = document.elementFromPoint(e.clientX, e.clientY)
    ov.style.pointerEvents = ''
    if (!t || t === hlDiv) return

    // 尝试穿透同源 iframe
    let pickedEl: Element = t
    let pickedIframe: HTMLIFrameElement | null = null
    if (t.tagName === 'IFRAME') {
      try {
        const iframe = t as HTMLIFrameElement
        const iframeDoc = iframe.contentDocument
        if (iframeDoc) {
          const rect = iframe.getBoundingClientRect()
          const inner = iframeDoc.elementFromPoint(e.clientX - rect.left, e.clientY - rect.top)
          if (inner) { pickedEl = inner; pickedIframe = iframe }
        }
      } catch { /* cross-origin 不处理 */ }
    }

    cur      = pickedEl
    curIframe = pickedIframe

    let r: DOMRect
    if (pickedIframe) {
      const ir = pickedIframe.getBoundingClientRect()
      const er = pickedEl.getBoundingClientRect()
      r = new DOMRect(ir.left + er.left, ir.top + er.top, er.width, er.height)
    } else {
      r = pickedEl.getBoundingClientRect()
    }
    Object.assign(hlDiv.style, {
      left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    })
  }

  const cleanup = () => {
    ov.remove(); hlDiv.remove()
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click',     onClick, true)
    document.removeEventListener('keydown',   onKey,   true)
    pickCleanup = null
  }
  pickCleanup = cleanup

  const onClick = (e: MouseEvent) => {
    e.preventDefault(); e.stopImmediatePropagation()
    if (!cur) { cleanup(); return }
    const serialized = serializeElement(cur, curIframe)
    const cssSelector = serialized?.selector.cssSelector ?? buildSelector(cur, curIframe)?.cssSelector ?? ''
    cleanup()
    if (serialized) {
      chrome.runtime.sendMessage({ type: 'ELEMENT_PICKED', element: serialized, cssSelector }).catch(() => {})
    }
  }

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup() }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click',     onClick, true)
  document.addEventListener('keydown',   onKey,   true)
}

// ─── 元素高亮 ─────────────────────────────────────────────────────────────────
function handleHighlight(cssSelector: string): void {
  document.getElementById('fp-options-hl')?.remove()
  let el: Element | null = null
  try { el = document.querySelector(cssSelector) } catch { return }
  if (!el) return
  const r  = el.getBoundingClientRect()
  const hl = Object.assign(document.createElement('div'), { id: 'fp-options-hl' })
  Object.assign(hl.style, {
    position:     'fixed',
    left:         `${r.left}px`,
    top:          `${r.top}px`,
    width:        `${r.width}px`,
    height:       `${r.height}px`,
    background:   'rgba(26,86,219,.18)',
    border:       '2px solid #1a56db',
    borderRadius: '2px',
    pointerEvents:'none',
    zIndex:       '2147483644',
  })
  document.body.appendChild(hl)
  setTimeout(() => hl.remove(), 2000)
}

// ─── 试点击（触发页面上元素的真实 click） ────────────────────────────────────────
function handleTestClick(cssSelector: string): void {
  let el: Element | null = null
  try { el = document.querySelector(cssSelector) } catch { return }
  if (!el) return
  // 先高亮闪烁一下
  const r = el.getBoundingClientRect()
  const hl = Object.assign(document.createElement('div'), { id: 'fp-test-click-hl' })
  Object.assign(hl.style, {
    position: 'fixed',
    left: `${r.left}px`, top: `${r.top}px`,
    width: `${r.width}px`, height: `${r.height}px`,
    background: 'rgba(166,227,161,.25)',
    border: '2px solid #a6e3a1',
    borderRadius: '2px', pointerEvents: 'none', zIndex: '2147483644',
    transition: 'opacity .3s',
  })
  document.body.appendChild(hl)
  setTimeout(() => hl.remove(), 800)
  // 模拟真实点击
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  ;(el as HTMLElement).click()
}

// ─── 智能循环：拾取目标元素并分析重复祖先结构 ─────────────────────────────────
function handleSmartLoopAnalyze(): void {
  pickCleanup?.()

  const ov    = document.createElement('div')
  const hlDiv = document.createElement('div')
  ov.style.cssText    = 'position:fixed;inset:0;z-index:2147483645;cursor:crosshair'
  hlDiv.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483645;' +
    'border:2px solid #fab387;background:rgba(250,179,135,.15);' +
    'box-sizing:border-box;border-radius:2px;transition:all .05s'
  document.body.append(ov, hlDiv)

  let cur: Element | null = null

  const onMove = (e: MouseEvent) => {
    ov.style.pointerEvents = 'none'
    const t = document.elementFromPoint(e.clientX, e.clientY)
    ov.style.pointerEvents = ''
    if (!t || t === hlDiv) return
    cur = t
    const r = t.getBoundingClientRect()
    Object.assign(hlDiv.style, {
      left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
    })
  }

  const cleanup = () => {
    ov.remove(); hlDiv.remove()
    document.removeEventListener('mousemove', onMove, true)
    document.removeEventListener('click',     onClick, true)
    document.removeEventListener('keydown',   onKey,   true)
    pickCleanup = null
  }
  pickCleanup = cleanup

  const onClick = (e: MouseEvent) => {
    e.preventDefault(); e.stopImmediatePropagation()
    if (!cur) { cleanup(); return }
    const serialized = serializeElement(cur, null)
    const candidates = analyzeRepeatingAncestors(cur)
    cleanup()
    if (serialized) {
      chrome.runtime.sendMessage({ type: 'SMART_LOOP_ANALYZED', element: serialized, candidates }).catch(() => {})
    }
  }

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup() }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click',     onClick, true)
  document.addEventListener('keydown',   onKey,   true)
}

// ─── 智能循环候选高亮（hover 预览，橙色） ─────────────────────────────────────
function handleHighlightCandidates(selector: string): void {
  clearLoopHighlights()
  let items: NodeListOf<Element>
  try { items = document.querySelectorAll(selector) } catch { return }
  items.forEach(item => {
    const r = item.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) return
    const hl = document.createElement('div')
    Object.assign(hl.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: '2147483644',
      left: `${r.left}px`, top: `${r.top}px`,
      width: `${r.width}px`, height: `${r.height}px`,
      background: 'rgba(250,179,135,.2)',
      border: '2px solid #fab387',
      borderRadius: '2px',
    })
    document.body.appendChild(hl)
    loopHighlightEls.push(hl)
  })
}

function clearLoopHighlights(): void {
  loopHighlightEls.forEach(el => el.remove())
  loopHighlightEls.length = 0
}
