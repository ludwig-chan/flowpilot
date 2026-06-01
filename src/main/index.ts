import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { cpSync, existsSync, readFileSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc'
import { loadConfig, saveConfig, readManifestVersion } from './config'

let mainWindow: BrowserWindow | null = null

function createWindow(): BrowserWindow {
  const iconPath = is.dev
    ? join(process.cwd(), 'resources', 'icon.png')
    : join(process.resourcesPath, 'icon.png')

  const win = new BrowserWindow({
    width: 780,
    height: 560,
    minWidth: 680,
    minHeight: 480,
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

  win.on('ready-to-show', () => win.show())

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

/** 启动时将内置插件同步到 extensionDir（内置版本更新时自动覆盖） */
function initBundledExtension(): void {
  const config = loadConfig()
  const { extensionDir } = config

  const bundledPath = is.dev
    ? join(process.cwd(), 'resources', 'extension')
    : join(process.resourcesPath, 'extension')

  if (!existsSync(bundledPath)) return

  try {
    // 读取内置版本
    const bundledManifestPath = join(bundledPath, 'manifest.json')
    if (!existsSync(bundledManifestPath)) return
    const bundledManifest = JSON.parse(readFileSync(bundledManifestPath, 'utf-8'))
    const bundledVersion: string = bundledManifest.version || '0.0.0'

    // 读取已安装版本
    const installedVersion = readManifestVersion(extensionDir).replace(/^v/, '')

    // 比较版本，内置更新则覆盖
    const parse = (v: string): number[] => v.split('.').map((n) => parseInt(n, 10) || 0)
    const [bMaj, bMin, bPat] = parse(bundledVersion)
    const [iMaj, iMin, iPat] = parse(installedVersion)
    const bundledIsNewer =
      bMaj !== iMaj ? bMaj > iMaj : bMin !== iMin ? bMin > iMin : bPat > iPat

    if (!existsSync(extensionDir) || bundledIsNewer) {
      mkdirSync(extensionDir, { recursive: true })
      cpSync(bundledPath, extensionDir, { recursive: true })
      config.currentVersion = `v${bundledVersion}`
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
