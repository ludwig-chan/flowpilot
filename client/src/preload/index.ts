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
  getLaunchAtStartup: () => ipcRenderer.invoke('get-launch-at-startup'),
  setLaunchAtStartup: (enabled: boolean) => ipcRenderer.invoke('set-launch-at-startup', enabled),
  getAutoClickerStatus: () => ipcRenderer.invoke('get-auto-clicker-status'),
  setAutoClickerEnabled: (enabled: boolean) => ipcRenderer.invoke('set-auto-clicker-enabled', enabled),
  onAutoClickerStatusChanged: (callback: (status: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: unknown): void => callback(status)
    ipcRenderer.on('auto-clicker-status-changed', listener)
    return () => ipcRenderer.removeListener('auto-clicker-status-changed', listener)
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
