import { ElectronAPI } from '@electron-toolkit/preload'

interface AppConfig {
  extensionDir: string
  extensionHash: string
  lastUpdatedAt: string
  screenshotDir?: string
  launchAtStartup?: boolean
  autoClickerEnabled?: boolean
  currentVersion: string
}

interface BrowserInfo {
  id: string
  name: string
  exePath: string
}

interface FlowPilotAPI {
  getConfig: () => Promise<AppConfig>
  saveConfig: (config: AppConfig) => Promise<boolean>
  openDirDialog: () => Promise<string | null>
  openInExplorer: (dirPath: string) => Promise<void>
  detectBrowsers: () => Promise<BrowserInfo[]>
  openBrowserExtPage: (browserId: string) => Promise<{ success: boolean; error?: string }>
  loadExtensionAuto: (browserId: string) => Promise<{ success: boolean; error?: string }>
  ocrImage: (dataUrl: string) => Promise<{ success: boolean; text?: string; error?: string }>
  getLaunchAtStartup: () => Promise<boolean>
  setLaunchAtStartup: (enabled: boolean) => Promise<boolean>
  getAutoClickerStatus: () => Promise<AutoClickerStatus>
  setAutoClickerEnabled: (enabled: boolean) => Promise<AutoClickerStatus>
  onAutoClickerStatusChanged: (callback: (status: AutoClickerStatus) => void) => () => void
}

interface AutoClickerStatus {
  supported: boolean
  enabled: boolean
  clicking: boolean
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FlowPilotAPI
  }
}
