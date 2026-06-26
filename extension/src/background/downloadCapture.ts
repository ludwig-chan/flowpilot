/**
 * downloadCapture.ts
 * 下载捕获模块：监听下载事件，按配置处理附件
 *
 * 当前验证版策略：
 * - 全局捕获所有下载
 * - 统一复制文件到附件目录（保留原始文件）
 * - 如果下载来自正在运行的流程 tab，则附带流程元数据
 */
import type { DownloadMode } from '@shared/types/flow'

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

interface FlowDownloadConfig {
  downloadMode: DownloadMode
  runId: string
  runStartedAt: string
  flowId?: string
  flowName?: string
}

interface PendingDownload {
  config?: FlowDownloadConfig
  tabId: number
  url: string
  filename: string
}

export interface DownloadWaitResult {
  ok: boolean
  id?: string
  filename?: string
  filePath?: string
  fileSize?: number
  sourceUrl?: string
  error?: string
}

interface DownloadWaiter {
  id: string
  config?: FlowDownloadConfig
  resolve: (result: DownloadWaitResult) => void
  timer: ReturnType<typeof setTimeout>
}

// ─── 状态管理 ──────────────────────────────────────────────────────────────────

/** tabId → 流程下载配置 */
const flowDownloadConfigs = new Map<number, FlowDownloadConfig>()

/** downloadId → 待处理的下载信息 */
const pendingDownloads = new Map<number, PendingDownload>()

/** 一次性下载等待器队列：流程点击前注册，后续第一个完成的下载会归属给最早等待器 */
const downloadWaiters: DownloadWaiter[] = []

// ─── 本地 HTTP 桥接（复用 background/index.ts 的逻辑）──────────────────────────

const SCREENSHOT_BRIDGE_HOST = '127.0.0.1'
const SCREENSHOT_BRIDGE_PORTS = Array.from({ length: 11 }, (_, i) => 17365 + i)
const SCREENSHOT_BRIDGE_TIMEOUT = 2000
const GLOBAL_CAPTURE_MODE = 'keep_and_capture' as const

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

// ─── 配置管理 ──────────────────────────────────────────────────────────────────

/**
 * 设置流程下载配置
 * 在 RUN_FLOW_IN_TAB 转发给 content script 前调用
 */
export function setFlowDownloadConfig(tabId: number, config: FlowDownloadConfig): void {
  if (config.downloadMode === 'ignore') {
    // ignore 模式不需要记录流程元数据；全局验证捕获仍会复制下载文件
    flowDownloadConfigs.delete(tabId)
    return
  }
  flowDownloadConfigs.set(tabId, config)
  console.log(`[DownloadCapture] 设置 tabId=${tabId} downloadMode=${config.downloadMode}`)
}

/**
 * 清除流程下载配置
 * 在 FLOW_DONE / FLOW_ERROR 时调用
 */
export function clearFlowDownloadConfig(tabId: number): void {
  flowDownloadConfigs.delete(tabId)
  console.log(`[DownloadCapture] 清除 tabId=${tabId} 下载配置`)
}

/**
 * 获取 tab 的下载配置
 */
function getFlowDownloadConfig(tabId: number): FlowDownloadConfig | undefined {
  return flowDownloadConfigs.get(tabId)
}

export function waitForNextDownload(
  timeout = 30_000,
  config?: FlowDownloadConfig,
): Promise<DownloadWaitResult> {
  return new Promise((resolve) => {
    const id = `dw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const timer = setTimeout(() => {
      const idx = downloadWaiters.findIndex(waiter => waiter.id === id)
      if (idx >= 0) downloadWaiters.splice(idx, 1)
      resolve({ ok: false, error: `等待下载超时（${timeout}ms）` })
    }, timeout)

    downloadWaiters.push({ id, config, resolve, timer })
    console.log(`[DownloadCapture] 注册下载等待器: id=${id} timeout=${timeout}`)
  })
}

function shiftDownloadWaiter(): DownloadWaiter | undefined {
  const waiter = downloadWaiters.shift()
  if (waiter) clearTimeout(waiter.timer)
  return waiter
}

// ─── 发送附件到 Electron ───────────────────────────────────────────────────────

async function sendAttachmentToClient(
  filePath: string,
  filename: string,
  mode: 'capture' | 'keep_and_capture',
  config: FlowDownloadConfig | undefined,
  sourceUrl: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const bridge = await findScreenshotBridge()
    if (!bridge.port) {
      return { ok: false, error: `FlowPilot 本地服务不可用：${bridge.error}` }
    }

    const url = `http://${SCREENSHOT_BRIDGE_HOST}:${bridge.port}/attachments`
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath,
        filename,
        mode,
        runId: config?.runId,
        runStartedAt: config?.runStartedAt,
        flowId: config?.flowId,
        flowName: config?.flowName,
        sourceUrl,
      }),
    }, 30_000)

    const body = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` })) as {
      ok?: boolean
      id?: string
      error?: string
    }

    if (!res.ok || !body.ok) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` }
    }

    return { ok: true, id: body.id }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// ─── 下载事件监听器 ────────────────────────────────────────────────────────────

let isInitialized = false

/**
 * 初始化下载捕获模块
 * 注册 chrome.downloads 事件监听器
 * 应在 Service Worker 启动时调用（幂等）
 */
export function initDownloadCapture(): void {
  if (isInitialized) return
  isInitialized = true

  // ── onCreated：下载任务创建时触发 ─────────────────────────────────────────────
  // 验证版全局捕获：所有下载都记录，后续完成时复制到附件库
  chrome.downloads.onCreated.addListener((downloadItem) => {
    const tabId = downloadItem.tabId
    const config = tabId >= 0 ? getFlowDownloadConfig(tabId) : undefined

    console.log(
      `[DownloadCapture] 全局捕获下载: downloadId=${downloadItem.id} tabId=${tabId} url=${downloadItem.url}`,
    )

    pendingDownloads.set(downloadItem.id, {
      config,
      tabId,
      url: downloadItem.url,
      filename: downloadItem.filename,
    })
  })

  // ── onDeterminingFilename：文件名决策（同步回调）──────────────────────────────
  // 不修改文件名，只放行浏览器默认下载流程
  chrome.downloads.onDeterminingFilename.addListener((downloadItem, suggest) => {
    const pending = pendingDownloads.get(downloadItem.id)
    if (pending) {
      pending.filename = downloadItem.filename
      console.log(`[DownloadCapture] 确认下载文件名: downloadId=${downloadItem.id} filename=${downloadItem.filename}`)
    }

    suggest()
  })

  // ── onChanged：下载状态变化 ───────────────────────────────────────────────────
  // 监听下载完成，然后发送附件到 Electron
  chrome.downloads.onChanged.addListener(async (delta) => {
    const downloadId = delta.id

    // 检查是否是我们跟踪的下载
    const pending = pendingDownloads.get(downloadId)
    if (!pending) return

    // 检查状态变化
    if (delta.state) {
      const newState = delta.state.current

      if (newState === 'complete') {
        console.log(`[DownloadCapture] 下载完成: downloadId=${downloadId}`)

        // 获取完整的下载信息（包含最终文件路径）
        const [downloadItem] = await chrome.downloads.search({ id: downloadId })
        if (!downloadItem) {
          console.error(`[DownloadCapture] 无法获取下载信息: downloadId=${downloadId}`)
          pendingDownloads.delete(downloadId)
          return
        }

        const filePath = downloadItem.filename
        const filename = filePath.split(/[\\/]/).pop() ?? pending.filename ?? 'unknown'
        const mode = GLOBAL_CAPTURE_MODE
        const waiter = shiftDownloadWaiter()
        const attachmentConfig = waiter?.config ?? pending.config

        console.log(
          `[DownloadCapture] 发送附件到 Electron: filePath=${filePath} mode=${mode} tabId=${pending.tabId} waiter=${waiter?.id ?? 'none'}`,
        )

        const result = await sendAttachmentToClient(
          filePath,
          filename,
          mode,
          attachmentConfig,
          pending.url,
        )

        if (result.ok) {
          console.log(`[DownloadCapture] 附件保存成功: id=${result.id}`)
          waiter?.resolve({
            ok: true,
            id: result.id,
            filename,
            filePath,
            fileSize: downloadItem.fileSize || downloadItem.totalBytes,
            sourceUrl: pending.url,
          })
        } else {
          console.error(`[DownloadCapture] 附件保存失败: ${result.error}`)
          waiter?.resolve({ ok: false, error: result.error ?? '附件保存失败' })
        }

        pendingDownloads.delete(downloadId)
      } else if (newState === 'interrupted') {
        // 下载被中断（用户取消或错误）
        console.warn(`[DownloadCapture] 下载中断: downloadId=${downloadId} error=${delta.error?.current}`)
        const waiter = shiftDownloadWaiter()
        waiter?.resolve({ ok: false, error: `下载中断：${delta.error?.current ?? 'unknown'}` })
        pendingDownloads.delete(downloadId)
      }
    }
  })

  console.log('[DownloadCapture] 下载捕获模块已初始化（全局复制捕获验证版）')
}
