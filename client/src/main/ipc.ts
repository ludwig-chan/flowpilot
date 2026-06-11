import { app, ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { spawn } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getEffectiveScreenshotDir, loadConfig, saveConfig, AppConfig } from './config'
import type { AutoClickerService, AutoClickerStatus } from './autoClicker'
import {
  createScreenshotTag,
  deleteScreenshotPermanently,
  getScreenshotImage,
  listScreenshots,
  openScreenshotInExplorer,
  restoreScreenshot,
  syncLibrary,
  trashScreenshot,
  updateScreenshotOcr,
  updateScreenshotTags
} from './screenshotLibrary'
import {
  createDataRecordTag,
  deleteDataRecordPermanently,
  listDataRecords,
  restoreDataRecord,
  trashDataRecord,
  updateDataRecordTags
} from './dataRecordLibrary'

const TESS_LANGS = ['chi_sim', 'eng'] as const

/**
 * 应用启动时在后台静默预下载 Tesseract 语言包。
 * 若语言包已全部缓存则立即跳过，不产生任何网络请求。
 */
export async function prefetchTessdata(): Promise<void> {
  const langPath = join(app.getPath('userData'), 'tessdata')
  const allCached = TESS_LANGS.every((lang) =>
    existsSync(join(langPath, `${lang}.traineddata`))
  )
  if (allCached) return

  mkdirSync(langPath, { recursive: true })
  try {
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker(TESS_LANGS as unknown as string[], 1, {
      cachePath: langPath,
      cacheMethod: 'write',
    })
    await worker.terminate()
    console.log('[OCR] 语言包预下载完成')
  } catch (err) {
    console.warn('[OCR] 语言包预下载失败，将在首次使用时重试：', (err as Error).message)
  }
}

const BROWSER_CONFIGS: Record<string, { name: string; paths: string[]; extPage: string }> = {
  chrome: {
    name: 'Google Chrome',
    paths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    ],
    extPage: 'chrome://extensions'
  },
  edge: {
    name: 'Microsoft Edge',
    paths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    extPage: 'edge://extensions'
  }
}

function findBrowserExe(id: string): string | null {
  const cfg = BROWSER_CONFIGS[id]
  if (!cfg) return null
  return cfg.paths.find((p) => existsSync(p)) ?? null
}

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  autoClicker?: AutoClickerService
): void {
  // 获取配置（currentVersion 来自客户端自身版本号）
  ipcMain.handle('get-config', () => {
    const config = loadConfig()
    config.currentVersion = `v${app.getVersion()}`
    config.screenshotDir = getEffectiveScreenshotDir(config.screenshotDir)
    return config
  })

  // 保存配置
  ipcMain.handle('save-config', (_event, config: AppConfig) => {
    saveConfig(config)
    return true
  })

  // 选择目录
  ipcMain.handle('open-dir-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择插件安装目录'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 在资源管理器中打开目录
  ipcMain.handle('open-in-explorer', (_event, dirPath: string) => {
    shell.openPath(dirPath)
  })

  ipcMain.handle('list-screenshots', () => {
    return listScreenshots()
  })

  ipcMain.handle('get-screenshot-image', (_event, id: string) => {
    return getScreenshotImage(id)
  })

  ipcMain.handle('create-screenshot-tag', (_event, name: string) => {
    return createScreenshotTag(name)
  })

  ipcMain.handle('update-screenshot-tags', (_event, id: string, tagIds: unknown) => {
    const safeTagIds = Array.isArray(tagIds)
      ? tagIds.filter((tagId): tagId is string => typeof tagId === 'string')
      : []
    return updateScreenshotTags(id, safeTagIds)
  })

  ipcMain.handle('trash-screenshot', (_event, id: string) => {
    return trashScreenshot(id)
  })

  ipcMain.handle('restore-screenshot', (_event, id: string) => {
    return restoreScreenshot(id)
  })

  ipcMain.handle('delete-screenshot-permanently', (_event, id: string) => {
    return deleteScreenshotPermanently(id)
  })

  ipcMain.handle('open-screenshot-in-explorer', (_event, id: string) => {
    return openScreenshotInExplorer(id)
  })

  ipcMain.handle('list-data-records', () => {
    return listDataRecords()
  })

  ipcMain.handle('create-data-record-tag', (_event, name: string) => {
    return createDataRecordTag(name)
  })

  ipcMain.handle('update-data-record-tags', (_event, id: string, tagIds: unknown) => {
    const safeTagIds = Array.isArray(tagIds)
      ? tagIds.filter((tagId): tagId is string => typeof tagId === 'string')
      : []
    return updateDataRecordTags(id, safeTagIds)
  })

  ipcMain.handle('trash-data-record', (_event, id: string) => {
    return trashDataRecord(id)
  })

  ipcMain.handle('restore-data-record', (_event, id: string) => {
    return restoreDataRecord(id)
  })

  ipcMain.handle('delete-data-record-permanently', (_event, id: string) => {
    return deleteDataRecordPermanently(id)
  })

  // 检测已安装的浏览器
  ipcMain.handle('detect-browsers', () => {
    const results: Array<{ id: string; name: string; exePath: string }> = []
    for (const [id, cfg] of Object.entries(BROWSER_CONFIGS)) {
      const exePath = findBrowserExe(id)
      if (exePath) results.push({ id, name: cfg.name, exePath })
    }
    return results
  })

  // 打开浏览器扩展管理页
  ipcMain.handle('open-browser-ext-page', (_event, browserId: string) => {
    const exePath = findBrowserExe(browserId)
    if (!exePath) return { success: false, error: '未检测到该浏览器' }
    const extPage = BROWSER_CONFIGS[browserId]?.extPage
    if (!extPage) return { success: false, error: '未知浏览器类型' }
    try {
      const child = spawn(exePath, [extPage], { detached: true, stdio: 'ignore' })
      child.unref()
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // 获取开机启动状态
  ipcMain.handle('get-launch-at-startup', () => {
    return app.getLoginItemSettings().openAtLogin
  })

  // 设置开机启动
  ipcMain.handle('set-launch-at-startup', (_event, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true })
    const config = loadConfig()
    config.launchAtStartup = enabled
    saveConfig(config)
    return true
  })

  ipcMain.handle('get-auto-clicker-status', (): AutoClickerStatus => {
    return autoClicker?.getStatus() ?? {
      supported: process.platform === 'win32',
      enabled: false,
      clicking: false
    }
  })

  ipcMain.handle('set-auto-clicker-enabled', (_event, enabled: boolean): AutoClickerStatus => {
    return autoClicker?.setEnabled(enabled) ?? {
      supported: process.platform === 'win32',
      enabled: false,
      clicking: false
    }
  })

  // 自动加载插件（浏览器需已关闭）
  ipcMain.handle('load-extension-auto', (_event, browserId: string) => {
    const cfg = loadConfig()
    const exePath = findBrowserExe(browserId)
    if (!exePath) return { success: false, error: '未检测到该浏览器' }
    try {
      const child = spawn(exePath, [`--load-extension=${cfg.extensionDir}`], {
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // OCR 识别：接收 PNG/JPEG data URL，返回识别文字（中英文）
  ipcMain.handle('ocr-image', async (_event, dataUrl: string) => {
    const { createWorker } = await import('tesseract.js')
    const langPath = join(app.getPath('userData'), 'tessdata')
    const worker = await createWorker(TESS_LANGS as unknown as string[], 1, {
      cachePath: langPath,
      cacheMethod: 'write',
    })
    try {
      const { data: { text } } = await worker.recognize(dataUrl)
      return { success: true, text: text.trim() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    } finally {
      await worker.terminate()
    }
  })

  // OCR 单张截图：识别并保存结果（已有结果直接返回缓存）
  ipcMain.handle('ocr-screenshot', async (_event, screenshotId: string) => {
    // 先检查已有 OCR 结果，避免重复识别
    const library = syncLibrary()
    const existing = library.screenshots.find((s) => s.id === screenshotId)
    if (existing?.ocrText) {
      return { success: true, text: existing.ocrText }
    }

    const image = getScreenshotImage(screenshotId)
    if (!image) return { success: false, error: '截图文件不存在' }

    const { createWorker } = await import('tesseract.js')
    const langPath = join(app.getPath('userData'), 'tessdata')
    const worker = await createWorker(TESS_LANGS as unknown as string[], 1, {
      cachePath: langPath,
      cacheMethod: 'write',
    })
    try {
      const { data: { text } } = await worker.recognize(image.dataUrl)
      const trimmed = text.trim()
      updateScreenshotOcr(screenshotId, trimmed)
      return { success: true, text: trimmed }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    } finally {
      await worker.terminate()
    }
  })

  // OCR 批量截图：识别所有未识别的截图（已有结果直接返回缓存）
  ipcMain.handle('ocr-screenshots-batch', async (_event, screenshotIds?: string[]) => {
    const all = listScreenshots()
    // 已有 OCR 结果的截图直接返回缓存，不重复识别
    const cached = screenshotIds
      ? all.screenshots.filter((s) => screenshotIds.includes(s.id) && s.ocrText)
      : []
    const cachedResults = cached.map((s) => ({ id: s.id, text: s.ocrText!, filename: s.filename }))
    const targets = screenshotIds
      ? all.screenshots.filter((s) => screenshotIds.includes(s.id) && !s.ocrText)
      : all.screenshots.filter((s) => s.status === 'active' && !s.ocrText)

    if (targets.length === 0 && cached.length === 0) return { success: true, results: [] }
    if (targets.length === 0) return { success: true, results: cachedResults }

    const { createWorker } = await import('tesseract.js')
    const langPath = join(app.getPath('userData'), 'tessdata')
    const worker = await createWorker(TESS_LANGS as unknown as string[], 1, {
      cachePath: langPath,
      cacheMethod: 'write',
    })

    const results: Array<{ id: string; text?: string; error?: string; filename: string }> = []
    try {
      for (const item of targets) {
        try {
          const { data: { text } } = await worker.recognize(item.thumbnailDataUrl)
          const trimmed = text.trim()
          updateScreenshotOcr(item.id, trimmed)
          results.push({ id: item.id, text: trimmed, filename: item.filename })
        } catch (err) {
          results.push({ id: item.id, error: (err as Error).message, filename: item.filename })
        }
      }
      return { success: true, results: [...cachedResults, ...results] }
    } catch (err) {
      return { success: false, error: (err as Error).message, results: [...cachedResults, ...results] }
    } finally {
      await worker.terminate()
    }
  })
}
