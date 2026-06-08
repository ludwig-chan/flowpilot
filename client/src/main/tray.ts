import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron'
import * as path from 'path'
import { is } from '@electron-toolkit/utils'
import type { AutoClickerStatus } from './autoClicker'

let tray: Tray | null = null
let autoClickerStatus: AutoClickerStatus = {
  supported: process.platform === 'win32',
  enabled: false,
  clicking: false
}
let toggleAutoClicker: (() => void) | null = null

export function createTray(mainWindow: BrowserWindow, onToggleAutoClicker?: () => void): Tray {
  const iconPath = is.dev
    ? path.join(process.cwd(), 'resources', 'icon.png')
    : path.join(process.resourcesPath, 'icon.png')

  let icon = nativeImage.createEmpty()
  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) icon = nativeImage.createEmpty()
  } catch {
    // Empty icon fallback.
  }

  tray = new Tray(icon)
  toggleAutoClicker = onToggleAutoClicker ?? null
  tray.setToolTip('FlowPilot Client')
  updateTrayMenu(mainWindow)

  tray.on('double-click', () => {
    showMainWindow(mainWindow)
  })

  return tray
}

function showMainWindow(mainWindow: BrowserWindow): void {
  if (mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function updateTrayMenu(mainWindow: BrowserWindow): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    {
      label: '打开 FlowPilot',
      click: () => showMainWindow(mainWindow)
    },
    {
      label: autoClickerStatus.enabled ? '关闭桌面长按连点' : '开启桌面长按连点',
      enabled: autoClickerStatus.supported,
      type: 'checkbox',
      checked: autoClickerStatus.enabled,
      click: () => toggleAutoClicker?.()
    },
    {
      label: autoClickerStatus.clicking ? '连点中：按 Esc 停止' : '连点状态：空闲',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit()
    }
  ])
  tray.setContextMenu(menu)
}

export function setTrayAutoClickerStatus(
  mainWindow: BrowserWindow,
  status: AutoClickerStatus
): void {
  autoClickerStatus = status
  updateTrayMenu(mainWindow)
}

export function getTray(): Tray | null {
  return tray
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
