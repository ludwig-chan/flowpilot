/**
 * OptionsBridge.ts
 * Content script 侧：消息路由入口
 * - 将来自 Options 页面（经 background 中转）的消息分发到对应模块
 */

import type {
  RequestHighlightMessage,
  RequestTestClickMessage,
  RunFlowInTabMessage,
} from '@shared/types/dom'
import { MSG } from '@shared/types/message'
import { runFlow } from './engine/SemanticRunner'
import { handleDomScan } from './domScanner'
import { handlePickElement, cancelPickElement } from './elementPicker'
import { handleSmartLoopFromSelector, handleHighlightCandidates, clearLoopHighlights } from './smartLoop'

// ─── 当前运行中的流程停止函数（null 表示当前无流程在执行）─────────────────
let _stopCurrentFlow: (() => void) | null = null

// ─── 元素出现触发器 ───────────────────────────────────────────────────────────
function watchElementTrigger(flowId: string, selector: string, delay: number): void {
  try {
    if (document.querySelector(selector)) {
      setTimeout(() => chrome.runtime.sendMessage({ type: MSG.ELEMENT_TRIGGER_FIRED, flowId }).catch(() => {}), delay)
      return
    }
  } catch { return } // 非法选择器，直接忽略

  const observer = new MutationObserver(() => {
    try {
      if (!document.querySelector(selector)) return
    } catch { observer.disconnect(); return }
    observer.disconnect()
    setTimeout(() => chrome.runtime.sendMessage({ type: MSG.ELEMENT_TRIGGER_FIRED, flowId }).catch(() => {}), delay)
  })
  try {
    observer.observe(document.body ?? document.documentElement, { childList: true, subtree: true })
  } catch { /* 页面尚未准备好，忽略 */ }
}

// ─── 初始化：注册消息监听 ─────────────────────────────────────────────────────
export function initOptionsBridge(): void {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === MSG.REQUEST_DOM_SCAN) {
      handleDomScan()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.REQUEST_PICK_ELEMENT) {
      handlePickElement()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.CANCEL_PICK_ELEMENT) {
      cancelPickElement()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.REQUEST_HIGHLIGHT) {
      handleHighlight((msg as RequestHighlightMessage).cssSelector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.REQUEST_TEST_CLICK) {
      handleTestClick((msg as RequestTestClickMessage).cssSelector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.RUN_FLOW_IN_TAB) {
      const m = msg as RunFlowInTabMessage
      const { done, stop } = runFlow(m.steps, m.variables ?? {}, (text) => {
        chrome.runtime.sendMessage({ type: MSG.FLOW_LOG_FROM_TAB, text }).catch(() => {})
      }, (event) => {
        chrome.runtime.sendMessage({ type: MSG.FLOW_STEP_EVENT_FROM_TAB, event }).catch(() => {})
      }, m.stepDelayLevel, m.stepDelayRange, m.waitTimeout)
      _stopCurrentFlow = stop
      done.then(() => {
        _stopCurrentFlow = null
        chrome.runtime.sendMessage({ type: MSG.FLOW_DONE_FROM_TAB }).catch(() => {})
      }).catch((e: unknown) => {
        _stopCurrentFlow = null
        chrome.runtime.sendMessage({ type: MSG.FLOW_ERROR_FROM_TAB, error: String(e) }).catch(() => {})
      })
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.STOP_FLOW_IN_TAB) {
      _stopCurrentFlow?.()
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.WATCH_ELEMENT_TRIGGER) {
      const { flowId, selector, delay = 0 } = msg as { type: string; flowId: string; selector: string; delay: number }
      watchElementTrigger(flowId, selector, delay)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.REQUEST_SMART_LOOP_FROM_SELECTOR) {
      handleSmartLoopFromSelector((msg as { type: string; cssSelector: string }).cssSelector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.HIGHLIGHT_LOOP_CANDIDATES) {
      handleHighlightCandidates((msg as { type: string; selector: string }).selector)
      sendResponse({ ok: true })
      return
    }
    if (msg.type === MSG.CLEAR_LOOP_HIGHLIGHTS) {
      clearLoopHighlights()
      sendResponse({ ok: true })
      return
    }
  })
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
