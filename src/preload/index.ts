import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config: unknown) => ipcRenderer.invoke('save-config', config),
  openDirDialog: () => ipcRenderer.invoke('open-dir-dialog'),
  openInExplorer: (dirPath: string) => ipcRenderer.invoke('open-in-explorer', dirPath),
  detectBrowsers: () => ipcRenderer.invoke('detect-browsers'),
  openBrowserExtPage: (browserId: string) => ipcRenderer.invoke('open-browser-ext-page', browserId),
  loadExtensionAuto: (browserId: string) => ipcRenderer.invoke('load-extension-auto', browserId)
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
