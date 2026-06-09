// Service Worker 入口
// MVP 阶段：保持 Service Worker 存活，透传消息
// v0.2 起承担任务调度、状态持久化职责

import type { UrlMatchMode } from '@shared/types/flow'
import { genId } from '@shared/utils/genId'
import { toLocalTimeString } from '@shared/utils/time'
import { MSG } from '@shared/types/message'
import { BUILTIN_PRESETS } from '@/presets/index'

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
  chrome.storage.local.get({ builtFlows: [], builtinPresetPinOverrides: {} }, (data) => {
    const overrides = getBuiltinPresetPinOverrides(data.builtinPresetPinOverrides)
    const userFlows = flattenFlows(Array.isArray(data.builtFlows) ? data.builtFlows as RawFlow[] : [])
    const presetFlows = flattenFlows(getBuiltinPresetNodes(overrides))
    sr({ ok: true, flows: [...userFlows, ...presetFlows] })
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
const FORWARD_TO_CONTENT: Set<string> = new Set([
  MSG.REQUEST_DOM_SCAN, MSG.REQUEST_PICK_ELEMENT, MSG.CANCEL_PICK_ELEMENT,
  MSG.REQUEST_HIGHLIGHT, MSG.REQUEST_TEST_CLICK, MSG.RUN_FLOW_IN_TAB, MSG.STOP_FLOW_IN_TAB,
  MSG.REQUEST_SMART_LOOP_ANALYZE, MSG.REQUEST_SMART_LOOP_FROM_SELECTOR,
  MSG.HIGHLIGHT_LOOP_CANDIDATES, MSG.CLEAR_LOOP_HIGHLIGHTS,
])

// 需要广播给 Options 页面的消息类型
const BROADCAST_TO_OPTIONS: Set<string> = new Set([
  MSG.DOM_SCAN_RESULT, MSG.ELEMENT_PICKED, MSG.FLOW_LOG_FROM_TAB,
  MSG.FLOW_DONE_FROM_TAB, MSG.FLOW_ERROR_FROM_TAB, MSG.DOM_MUTATION,
  MSG.SMART_LOOP_ANALYZED, MSG.FLOW_STEP_EVENT_FROM_TAB,
])

const SCREENSHOT_BRIDGE_HOST = '127.0.0.1'
const SCREENSHOT_BRIDGE_PORTS = Array.from({ length: 11 }, (_, i) => 17365 + i)
const SCREENSHOT_BRIDGE_TIMEOUT = 2000

function withRunMetadata(message: any): any {
  if (message.type !== MSG.RUN_FLOW_IN_TAB) return message
  return {
    ...message,
    runId: message.runId ?? genId('run'),
    runStartedAt: message.runStartedAt ?? toLocalTimeString(),
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeout = SCREENSHOT_BRIDGE_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function findScreenshotBridge(): Promise<{ port: number; error?: string }> {
  let lastError = ''

  for (const port of SCREENSHOT_BRIDGE_PORTS) {
    const url = `http://${SCREENSHOT_BRIDGE_HOST}:${port}/health`
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', cache: 'no-store' })
      if (!res.ok) {
        lastError = `${port} 返回 ${res.status}`
        continue
      }
      const body = await res.json() as { ok?: boolean; app?: string }
      if (body.ok && body.app === 'FlowPilot') return { port }
      lastError = `${port} 不是 FlowPilot 服务`
    } catch (err) {
      lastError = (err as Error).name === 'AbortError'
        ? `${port} 探测超时`
        : `${port} ${(err as Error).message}`
    }
  }

  return { port: 0, error: lastError || '未找到 FlowPilot 本地服务' }
}

function handleSaveScreenshot(msg: any, _s: any, sr: (r: unknown) => void): true {
  const dataUrl: string = msg.dataUrl ?? ''
  const filename: string = msg.filename ?? 'screenshot.png'
  console.log('[SAVE_SCREENSHOT] 开始调用本地 HTTP 服务，文件名：', filename, 'dataUrl长度：', dataUrl.length)

  ;(async () => {
    try {
      const bridge = await findScreenshotBridge()
      if (!bridge.port) {
        sr({ ok: false, error: `FlowPilot 本地截图服务不可用：${bridge.error}` })
        return
      }

      const url = `http://${SCREENSHOT_BRIDGE_HOST}:${bridge.port}/screenshots`
      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          dataUrl,
          runId: msg.runId,
          runStartedAt: msg.runStartedAt,
          flowId: msg.flowId,
          flowName: msg.flowName,
          sourceUrl: msg.sourceUrl,
          sourceTitle: msg.sourceTitle,
        }),
      }, 30_000)
      const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` })) as
        { ok?: boolean; path?: string; error?: string }

      if (!res.ok || !body.ok) {
        sr({ ok: false, error: body.error ?? `HTTP ${res.status}` })
        return
      }

      sr({ ok: true, path: body.path })
    } catch (err) {
      sr({ ok: false, error: (err as Error).message })
    }
  })()

  return true
}

const MSG_HANDLERS: Record<string, MsgHandler> = {
  [MSG.GET_LOGS]:          handleGetLogs,
  [MSG.CLEAR_LOGS]:        handleClearLogs,
  [MSG.SAVE_BUILT_FLOW]:   handleSaveBuiltFlow,
  [MSG.GET_BUILT_FLOWS]:   handleGetBuiltFlows,
  [MSG.DELETE_BUILT_FLOW]: handleDeleteBuiltFlow,
  [MSG.SYNC_FLOWS]:        handleSyncFlows,
  [MSG.OPEN_OPTIONS_PAGE]: handleOpenOptionsPage,
  [MSG.SET_ACTIVE_TAB]:    handleSetActiveTab,
  [MSG.GET_ACTIVE_TAB]:    handleGetActiveTab,
  [MSG.SAVE_SCREENSHOT]:   handleSaveScreenshot,
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
    chrome.tabs.sendMessage(tabId, withRunMetadata(message)).then(r => sendResponse(r)).catch(e => {
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

  if (message.type === MSG.FLOW_LOG) {
    const ts = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    bgLogs.push(`[${ts}] ${message.text ?? ''}`)
    if (bgLogs.length > MAX_LOGS) bgLogs.splice(0, bgLogs.length - MAX_LOGS)
  }

  // 元素触发器：content script 上报已找到目标元素，运行对应流程
  if (message.type === MSG.ELEMENT_TRIGGER_FIRED) {
    const tabId = sender.tab?.id
    if (tabId) {
      chrome.storage.local.get({ builtFlows: [] }, (data) => {
        const flow = flattenFlows(Array.isArray(data.builtFlows) ? data.builtFlows as RawFlow[] : [])
          .find(f => f.id === message.flowId)
        if (!flow) return
        chrome.tabs.sendMessage(tabId, withRunMetadata({
          type: MSG.RUN_FLOW_IN_TAB,
          flowId: flow.id,
          flowName: flow.name,
          steps: flow.steps,
          variables: {},
          stepDelayLevel: flow.stepDelayLevel,
          stepDelayRange: flow.stepDelayRange,
          waitTimeout: flow.waitTimeout,
        })).catch(() => {})
      })
    }
    sendResponse({ ok: true })
    return true
  }

  // CAPTURE_CANVAS 由下方专用监听器处理，此处不兜底响应
  if (message.type === MSG.CAPTURE_CANVAS) return true

  // 将消息广播给所有扩展页面（包括 popup）
  // 注意：popup 关闭时此操作会静默失败，属正常现象
  chrome.runtime.sendMessage(message).catch(() => {
    // popup 未打开时会报错，忽略即可
  })

  sendResponse({ ok: true })
  return true
})

// ── CAPTURE_CANVAS：截取指定标签页可见区域，原图返回给 content script 裁剪 ───────
// chrome.tabs.captureTab 并不存在于 Chrome 扩展 API，只能用 captureVisibleTab。
// captureVisibleTab 截的是窗口当前活跃 tab，若 Options 页面是活跃 tab 则会截错。
// 解决方案：截图前临时激活目标 tab，截完后恢复原活跃 tab。
// 裁剪在 content script 侧完成，避免 Service Worker 里 Image / FileReader 不可用的问题
//
// 注意：后台 tab（非活跃）的合成器是节流的，window.scrollTo 后不会立即生成新帧，
// captureTab 会拿到旧帧（看起来"不会滚动"）。解决方法：截图前临时激活目标 tab，
// 截完后恢复原活跃 tab，确保 Chromium 合成器为该 tab 生成最新帧。
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== MSG.CAPTURE_CANVAS) return false

  const tabId = sender.tab?.id
  const winId = sender.tab?.windowId
  if (!tabId || !winId) {
    sendResponse({ ok: false, error: '无法获取 tab ID' })
    return true
  }

  ;(async () => {
    // 若目标 tab 不是当前活跃 tab，临时激活它（确保 captureVisibleTab 截到正确 tab）
    let prevActiveTabId: number | null = null
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, windowId: winId })
      if (activeTab?.id !== undefined && activeTab.id !== tabId) {
        prevActiveTabId = activeTab.id
        await chrome.tabs.update(tabId, { active: true })
        // 等一帧让渲染器输出最新画面
        await new Promise<void>(rs => setTimeout(rs, 50))
      }
    } catch { /* 激活失败则继续，captureVisibleTab 仍可能成功 */ }

    console.log('[CAPTURE_CANVAS] 截取 winId=', winId, 'tabId=', tabId)
    chrome.tabs.captureVisibleTab(winId, { format: 'png' }, async (screenshotDataUrl) => {
      // 截完后恢复原活跃 tab
      if (prevActiveTabId !== null) {
        try { await chrome.tabs.update(prevActiveTabId, { active: true }) } catch { /* ignore */ }
      }

      if (chrome.runtime.lastError || !screenshotDataUrl) {
        const err = chrome.runtime.lastError?.message ?? '截图失败（无数据）'
        console.error('[CAPTURE_CANVAS]', err)
        sendResponse({ ok: false, error: err })
        return
      }
      console.log('[CAPTURE_CANVAS] 截图成功，大小：', Math.round(screenshotDataUrl.length / 1024), 'KB')
      sendResponse({ ok: true, screenshotDataUrl })
    })
  })()

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
  id: string; kind?: string; name?: string; steps: unknown[]; pinnedInMenu?: boolean;
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

function getBuiltinPresetPinOverrides(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object') return {}
  return value as Record<string, boolean>
}

function getBuiltinPresetNodes(overrides: Record<string, boolean>): RawFlow[] {
  const nodes = BUILTIN_PRESETS.flatMap(p =>
    JSON.parse(JSON.stringify(p.payload.nodes)) as RawFlow[]
  )

  function applyOverrides(items: RawFlow[]): RawFlow[] {
    return items.map(item => {
      if (item.kind === 'folder' && item.children) {
        return { ...item, children: applyOverrides(item.children) }
      }
      return { ...item, pinnedInMenu: overrides[item.id] ?? item.pinnedInMenu }
    })
  }

  return applyOverrides(nodes)
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
          chrome.tabs.sendMessage(tabId, withRunMetadata({
          type: MSG.RUN_FLOW_IN_TAB,
          flowId: flow.id,
          flowName: flow.name,
          steps: flow.steps,
          variables: {},
          stepDelayLevel: flow.stepDelayLevel,
          stepDelayRange: flow.stepDelayRange,
          waitTimeout: flow.waitTimeout,
        })).catch(() => {})
      }, trigger.delay ?? 0)
      }

      // 类型二：元素出现——通知 content script 建立监听
      if (trigger.type === 'element_appear' && trigger.selector) {
        const urlOk = !trigger.urlPattern ||
          matchUrl(url, trigger.urlPattern, (trigger.urlMatchMode as UrlMatchMode) ?? 'contains')
        if (!urlOk) continue
        chrome.tabs.sendMessage(tabId, {
          type: MSG.WATCH_ELEMENT_TRIGGER,
          flowId: flow.id,
          selector: trigger.selector,
          delay: trigger.delay ?? 0,
        }).catch(() => {})
      }
    }
  })
})
