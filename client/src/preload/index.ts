import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('save-config', config),
  openDirDialog: () => ipcRenderer.invoke('open-dir-dialog'),
  openInExplorer: (dirPath: string) => ipcRenderer.invoke('open-in-explorer', dirPath),
  detectBrowsers: () => ipcRenderer.invoke('detect-browsers'),
  openBrowserExtPage: (browserId: string) => ipcRenderer.invoke('open-browser-ext-page', browserId),
  loadExtensionAuto: (browserId: string) => ipcRenderer.invoke('load-extension-auto', browserId),
  ocrImage: (dataUrl: string) => ipcRenderer.invoke('ocr-image', dataUrl),
  ocrScreenshot: (id: string) => ipcRenderer.invoke('ocr-screenshot', id),
  ocrScreenshotsBatch: (ids?: string[]) => ipcRenderer.invoke('ocr-screenshots-batch', ids),
  getLaunchAtStartup: () => ipcRenderer.invoke('get-launch-at-startup'),
  setLaunchAtStartup: (enabled: boolean) => ipcRenderer.invoke('set-launch-at-startup', enabled),
  getAutoClickerStatus: () => ipcRenderer.invoke('get-auto-clicker-status'),
  setAutoClickerEnabled: (enabled: boolean) => ipcRenderer.invoke('set-auto-clicker-enabled', enabled),
  listScreenshots: () => ipcRenderer.invoke('list-screenshots'),
  getScreenshotImage: (id: string) => ipcRenderer.invoke('get-screenshot-image', id),
  createScreenshotTag: (name: string) => ipcRenderer.invoke('create-screenshot-tag', name),
  updateScreenshotTags: (id: string, tagIds: string[]) =>
    ipcRenderer.invoke('update-screenshot-tags', id, tagIds),
  trashScreenshot: (id: string) => ipcRenderer.invoke('trash-screenshot', id),
  restoreScreenshot: (id: string) => ipcRenderer.invoke('restore-screenshot', id),
  deleteScreenshotPermanently: (id: string) =>
    ipcRenderer.invoke('delete-screenshot-permanently', id),
  openScreenshotInExplorer: (id: string) => ipcRenderer.invoke('open-screenshot-in-explorer', id),
  listDataRecords: () => ipcRenderer.invoke('list-data-records'),
  createDataRecordTag: (name: string) => ipcRenderer.invoke('create-data-record-tag', name),
  updateDataRecordTags: (id: string, tagIds: string[]) =>
    ipcRenderer.invoke('update-data-record-tags', id, tagIds),
  trashDataRecord: (id: string) => ipcRenderer.invoke('trash-data-record', id),
  restoreDataRecord: (id: string) => ipcRenderer.invoke('restore-data-record', id),
  deleteDataRecordPermanently: (id: string) =>
    ipcRenderer.invoke('delete-data-record-permanently', id),
  listFilterPresets: () => ipcRenderer.invoke('list-filter-presets'),
  saveFilterPreset: (name: string, filterState: unknown) =>
    ipcRenderer.invoke('save-filter-preset', name, filterState),
  deleteFilterPreset: (id: string) => ipcRenderer.invoke('delete-filter-preset', id),
  onScreenshotsUpdated: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('screenshots-updated', listener)
    return () => ipcRenderer.removeListener('screenshots-updated', listener)
  },
  onAutoClickerStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown): void => callback(status)
    ipcRenderer.on('auto-clicker-status-changed', listener)
    return () => ipcRenderer.removeListener('auto-clicker-status-changed', listener)
  },
  onDataRecordsUpdated: (callback: () => void) => {
    const listener = (): void => callback()
    ipcRenderer.on('data-records-updated', listener)
    return () => ipcRenderer.removeListener('data-records-updated', listener)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
