/**
 * domScanner.ts
 * DOM 扫描、元素序列化、CSS 选择器生成
 */

import type { SerializedDomNode, SerializedElement } from '@shared/types/dom'
import type { SelectorStrategy } from '@shared/types/flow'
import { MSG } from '@shared/types/message'

// ─── 排除标签 ─────────────────────────────────────────────────────────────────
export const EXCLUDE_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'HEAD',
  'HTML', 'BR', 'HR', 'NOSCRIPT', 'TEMPLATE', 'SLOT'])

// ─── DOM Mutation Observer（页面结构变化时通知 Options 自动刷新树） ─────────────
let _mutationTimer: ReturnType<typeof setTimeout> | null = null
let _mutationObserver: MutationObserver | null = null

export function ensureDomObserver(): void {
  if (_mutationObserver) return
  _mutationObserver = new MutationObserver((mutations) => {
    const hasStructuralChange = mutations.some(m => {
      if (m.type !== 'childList') return false
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
      chrome.runtime.sendMessage({ type: MSG.DOM_MUTATION }).catch(() => {})
    }, 1200)
  })
  if (document.body) {
    _mutationObserver.observe(document.body, { childList: true, subtree: true })
  }
}

// ─── DOM 扫描 ─────────────────────────────────────────────────────────────────
export function handleDomScan(scope?: string): void {
  ensureDomObserver()
  const tree = buildSerializedTree(scope)
  // 当 scope 非空时，计算被 scope 元素的规范 CSS 路径，
  // 供 Options 端在"循环子步骤选择器"场景下做前缀裁剪
  let scopeCanonicalSelector: string | undefined
  if (scope) {
    try {
      const el = document.querySelector(scope)
      if (el) scopeCanonicalSelector = getCssSelector(el)
    } catch { /* 无效选择器，忽略 */ }
  }
  chrome.runtime.sendMessage({
    type:     MSG.DOM_SCAN_RESULT,
    tabTitle: document.title,
    tabUrl:   location.href,
    tree,
    scopeCanonicalSelector,
  }).catch(() => {})
}

export function buildSerializedTree(scope?: string): SerializedDomNode[] {
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

  // 确定扫描起始点：有 scope → 从 scope 元素开始；否则从 body 开始
  let startEls: Element[] = []
  if (scope) {
    try { const el = document.querySelector(scope); if (el) startEls = [el] } catch { /* 非法选择器，回退到 body */ }
  }
  if (startEls.length === 0 && document.body) {
    startEls = Array.from(document.body.children)
  }
  for (const child of startEls) {
    const node = walk(child, 0)
    if (node) result.push(node)
  }
  return result
}

// ─── 元素序列化（可操作性分类，不含 Element 引用） ───────────────────────────
export function serializeElement(el: Element, iframeEl: HTMLIFrameElement | null = null): SerializedElement | null {
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

export function buildSelector(el: Element, iframeEl: HTMLIFrameElement | null = null): SelectorStrategy | null {
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

export function getCssSelector(el: Element): string {
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
