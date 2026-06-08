import { Menu, app } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

export interface AutoClickerStatus {
  supported: boolean
  enabled: boolean
  clicking: boolean
}

interface AutoClickerOptions {
  getEnabled: () => boolean
  setEnabled: (enabled: boolean) => void
  onStatusChange?: (status: AutoClickerStatus) => void
}

const HELPER_RELATIVE_PATH = join('autoclicker', 'FlowPilotAutoClicker.ps1')
const CLICK_INTERVALS = [200, 500, 1000] as const

export class AutoClickerService {
  private readonly getEnabledConfig: () => boolean
  private readonly setEnabledConfig: (enabled: boolean) => void
  private readonly onStatusChange?: (status: AutoClickerStatus) => void
  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = ''
  private enabled = false
  private clicking = false

  constructor(options: AutoClickerOptions) {
    this.getEnabledConfig = options.getEnabled
    this.setEnabledConfig = options.setEnabled
    this.onStatusChange = options.onStatusChange
    this.enabled = this.isSupported() && this.getEnabledConfig()
  }

  isSupported(): boolean {
    return process.platform === 'win32'
  }

  getStatus(): AutoClickerStatus {
    return {
      supported: this.isSupported(),
      enabled: this.enabled,
      clicking: this.clicking
    }
  }

  startFromConfig(): void {
    if (this.enabled) this.startHelper()
    this.emitStatus()
  }

  setEnabled(enabled: boolean): AutoClickerStatus {
    if (!this.isSupported()) {
      this.enabled = false
      this.setEnabledConfig(false)
      this.emitStatus()
      return this.getStatus()
    }

    this.enabled = enabled
    this.setEnabledConfig(enabled)

    if (enabled) {
      this.startHelper()
    } else {
      this.stopClicking()
      this.stopHelper()
    }

    this.emitStatus()
    return this.getStatus()
  }

  toggle(): AutoClickerStatus {
    return this.setEnabled(!this.enabled)
  }

  stopClicking(): void {
    this.sendCommand('STOP')
    if (this.clicking) {
      this.clicking = false
      this.emitStatus()
    }
  }

  dispose(): void {
    this.stopClicking()
    this.stopHelper()
  }

  private startHelper(): void {
    if (!this.enabled || !this.isSupported() || this.child) return

    const helperPath = this.resolveHelperPath()
    if (!existsSync(helperPath)) {
      console.warn('[AutoClicker] helper not found:', helperPath)
      return
    }

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      helperPath
    ], {
      windowsHide: true,
      stdio: 'pipe'
    })

    this.child = child

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.handleStdout(chunk))

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      const text = chunk.trim()
      if (text) console.warn('[AutoClicker]', text)
    })

    child.on('exit', () => {
      this.child = null
      this.stdoutBuffer = ''
      if (this.clicking) {
        this.clicking = false
        this.emitStatus()
      }
      if (this.enabled && !(app as typeof app & { isQuitting?: boolean }).isQuitting) {
        setTimeout(() => this.startHelper(), 1000)
      }
    })
  }

  private stopHelper(): void {
    const child = this.child
    if (!child) return
    this.sendCommand('EXIT')
    this.child = null
    setTimeout(() => {
      if (!child.killed) child.kill()
    }, 500)
  }

  private sendCommand(command: string): void {
    if (!this.child || this.child.stdin.destroyed) return
    this.child.stdin.write(`${command}\n`)
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newlineIndex = this.stdoutBuffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = this.stdoutBuffer.slice(0, newlineIndex).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1)
      if (line) this.handleHelperLine(line)
      newlineIndex = this.stdoutBuffer.indexOf('\n')
    }
  }

  private handleHelperLine(line: string): void {
    const [event, xRaw, yRaw] = line.split(/\s+/)

    if (event === 'LONG_PRESS') {
      const x = Number(xRaw)
      const y = Number(yRaw)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        this.showClickMenu(Math.round(x), Math.round(y))
      }
      return
    }

    if (event === 'CLICKING_STARTED') {
      this.clicking = true
      this.emitStatus()
      return
    }

    if (event === 'CLICKING_STOPPED') {
      this.clicking = false
      this.emitStatus()
    }
  }

  private showClickMenu(x: number, y: number): void {
    if (!this.enabled) return

    const menu = Menu.buildFromTemplate([
      ...CLICK_INTERVALS.map((interval) => ({
        label: `每 ${interval}ms 点击`,
        click: (): void => {
          this.stopClicking()
          this.sendCommand(`START ${x} ${y} ${interval}`)
        }
      })),
      { type: 'separator' as const },
      { label: '取消' }
    ])

    menu.popup()
  }

  private resolveHelperPath(): string {
    return is.dev
      ? join(process.cwd(), 'resources', HELPER_RELATIVE_PATH)
      : join(process.resourcesPath, HELPER_RELATIVE_PATH)
  }

  private emitStatus(): void {
    this.onStatusChange?.(this.getStatus())
  }
}
