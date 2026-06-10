import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { cpSync, existsSync, readFileSync, mkdirSync, readdirSync, rmSync, renameSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { setTrayAutoClickerStatus } from './tray'
import { registerIpcHandlers, prefetchTessdata } from './ipc'
import { getEffectiveScreenshotDir, loadConfig, saveConfig } from './config'
import { AutoClickerService } from './autoClicker'
import {
  createUniqueScreenshotPath,
  recordScreenshot,
  type ScreenshotSaveMetadata
} from './screenshotLibrary'

const pad2 = (n: number) => String(n).padStart(2, '0')
function localTimeString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

const EXTENSION_ID = 'gehkoeflghpbmmljaoggjddmgjjimnbf'
const SCREENSHOT_BRIDGE_HOST = '127.0.0.1'
const SCREENSHOT_BRIDGE_PORTS = Array.from({ length: 11 }, (_, i) => 17365 + i)
const SCREENSHOT_BRIDGE_MAX_BODY = 50 * 1024 * 1024

let mainWindow: BrowserWindow | null = null
let autoClicker: AutoClickerService | null = null
let screenshotBridgeServer: Server | null = null

function createWindow(): BrowserWindow {
  const iconPath = is.dev
    ? join(process.cwd(), 'resources', 'icon.png')
    : join(process.resourcesPath, 'icon.png')

  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: Math.round(sw * 0.5),
    height: Math.round(sh * 0.5),
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'FlowPilot Client',
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('close', (e) => {
    if (!(app as typeof app & { isQuitting: boolean }).isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

interface BundleManifest {
  hash: string
  builtAt: string
  files: string[]
}

/** 启动时将内置插件同步到 extensionDir（bundle.manifest.json 变化或文件缺失时自动覆盖） */
function initBundledExtension(): void {
  const config = loadConfig()
  const { extensionDir } = config

  const bundledPath = is.dev
    ? join(process.cwd(), 'resources', 'extension')
    : join(process.resourcesPath, 'extension')

  if (!existsSync(bundledPath)) return

  try {
    // 读取内置 manifest（不存在则视为空）
    const bundledManifestFile = join(bundledPath, 'bundle.manifest.json')
    const bundledManifest: BundleManifest = existsSync(bundledManifestFile)
      ? JSON.parse(readFileSync(bundledManifestFile, 'utf-8'))
      : { hash: '', builtAt: '', files: [] }

    // 读取已安装 manifest
    const installedManifestFile = join(extensionDir, 'bundle.manifest.json')
    const installedManifest: BundleManifest | null = existsSync(installedManifestFile)
      ? JSON.parse(readFileSync(installedManifestFile, 'utf-8'))
      : null

    // 判断是否需要更新
    const dirMissing   = !existsSync(extensionDir)
    const dirEmpty     = !dirMissing && readdirSync(extensionDir).length === 0
    const hashChanged  = bundledManifest.hash !== installedManifest?.hash
    const filesMissing = bundledManifest.files.some(
      (f) => !existsSync(join(extensionDir, f))
    )

    if (dirMissing || dirEmpty || hashChanged || filesMissing) {
      // 原子性更新：先复制到临时目录，再替换旧目录，避免残留文件
      const parentDir = join(extensionDir, '..')
      const tempDir   = join(parentDir, `extension_tmp_${Date.now()}`)

      mkdirSync(parentDir, { recursive: true })
      cpSync(bundledPath, tempDir, { recursive: true })

      // 临时目录就绪后，删除旧目录并重命名临时目录
      if (existsSync(extensionDir)) {
        rmSync(extensionDir, { recursive: true, force: true })
      }
      renameSync(tempDir, extensionDir)

      config.extensionHash = bundledManifest.hash
      config.lastUpdatedAt = localTimeString()
      saveConfig(config)
    }
  } catch {
    // 静默忽略
  }
}

/** 读取配置文件，返回截图保存目录 */
function resolveScreenshotDir(): string {
  const config = loadConfig()
  return getEffectiveScreenshotDir(config.screenshotDir)
}

/** 将 PNG data URL 写入文件，返回文件路径 */
function saveScreenshotFile(
  dataUrl: string,
  filename: string,
  metadata: ScreenshotSaveMetadata = {}
): { id: string; filename: string; path: string } {
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    throw new Error('仅支持 PNG data URL')
  }
  const screenshotDir = resolveScreenshotDir()
  mkdirSync(screenshotDir, { recursive: true })
  const { filename: savedFilename, filePath } = createUniqueScreenshotPath(filename || 'screenshot.png')
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  writeFileSync(filePath, Buffer.from(base64, 'base64'))
  const item = recordScreenshot(filePath, savedFilename, metadata)
  return { id: item.id, filename: item.filename, path: filePath }
}

function setCorsHeaders(res: ServerResponse, origin?: string): void {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Max-Age', '600')
}

function sendJson(res: ServerResponse, statusCode: number, payload: object, origin?: string): void {
  setCorsHeaders(res, origin)
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function isAllowedOrigin(origin: string | undefined): boolean {
  return origin === `chrome-extension://${EXTENSION_ID}`
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    let rejected = false
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      if (rejected) return
      size += chunk.length
      if (size > SCREENSHOT_BRIDGE_MAX_BODY) {
        rejected = true
        reject(new Error('请求体过大'))
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (rejected) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
      } catch {
        reject(new Error('JSON 格式无效'))
      }
    })
    req.on('error', reject)
  })
}

function createScreenshotBridgeServer(): Server {
  return createServer(async (req, res) => {
    const origin = req.headers.origin
    const originValue = Array.isArray(origin) ? origin[0] : origin
    const url = new URL(req.url || '/', `http://${SCREENSHOT_BRIDGE_HOST}`)

    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, app: 'FlowPilot' }, originValue)
      return
    }

    if (req.method === 'OPTIONS') {
      if (!isAllowedOrigin(originValue)) {
        sendJson(res, 403, { ok: false, error: 'forbidden origin' })
        return
      }
      setCorsHeaders(res, originValue)
      res.writeHead(204)
      res.end()
      return
    }

    if (!isAllowedOrigin(originValue)) {
      sendJson(res, 403, { ok: false, error: 'forbidden origin' })
      return
    }

    if (req.method === 'POST' && url.pathname === '/screenshots') {
      try {
        const body = await readJsonBody(req) as {
          filename?: unknown
          dataUrl?: unknown
          runId?: unknown
          runStartedAt?: unknown
          flowId?: unknown
          flowName?: unknown
          sourceUrl?: unknown
          sourceTitle?: unknown
        }
        if (typeof body.filename !== 'string' || typeof body.dataUrl !== 'string') {
          sendJson(res, 400, { ok: false, error: 'filename 和 dataUrl 必须为字符串' }, originValue)
          return
        }
        const saved = saveScreenshotFile(body.dataUrl, body.filename, {
          runId: typeof body.runId === 'string' ? body.runId : undefined,
          runStartedAt: typeof body.runStartedAt === 'string' ? body.runStartedAt : undefined,
          flowId: typeof body.flowId === 'string' ? body.flowId : undefined,
          flowName: typeof body.flowName === 'string' ? body.flowName : undefined,
          sourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl : undefined,
          sourceTitle: typeof body.sourceTitle === 'string' ? body.sourceTitle : undefined
        })
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('screenshots-updated')
        }
        sendJson(res, 200, { ok: true, id: saved.id, filename: saved.filename, path: saved.path }, originValue)
      } catch (err) {
        const message = (err as Error).message
        sendJson(res, message === '请求体过大' ? 413 : 400, { ok: false, error: message }, originValue)
      }
      return
    }

    sendJson(res, 404, { ok: false, error: 'not found' }, originValue)
  })
}

async function startScreenshotBridge(): Promise<void> {
  if (screenshotBridgeServer) return

  for (const port of SCREENSHOT_BRIDGE_PORTS) {
    const server = createScreenshotBridgeServer()
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, SCREENSHOT_BRIDGE_HOST, () => {
          server.off('error', reject)
          resolve()
        })
      })
      screenshotBridgeServer = server
      console.log(`[ScreenshotBridge] listening on http://${SCREENSHOT_BRIDGE_HOST}:${port}`)
      return
    } catch (err) {
      try { server.close() } catch { /* server was not listening */ }
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EADDRINUSE') {
        console.warn(`[ScreenshotBridge] 端口 ${port} 启动失败：`, (err as Error).message)
      }
    }
  }

  console.warn('[ScreenshotBridge] 所有端口均不可用，截图将只能降级为浏览器下载')
}

app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.flowpilot.client')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 首次运行：将内置插件复制到用户目录
    initBundledExtension()

    // 启动本地截图传输服务
    void startScreenshotBridge()

    // 应用开机启动设置
    const { launchAtStartup } = loadConfig()
    app.setLoginItemSettings({ openAtLogin: !!launchAtStartup, openAsHidden: true })

    // 后台静默预下载 OCR 语言包（已缓存则跳过）
    prefetchTessdata()

    mainWindow = createWindow()
    autoClicker = new AutoClickerService({
      getEnabled: () => !!loadConfig().autoClickerEnabled,
      setEnabled: (enabled) => {
        const config = loadConfig()
        config.autoClickerEnabled = enabled
        saveConfig(config)
      },
      onStatusChange: (status) => {
        mainWindow?.webContents.send('auto-clicker-status-changed', status)
        if (mainWindow) setTrayAutoClickerStatus(mainWindow, status)
      }
    })
    registerIpcHandlers(mainWindow, autoClicker)

    createTray(mainWindow, () => {
      const status = autoClicker?.toggle()
      if (status && mainWindow) setTrayAutoClickerStatus(mainWindow, status)
    })
    setTrayAutoClickerStatus(mainWindow, autoClicker.getStatus())
    autoClicker.startFromConfig()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow()
      } else {
        mainWindow?.show()
      }
    })
  })

  app.on('before-quit', () => {
    ;(app as typeof app & { isQuitting: boolean }).isQuitting = true
    autoClicker?.dispose()
    screenshotBridgeServer?.close()
  })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.quit()
  })
