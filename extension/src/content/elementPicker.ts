/**
 * elementPicker.ts
 * 元素拾取模式：覆盖层 + 鼠标高亮 + 点击捕获
 */

import { MSG } from '@shared/types/message'
import { serializeElement, buildSelector } from './domScanner'
import { handleSmartLoopFromElement } from './smartLoop'

// ─── 元素拾取状态 ─────────────────────────────────────────────────────────────
let pickCleanup: (() => void) | null = null

export function cancelPickElement(): void {
  pickCleanup?.()
}

export function handlePickElement(scope?: string, mode?: 'smart_loop'): void {
  pickCleanup?.()  // 取消之前可能存在的拾取

  // 解析范围：scope 为空 → 全页面；否则只允许 scope 内的元素
  const rootEl: Element | null = scope ? (() => { try { return document.querySelector(scope) } catch { return null } })() : null

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

    // 范围过滤：有 rootEl 时，元素必须在 rootEl 内部
    if (rootEl && !rootEl.contains(pickedEl)) {
      // 但 iframe 内的元素需检查 iframe 本身是否在范围内
      if (!pickedIframe || !rootEl.contains(pickedIframe)) {
        hlDiv.style.display = 'none'
        return
      }
    }

    cur       = pickedEl
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
    const serialized = serializeElement(cur, curIframe, rootEl ?? undefined)
    const cssSelector = serialized?.selector.cssSelector ?? buildSelector(cur, curIframe, rootEl ?? undefined)?.cssSelector ?? ''
    cleanup()
    if (mode === 'smart_loop') {
      handleSmartLoopFromElement(cur, cssSelector)
      return
    }
    if (serialized) {
      chrome.runtime.sendMessage({ type: MSG.ELEMENT_PICKED, element: serialized, cssSelector }).catch(() => {})
    }
  }

  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cleanup() }

  document.addEventListener('mousemove', onMove, true)
  document.addEventListener('click',     onClick, true)
  document.addEventListener('keydown',   onKey,   true)
}
