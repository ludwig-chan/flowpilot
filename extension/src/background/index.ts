// Service Worker 入口
// MVP 阶段：保持 Service Worker 存活，透传消息
// v0.2 起承担任务调度、状态持久化职责

import type { UrlMatchMode } from '@shared/types/flow'
import { genId } from '@shared/utils/genId'

const MAX_LOGS = 500
const bgLogs: string[] = []

// 记录 Options 页面的端口（用于推送 DOM 扫描结果、流程日志等）
const optionsPorts = new Set<chrome.runtime.Port>()

// 记录当前"工作 tab"（Options 页面选定的目标 tab）
let activeTabId: number | null = null

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'options-panel') return
  optionsPorts.add(port)
  port.onDisconnect.addListener(() => optionsPorts.delete(port))
})

/** 向所有 Options 页面广播消息 */
function broadcastToOptions(msg: object): void {
  optionsPorts.forEach(p => { try { p.postMessage(msg) } catch { /* port closed */ } })
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[FlowPilot] 插件已安装')
})

// 点击扩展图标时打开选项页
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage()
})

// ─── 消息处理函数 ─────────────────────────────────────────────────────────────

type MsgHandler = (msg: any, sender: chrome.runtime.MessageSender, sr: (r?: unknown) => void) => true

function handleGetLogs(_m: any, _s: any, sr: (r: unknown) => void): true {
  sr({ ok: true, logs: [...bgLogs] })
  return true
}

function handleClearLogs(_m: any, _s: any, sr: (r: unknown) => void): true {
  bgLogs.length = 0
  sr({ ok: true })
  return true
}

function handleSaveBuiltFlow(msg: any, _s: any, sr: (r: unknown) => void): true {
  chrome.storage.local.get({ builtFlows: [] }, (data) => {
    const flows = data.builtFlows as Array<{ id: string; name: string; steps: unknown[]; createdAt: number }>
    const id = genId('bf')
    flows.push({ id, name: msg.name, steps: msg.steps, createdAt: Date.now() })
    chrome.storage.local.set({ builtFlows: flows }, () => sr({ ok: true, id }))
  })
  return true
}

function handleGetBuiltFlows(_m: any, _s: any, sr: (r: unknown) => void): true {
  chrome.storage.local.get({ builtFlows: [] }, (data) => {
    sr({ ok: true, flows: flattenFlows(Array.isArray(data.builtFlows) ? data.builtFlows as RawFlow[] : []) })
  })
  return true
}

function handleDeleteBuiltFlow(msg: any, _s: any, sr: (r: unknown) => void): true {
  chrome.storage.local.get({ builtFlows: [] }, (data) => {
    const flows = (data.builtFlows as Array<{ id: string }>).filter(f => f.id !== msg.id)
    chrome.storage.local.set({ builtFlows: flows }, () => sr({ ok: true }))
  })
  return true
}

function handleSyncFlows(msg: any, _s: any, sr: (r: unknown) => void): true {
  chrome.storage.local.set({ builtFlows: msg.flows ?? [] }, () => sr({ ok: true }))
  return true
}

function handleOpenOptionsPage(_m: any, _s: any, sr: (r: unknown) => void): true {
  chrome.runtime.openOptionsPage()
  sr({ ok: true })
  return true
}

function handleSetActiveTab(msg: any, _s: any, sr: (r: unknown) => void): true {
  activeTabId = msg.tabId as number
  sr({ ok: true })
  return true
}

function handleGetActiveTab(_m: any, _s: any, sr: (r: unknown) => void): true {
  sr({ ok: true, tabId: activeTabId })
  return true
}

// 需要转发给 content script 的消息类型
const FORWARD_TO_CONTENT = new Set([
  'REQUEST_DOM_SCAN', 'REQUEST_PICK_ELEMENT', 'CANCEL_PICK_ELEMENT',
  'REQUEST_HIGHLIGHT', 'REQUEST_TEST_CLICK', 'RUN_FLOW_IN_TAB', 'STOP_FLOW_IN_TAB',
  'REQUEST_SMART_LOOP_ANALYZE', 'HIGHLIGHT_LOOP_CANDIDATES', 'CLEAR_LOOP_HIGHLIGHTS',
])

// 需要广播给 Options 页面的消息类型
const BROADCAST_TO_OPTIONS = new Set([
  'DOM_SCAN_RESULT', 'ELEMENT_PICKED', 'FLOW_LOG_FROM_TAB',
  'FLOW_DONE_FROM_TAB', 'FLOW_ERROR_FROM_TAB', 'DOM_MUTATION',
  'SMART_LOOP_ANALYZED', 'FLOW_STEP_EVENT_FROM_TAB',
])

const MSG_HANDLERS: Record<string, MsgHandler> = {
  GET_LOGS:          handleGetLogs,
  CLEAR_LOGS:        handleClearLogs,
  SAVE_BUILT_FLOW:   handleSaveBuiltFlow,
  GET_BUILT_FLOWS:   handleGetBuiltFlows,
  DELETE_BUILT_FLOW: handleDeleteBuiltFlow,
  SYNC_FLOWS:        handleSyncFlows,
  OPEN_OPTIONS_PAGE: handleOpenOptionsPage,
  SET_ACTIVE_TAB:    handleSetActiveTab,
  GET_ACTIVE_TAB:    handleGetActiveTab,
}

// 中转消息分发
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FlowPilot background] 收到消息', message, '来自', sender.tab?.url)

  // 映射表分发（CRUD + 简单查询）
  const handler = MSG_HANDLERS[message.type as string]
  if (handler) return handler(message, sender, sendResponse)

  // 转发给 content script 的指令
  if (FORWARD_TO_CONTENT.has(message.type)) {
    const tabId = (message.tabId as number | undefined) ?? activeTabId
    if (!tabId) { sendResponse({ ok: false, error: '未设置目标 Tab' }); return true }
    chrome.tabs.sendMessage(tabId, message).then(r => sendResponse(r)).catch(e => {
      sendResponse({ ok: false, error: String(e) })
    })
    return true
  }

  // content script 推送给 Options 的结果（DOM 扫描、元素拾取、日志等）
  if (BROADCAST_TO_OPTIONS.has(message.type)) {
    const enriched = { ...message, tabId: message.tabId ?? sender.tab?.id }
    broadcastToOptions(enriched)
    sendResponse({ ok: true })
    return true
  }

  if (message.type === 'FLOW_LOG') {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    bgLogs.push(`[${ts}] ${message.text ?? ''}`)
    if (bgLogs.length > MAX_LOGS) bgLogs.splice(0, bgLogs.length - MAX_LOGS)
  }

  // 元素触发器：content script 上报已找到目标元素，运行对应流程
  if (message.type === 'ELEMENT_TRIGGER_FIRED') {
    const tabId = sender.tab?.id
    if (tabId) {
      chrome.storage.local.get({ builtFlows: [] }, (data) => {
        const flow = flattenFlows(Array.isArray(data.builtFlows) ? data.builtFlows as RawFlow[] : [])
          .find(f => f.id === message.flowId)
        if (!flow) return
        chrome.tabs.sendMessage(tabId, {
          type: 'RUN_FLOW_IN_TAB',
          steps: flow.steps,
          variables: {},
          stepDelayLevel: flow.stepDelayLevel,
          stepDelayRange: flow.stepDelayRange,
          waitTimeout: flow.waitTimeout,
        }).catch(() => {})
      })
    }
    sendResponse({ ok: true })
    return true
  }

  // CAPTURE_CANVAS 由下方专用监听器处理，此处不兜底响应
  if (message.type === 'CAPTURE_CANVAS') return true

  // 将消息广播给所有扩展页面（包括 popup）
  // 注意：popup 关闭时此操作会静默失败，属正常现象
  chrome.runtime.sendMessage(message).catch(() => {
    // popup 未打开时会报错，忽略即可
  })

  sendResponse({ ok: true })
  return true
})

// ── CAPTURE_CANVAS：截取当前标签页可见区域，原图返回给 content script 裁剪 ───────
// 裁剪在 content script 侧完成，避免 Service Worker 里 Image / FileReader 不可用的问题
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CAPTURE_CANVAS') return false

  const windowId = sender.tab?.windowId
  if (!windowId) {
    sendResponse({ ok: false, error: '无法获取窗口 ID' })
    return true
  }

  console.log('[CAPTURE_CANVAS] 截取标签页可见区域，windowId=', windowId)
  chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (screenshotDataUrl) => {
    if (chrome.runtime.lastError || !screenshotDataUrl) {
      const err = chrome.runtime.lastError?.message ?? '截图失败（无数据）'
      console.error('[CAPTURE_CANVAS]', err)
      sendResponse({ ok: false, error: err })
      return
    }
    console.log('[CAPTURE_CANVAS] 截图成功，大小：', Math.round(screenshotDataUrl.length / 1024), 'KB')
    sendResponse({ ok: true, screenshotDataUrl })
  })
  return true // 保持 sendResponse 通道开启
})

// ── 触发器工具函数 ─────────────────────────────────────────────────────────────

function matchUrl(url: string, pattern: string, mode: UrlMatchMode = 'contains'): boolean {
  try {
    switch (mode) {
      case 'equals':     return url === pattern
      case 'startsWith': return url.startsWith(pattern)
      case 'regex':      return new RegExp(pattern).test(url)
      default:           return url.includes(pattern) // contains
    }
  } catch { return false }
}

// 展平嵌套树形流程结构
type RawTrigger = { enabled: boolean; type: string; urlPattern?: string; urlMatchMode?: string; selector?: string; delay?: number }
type RawFlow   = {
  id: string; kind?: string; steps: unknown[];
  stepDelayLevel?: string; stepDelayRange?: [number, number]; waitTimeout?: number;
  trigger?: RawTrigger; children?: RawFlow[]
}

function flattenFlows(nodes: RawFlow[]): RawFlow[] {
  const result: RawFlow[] = []
  for (const n of nodes) {
    if (!n.kind || n.kind === 'flow') result.push(n)
    if (n.kind === 'folder' && n.children) result.push(...flattenFlows(n.children))
  }
  return result
}

// ── 自动触发器：监听标签页导航事件 ───────────────────────────────────────────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return
  const url = tab.url
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return

  chrome.storage.local.get({ builtFlows: [] }, (data) => {
    const flows = flattenFlows(Array.isArray(data.builtFlows) ? data.builtFlows as RawFlow[] : [])

    for (const flow of flows) {
      const trigger = flow.trigger
      if (!trigger?.enabled) continue

      // 类型一：URL 匹配则直接运行流程
      if (trigger.type === 'url_match' && trigger.urlPattern) {
        if (!matchUrl(url, trigger.urlPattern, (trigger.urlMatchMode as UrlMatchMode) ?? 'contains')) continue
        setTimeout(() => {
          chrome.tabs.sendMessage(tabId, {
            type: 'RUN_FLOW_IN_TAB',
            steps: flow.steps,
            variables: {},
            stepDelayLevel: flow.stepDelayLevel,
            stepDelayRange: flow.stepDelayRange,
            waitTimeout: flow.waitTimeout,
          }).catch(() => {})
        }, trigger.delay ?? 0)
      }

      // 类型二：元素出现——通知 content script 建立监听
      if (trigger.type === 'element_appear' && trigger.selector) {
        const urlOk = !trigger.urlPattern ||
          matchUrl(url, trigger.urlPattern, (trigger.urlMatchMode as UrlMatchMode) ?? 'contains')
        if (!urlOk) continue
        chrome.tabs.sendMessage(tabId, {
          type: 'WATCH_ELEMENT_TRIGGER',
          flowId: flow.id,
          selector: trigger.selector,
          delay: trigger.delay ?? 0,
        }).catch(() => {})
      }
    }
  })
})
