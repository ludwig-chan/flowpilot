import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

export interface AppConfig {
  extensionDir: string
  extensionHash: string
  lastUpdatedAt: string
  screenshotDir?: string   // 截图保存目录
  launchAtStartup?: boolean // 开机自动启动
  currentVersion?: string  // 运行时字段，不持久化
}

const CONFIG_DIR = path.join(app.getPath('userData'), 'flowpilot')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

const DEFAULT_CONFIG: AppConfig = {
  extensionDir: path.join(app.getPath('userData'), 'extension'),
  extensionHash: '',
  lastUpdatedAt: '',
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


