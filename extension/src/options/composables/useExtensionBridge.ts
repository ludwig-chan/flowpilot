/**
 * useExtensionBridge.ts
 * Options 页面与 background 的通信 composable
 */
import { ref, onMounted, onUnmounted } from 'vue'
import type { SerializedDomNode, SerializedElement } from '@shared/types/dom'
import type { FlowStep, StepDelayLevel } from '@shared/types/flow'
import type { RepeatingCandidate } from '@shared/types/message'

export type BridgeEvent =
  | { type: 'DOM_SCAN_RESULT'; tabId: number; tabTitle: string; tabUrl: string; tree: SerializedDomNode[] }
  | { type: 'ELEMENT_PICKED';  tabId: number; element: SerializedElement; cssSelector: string }
  | { type: 'FLOW_LOG_FROM_TAB'; tabId: number; text: string }
  | { type: 'FLOW_DONE_FROM_TAB'; tabId: number }
  | { type: 'FLOW_ERROR_FROM_TAB'; tabId: number; error: string }
  | { type: 'DOM_MUTATION'; tabId: number }
  | { type: 'SMART_LOOP_ANALYZED'; tabId: number; element: SerializedElement; candidates: RepeatingCandidate[] }

type BridgeHandler = (e: BridgeEvent) => void

export function useExtensionBridge() {
  let port: chrome.runtime.Port | null = null
  const handlers: BridgeHandler[] = []
  const reconnectHandlers: (() => void)[] = []

  function connect() {
    port = chrome.runtime.connect({ name: 'options-panel' })
    port.onMessage.addListener((msg: BridgeEvent) => {
      handlers.forEach(h => h(msg))
    })
    port.onDisconnect.addListener(() => {
      port = null
      // 短暂延迟后重连（Service Worker 休眠时会断开）
      setTimeout(() => {
        connect()
        // 重连成功后通知外部同步状态（如重新告知后台当前 activeTabId）
        reconnectHandlers.forEach(h => h())
      }, 300)
    })
  }

  onMounted(connect)
  onUnmounted(() => { port?.disconnect(); port = null })

  function on(handler: BridgeHandler) {
    handlers.push(handler)
  }

  function off(handler: BridgeHandler) {
    const idx = handlers.indexOf(handler)
    if (idx >= 0) handlers.splice(idx, 1)
  }

  function onReconnect(handler: () => void) {
    reconnectHandlers.push(handler)
  }

  function offReconnect(handler: () => void) {
    const idx = reconnectHandlers.indexOf(handler)
    if (idx >= 0) reconnectHandlers.splice(idx, 1)
  }

  async function send(msg: object): Promise<unknown> {
    return chrome.runtime.sendMessage(msg)
  }

  async function setActiveTab(tabId: number) {
    return send({ type: 'SET_ACTIVE_TAB', tabId })
  }

  async function requestDomScan() {
    return send({ type: 'REQUEST_DOM_SCAN' })
  }

  async function requestPickElement() {
    return send({ type: 'REQUEST_PICK_ELEMENT' })
  }

  async function cancelPickElement() {
    return send({ type: 'CANCEL_PICK_ELEMENT' })
  }

  async function requestSmartLoopAnalyze() {
    return send({ type: 'REQUEST_SMART_LOOP_ANALYZE' })
  }

  async function highlightLoopCandidates(selector: string) {
    return send({ type: 'HIGHLIGHT_LOOP_CANDIDATES', selector })
  }

  async function clearLoopHighlights() {
    return send({ type: 'CLEAR_LOOP_HIGHLIGHTS' })
  }

  async function requestHighlight(cssSelector: string) {
    return send({ type: 'REQUEST_HIGHLIGHT', cssSelector })
  }

  async function testClick(cssSelector: string) {
    return send({ type: 'REQUEST_TEST_CLICK', cssSelector })
  }

  async function runFlow(
    steps: FlowStep[],
    variables: Record<string, string> = {},
    stepDelayLevel?: StepDelayLevel,
    stepDelayRange?: [number, number],
    waitTimeout?: number,
  ) {
    return send({ type: 'RUN_FLOW_IN_TAB', steps, variables, stepDelayLevel, stepDelayRange, waitTimeout })
  }

  async function stopFlow() {
    return send({ type: 'STOP_FLOW_IN_TAB' })
  }

  async function getTabs(): Promise<chrome.tabs.Tab[]> {
    return new Promise(res => chrome.tabs.query({}, res))
  }

  async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
    return new Promise(res =>
      chrome.tabs.query({ active: true }, tabs => {
        const valid = tabs.find(t => t.url && !t.url.startsWith('chrome'))
        res(valid ?? null)
      })
    )
  }

  return { on, off, onReconnect, offReconnect, setActiveTab, requestDomScan, requestPickElement, cancelPickElement, requestHighlight, testClick, runFlow, stopFlow, getTabs, getActiveTab, requestSmartLoopAnalyze, highlightLoopCandidates, clearLoopHighlights }
}
