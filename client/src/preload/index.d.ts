import { ElectronAPI } from '@electron-toolkit/preload'

interface AppConfig {
  extensionDir: string
  extensionHash: string
  lastUpdatedAt: string
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FlowPilotAPI
  }
}
