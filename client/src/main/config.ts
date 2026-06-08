import { app } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export interface AppConfig {
  extensionDir: string
  extensionHash: string
  lastUpdatedAt: string
  screenshotDir?: string
  launchAtStartup?: boolean
  autoClickerEnabled?: boolean
  currentVersion?: string
}

const CONFIG_DIR = path.join(app.getPath('userData'), 'flowpilot')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: AppConfig = {
  extensionDir: path.join(app.getPath('userData'), 'extension'),
  extensionHash: '',
  lastUpdatedAt: '',
  autoClickerEnabled: false
}

export function getDefaultScreenshotDir(): string {
  return path.join(app.getPath('userData'), 'data', 'screenshots')
}

function getLegacyDefaultScreenshotDir(): string {
  return path.join(os.homedir(), 'Downloads', 'FlowPilot')
}

function normalizePathForCompare(dirPath: string): string {
  const resolved = path.resolve(dirPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

export function getEffectiveScreenshotDir(screenshotDir?: string): string {
  const dir = screenshotDir?.trim()
  if (!dir) return getDefaultScreenshotDir()

  if (normalizePathForCompare(dir) === normalizePathForCompare(getLegacyDefaultScreenshotDir())) {
    return getDefaultScreenshotDir()
  }

  return dir
}

export function loadConfig(): AppConfig {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true })
    }
    if (!fs.existsSync(CONFIG_FILE)) {
      saveConfig(DEFAULT_CONFIG)
      return { ...DEFAULT_CONFIG }
    }
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}
