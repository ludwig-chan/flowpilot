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

type ScreenshotStatus = 'active' | 'trash'

interface ScreenshotRun {
  id: string
  startedAt: string
  flowId?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

interface ScreenshotTag {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

interface ScreenshotItem {
  id: string
  filename: string
  relativePath: string
  status: ScreenshotStatus
  runId: string
  createdAt: string
  size: number
  tagIds: string[]
  deletedAt?: string
  run?: ScreenshotRun
  tags: ScreenshotTag[]
  thumbnailDataUrl: string
}

interface ScreenshotListResult {
  screenshots: ScreenshotItem[]
  runs: ScreenshotRun[]
  tags: ScreenshotTag[]
  screenshotDir: string
  trashDir: string
}

interface ScreenshotImageResult {
  id: string
  filename: string
  dataUrl: string
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
  listScreenshots: () => Promise<ScreenshotListResult>
  getScreenshotImage: (id: string) => Promise<ScreenshotImageResult | null>
  createScreenshotTag: (name: string) => Promise<ScreenshotTag>
  updateScreenshotTags: (id: string, tagIds: string[]) => Promise<ScreenshotItem>
  trashScreenshot: (id: string) => Promise<boolean>
  restoreScreenshot: (id: string) => Promise<boolean>
  deleteScreenshotPermanently: (id: string) => Promise<boolean>
  openScreenshotInExplorer: (id: string) => Promise<boolean>
  onScreenshotsUpdated: (callback: () => void) => () => void
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
