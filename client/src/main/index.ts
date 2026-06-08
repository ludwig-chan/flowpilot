import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { appendFileSync, cpSync, existsSync, readFileSync, mkdirSync, readdirSync, rmSync, renameSync, writeFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createTray } from './tray'
import { setTrayAutoClickerStatus } from './tray'
import { registerIpcHandlers, prefetchTessdata } from './ipc'
import { loadConfig, saveConfig } from './config'
import { AutoClickerService } from './autoClicker'

const NATIVE_HOST_NAME = 'com.flowpilot.host'
const EXTENSION_ID = 'gehkoeflghpbmmljaoggjddmgjjimnbf'
const isNativeHost = process.argv.some(arg => arg.startsWith('chrome-extension://'))

let mainWindow: BrowserWindow | null = null
let autoClicker: AutoClickerService | null = null

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

    let exePath = process.execPath

    // ── 便携版检测 ──────────────────────────────────────────────
    // 便携版通过 NSIS 启动器解压到临时目录运行，process.execPath 指向临时路径。
    // NSIS 启动器不会转发 stdin/stdout，所以不能直接注册便携版 exe。
    // 解决方案：将解压后的完整应用复制到稳定位置，注册内部 exe。
    const portableExe = process.env['PORTABLE_EXECUTABLE_FILE']
    const isTempPath = exePath.toLowerCase().includes('\\temp\\') ||
                       exePath.toLowerCase().includes('\\tmp\\')

    if (portableExe || isTempPath) {
      const stableDir = join(os.homedir(), 'AppData', 'Local', 'FlowPilot', 'bin')
      const sourceDir = join(exePath, '..')
      mkdirSync(stableDir, { recursive: true })
      cpSync(sourceDir, stableDir, { recursive: true })
      exePath = join(stableDir, 'FlowPilotClient.exe')
      console.log('[registerNativeHost] 便携版：已复制到稳定位置', stableDir)
    }

    const manifestPath = join(configDir, 'native-host.json')
    writeFileSync(manifestPath, JSON.stringify({
      name: NATIVE_HOST_NAME,
      description: 'FlowPilot Native Messaging Host',
      path: exePath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`]
    }, null, 2), 'utf-8')
    console.log('[registerNativeHost] manifest 路径：', manifestPath)
    console.log('[registerNativeHost] EXE 路径：', exePath)
    execSync(`reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'ignore' })
    execSync(`reg add "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NATIVE_HOST_NAME}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'ignore' })
    console.log('[registerNativeHost] 注册表写入成功')
  } catch (err) {
    console.error('[registerNativeHost] 注册失败：', err)
  }
}

if (isNativeHost) {
  // ── Native Messaging Host 模式 ─────────────────────────────────────────────
  // 支持两种协议：
  //   旧协议（向后兼容）：单条 SAVE_SCREENSHOT 消息，dataUrl 内联
  //   新协议（分块传输）：SAVE_SCREENSHOT_START → SAVE_SCREENSHOT_CHUNK ×N → SAVE_SCREENSHOT_END
  // 注意：stdout 只能输出协议格式（4字节头+JSON），任何额外输出会破坏通信
  // 所以诊断日志必须写文件，不能 console.log/write 到 stdout
  const logFile = join(os.homedir(), 'AppData', 'Local', 'FlowPilot', 'native-host-debug.log')
  const log = (msg: string): void => {
    try { appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`) } catch { /* 不影响主流程 */ }
  }
  log(`Native Host 启动，exe=${process.execPath}, pid=${process.pid}`)
  log(`命令行参数: ${process.argv.join(' ')}`)

  const sendNativeResponse = (obj: object): void => {
    const json = JSON.stringify(obj)
    const buf = Buffer.alloc(4 + json.length)
    buf.writeUInt32LE(json.length, 0)
    buf.write(json, 4, 'utf-8')
    process.stdout.write(buf)
  }

  /** 从 buffer 中解析所有完整的 Native Messaging 消息（4字节长度头 + JSON body） */
  function parseMessages(buffer: Buffer): { messages: Record<string, unknown>[]; remaining: Buffer } {
    const messages: Record<string, unknown>[] = []
    let offset = 0
    while (offset + 4 <= buffer.length) {
      const msgLen = buffer.readUInt32LE(offset)
      if (offset + 4 + msgLen > buffer.length) break // 不完整，等待更多数据
      try {
        const msg = JSON.parse(buffer.slice(offset + 4, offset + 4 + msgLen).toString('utf-8'))
        messages.push(msg)
      } catch (err) {
        log(`JSON 解析失败 (offset=${offset}): ${(err as Error).message}`)
      }
      offset += 4 + msgLen
    }
    return { messages, remaining: buffer.slice(offset) }
  }

  /** 读取配置文件，返回截图保存目录 */
  function resolveScreenshotDir(): string {
    const appData = process.env['APPDATA'] || join(os.homedir(), 'AppData', 'Roaming')
    const configFile = join(appData, 'FlowPilot Client', 'flowpilot', 'config.json')
    log(`配置文件路径: ${configFile}, 存在=${existsSync(configFile)}`)
    let dir = join(os.homedir(), 'Downloads', 'FlowPilot')
    if (existsSync(configFile)) {
      try {
        const cfg = JSON.parse(readFileSync(configFile, 'utf-8')) as Record<string, unknown>
        log(`配置读取成功, screenshotDir=${cfg.screenshotDir ?? '(未设置)'}`)
        if (cfg.screenshotDir) dir = cfg.screenshotDir as string
      } catch (err) {
        log(`配置读取失败: ${(err as Error).message}, 使用默认目录`)
      }
    }
    return dir
  }

  /** 将 base64 data URL 写入文件，返回文件路径 */
  function saveScreenshotFile(dataUrl: string, filename: string): string {
    const screenshotDir = resolveScreenshotDir()
    mkdirSync(screenshotDir, { recursive: true })
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    log(`base64 数据长度=${base64.length}, 目标目录=${screenshotDir}`)
    const filePath = join(screenshotDir, filename)
    writeFileSync(filePath, Buffer.from(base64, 'base64'))
    return filePath
  }

  // ── 分块传输状态 ──
  let chunkFilename = ''
  let chunkTotal = 0
  let chunkBuffer = ''
  let chunkReceived = 0

  // ── 流式消息处理 ──
  let stdinBuffer: Buffer = Buffer.alloc(0)

  function handleMessage(msg: Record<string, unknown>): void {
    log(`收到消息 type=${msg.type}`)

    if (msg.type === 'SAVE_SCREENSHOT_START') {
      chunkFilename = msg.filename as string
      chunkTotal = msg.totalChunks as number
      chunkBuffer = ''
      chunkReceived = 0
      log(`[分块] 开始接收截图，filename=${chunkFilename}, totalChunks=${chunkTotal}`)
    } else if (msg.type === 'SAVE_SCREENSHOT_CHUNK') {
      chunkBuffer += msg.data as string
      chunkReceived++
      log(`[分块] 收到 chunk ${msg.index}/${chunkTotal}，累计数据长度=${chunkBuffer.length}`)
    } else if (msg.type === 'SAVE_SCREENSHOT_END') {
      log(`[分块] 接收完毕，共 ${chunkReceived} 块，总数据长度=${chunkBuffer.length}`)
      try {
        const filePath = saveScreenshotFile(chunkBuffer, chunkFilename)
        log(`截图保存成功: ${filePath}`)
        sendNativeResponse({ ok: true, path: filePath })
      } catch (err) {
        log(`截图保存失败: ${(err as Error).message}`)
        sendNativeResponse({ ok: false, error: (err as Error).message })
      }
      log('处理完毕，退出')
      process.exit(0)
    } else if (msg.type === 'SAVE_SCREENSHOT') {
      // ── 旧协议向后兼容：单条消息包含完整 dataUrl ──
      log(`[旧协议] 开始保存截图，filename=${msg.filename}`)
      try {
        const filePath = saveScreenshotFile(msg.dataUrl as string, msg.filename as string)
        log(`截图保存成功: ${filePath}`)
        sendNativeResponse({ ok: true, path: filePath })
      } catch (err) {
        log(`截图保存失败: ${(err as Error).message}`)
        sendNativeResponse({ ok: false, error: (err as Error).message })
      }
      log('处理完毕，退出')
      process.exit(0)
    } else {
      log(`未知消息类型: ${msg.type}`)
      sendNativeResponse({ ok: false, error: 'unknown message type' })
    }
  }

  // 超时保护：30 秒无活动则退出
  let activityTimer = setTimeout(() => {
    log('超时（30秒无活动），退出')
    process.exit(1)
  }, 30_000)

  process.stdin.on('data', (chunk: Buffer) => {
    // 重置超时计时器
    clearTimeout(activityTimer)
    activityTimer = setTimeout(() => {
      log('超时（30秒无活动），退出')
      process.exit(1)
    }, 30_000)

    stdinBuffer = Buffer.concat([stdinBuffer, chunk])
    log(`stdin 收到 ${chunk.length} 字节，缓冲区总长度=${stdinBuffer.length}`)
    const { messages, remaining } = parseMessages(stdinBuffer)
    stdinBuffer = remaining
    for (const msg of messages) {
      handleMessage(msg)
    }
  })

  process.stdin.on('end', () => {
    log(`stdin 关闭，剩余缓冲区=${stdinBuffer.length} 字节`)
    // 处理可能残留的最后一条消息
    if (stdinBuffer.length >= 4) {
      const { messages } = parseMessages(stdinBuffer)
      for (const msg of messages) {
        handleMessage(msg)
      }
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
  })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') app.quit()
  })
}
