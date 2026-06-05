import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { cpSync, existsSync, readFileSync, mkdirSync, readdirSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { registerIpcHandlers, prefetchTessdata } from './ipc'
import { loadConfig, saveConfig } from './config'

const NATIVE_HOST_NAME = 'com.flowpilot.host'
const EXTENSION_ID = 'gehkoeflghpbmmljaoggjddmgjjimnbf'
const isNativeHost = process.argv.some(arg => arg.startsWith('chrome-extension://'))

let mainWindow: BrowserWindow | null = null

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
    const dirMissing  = !existsSync(extensionDir)
    const dirEmpty    = !dirMissing && readdirSync(extensionDir).length === 0
    const hashChanged = bundledManifest.hash !== installedManifest?.hash
    const filesMissing = bundledManifest.files.some(
      (f) => !existsSync(join(extensionDir, f))
    )

    if (dirMissing || dirEmpty || hashChanged || filesMissing) {
      mkdirSync(extensionDir, { recursive: true })
      cpSync(bundledPath, extensionDir, { recursive: true })
      config.extensionHash = bundledManifest.hash
      config.lastUpdatedAt = new Date().toISOString()
      saveConfig(config)
    }
  } catch {
    // 静默忽略
  }
}

// 注册 Native Messaging Host 到系统（仅生产环境 + Windows）
function registerNativeHost(): void {
  if (process.platform !== 'win32' || is.dev) return
  try {
    const configDir = join(app.getPath('userData'), 'flowpilot')
    mkdirSync(configDir, { recursive: true })
    const manifestPath = join(configDir, 'native-host.json')
    writeFileSync(manifestPath, JSON.stringify({
      name: NATIVE_HOST_NAME,
      description: 'FlowPilot Native Messaging Host',
      path: process.execPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
    }, null, 2), 'utf-8')
    console.log('[registerNativeHost] manifest 路径：', manifestPath)
    console.log('[registerNativeHost] EXE 路径：', process.execPath)
    execSync(`reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'ignore' })
    execSync(`reg add "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'ignore' })
    console.log('[registerNativeHost] 注册表写入成功')
  } catch (err) {
    console.error('[registerNativeHost] 注册失败：', err)
  }
}

if (isNativeHost) {
  // ── Native Messaging Host 模式：读 stdin → 处理消息 → 写 stdout → 退出 ────────
  const sendNativeResponse = (obj: object): void => {
    const json = JSON.stringify(obj)
    const buf = Buffer.alloc(4 + json.length)
    buf.writeUInt32LE(json.length, 0)
    buf.write(json, 4, 'utf-8')
    process.stdout.write(buf)
  }

  const chunks: Buffer[] = []
  process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
  process.stdin.on('end', () => {
    const buf = Buffer.concat(chunks)
    if (buf.length < 4) { process.exit(0); return }
    const msgLen = buf.readUInt32LE(0)
    if (buf.length < 4 + msgLen) { process.exit(0); return }
    let msg: Record<string, unknown>
    try { msg = JSON.parse(buf.slice(4, 4 + msgLen).toString('utf-8')) }
    catch { process.exit(1); return }

    if (msg.type === 'SAVE_SCREENSHOT') {
      try {
        // native host 模式下 app.getPath 不可用，用环境变量定位配置文件
        const appData = process.env['APPDATA'] || join(os.homedir(), 'AppData', 'Roaming')
        const configFile = join(appData, 'FlowPilot Client', 'flowpilot', 'config.json')
        let screenshotDir = join(os.homedir(), 'Downloads', 'FlowPilot')
        if (existsSync(configFile)) {
          try {
            const cfg = JSON.parse(readFileSync(configFile, 'utf-8')) as Record<string, unknown>
            if (cfg.screenshotDir) screenshotDir = cfg.screenshotDir as string
          } catch { /* 使用默认目录 */ }
        }
        mkdirSync(screenshotDir, { recursive: true })
        const base64 = (msg.dataUrl as string).replace(/^data:image\/png;base64,/, '')
        const filePath = join(screenshotDir, msg.filename as string)
        writeFileSync(filePath, Buffer.from(base64, 'base64'))
        sendNativeResponse({ ok: true, path: filePath })
      } catch (err) {
        sendNativeResponse({ ok: false, error: (err as Error).message })
      }
    } else {
      sendNativeResponse({ ok: false, error: 'unknown message type' })
    }
    process.exit(0)
  })
  process.stdin.resume()
} else {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.flowpilot.client')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 首次运行：将内置插件复制到用户目录
    initBundledExtension()

    // 注册 Native Messaging Host（生产环境）
    registerNativeHost()

    // 应用开机启动设置
    const { launchAtStartup } = loadConfig()
    app.setLoginItemSettings({ openAtLogin: !!launchAtStartup, openAsHidden: true })

    // 后台静默预下载 OCR 语言包（已缓存则跳过）
    prefetchTessdata()

    mainWindow = createWindow()
    registerIpcHandlers(mainWindow)

    createTray(mainWindow)

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
  })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.quit()
  })
}
