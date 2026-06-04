import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { cpSync, existsSync, readFileSync, mkdirSync, readdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc'
import { loadConfig, saveConfig } from './config'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const iconPath = is.dev
    ? join(process.cwd(), 'resources', 'icon.png')
    : join(process.resourcesPath, 'icon.png')

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
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
    win.maximize()
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.flowpilot.client')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 首次运行：将内置插件复制到用户目录
  initBundledExtension()

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
