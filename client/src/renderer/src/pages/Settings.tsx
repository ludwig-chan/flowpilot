import React, { useState, useEffect } from 'react'

interface AppConfig {
  extensionDir: string
  extensionHash: string
  lastUpdatedAt: string
  screenshotDir?: string
  launchAtStartup?: boolean
  autoClickerEnabled?: boolean
  currentVersion: string
}

interface AutoClickerStatus {
  supported: boolean
  enabled: boolean
  clicking: boolean
}

const AUTO_CLICKER_VISIBLE = false

interface SettingsProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function Settings({ showToast }: SettingsProps): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig>({
    extensionDir: '',
    extensionHash: '',
    lastUpdatedAt: '',
    screenshotDir: '',
    launchAtStartup: false,
    autoClickerEnabled: false,
    currentVersion: 'v0.0.0'
  })
  const [saving, setSaving] = useState(false)
  const [togglingStartup, setTogglingStartup] = useState(false)
  const [togglingAutoClicker, setTogglingAutoClicker] = useState(false)
  const [autoClickerStatus, setAutoClickerStatus] = useState<AutoClickerStatus>({
    supported: false,
    enabled: false,
    clicking: false
  })

  useEffect(() => {
    window.api.getConfig().then((cfg) => setConfig(cfg))
    window.api.getLaunchAtStartup().then((val: boolean) =>
      setConfig((prev) => ({ ...prev, launchAtStartup: val }))
    )
    window.api.getAutoClickerStatus().then((status: AutoClickerStatus) => {
      setAutoClickerStatus(status)
      setConfig((prev) => ({ ...prev, autoClickerEnabled: status.enabled }))
    })
    const unsubscribe = window.api.onAutoClickerStatusChanged((status: AutoClickerStatus) => {
      setAutoClickerStatus(status)
      setConfig((prev) => ({ ...prev, autoClickerEnabled: status.enabled }))
    })
    return unsubscribe
  }, [])

  const handleBrowse = async (): Promise<void> => {
    const dir = await window.api.openDirDialog()
    if (dir) setConfig((prev) => ({ ...prev, extensionDir: dir }))
  }

  const handleBrowseScreenshot = async (): Promise<void> => {
    const dir = await window.api.openDirDialog()
    if (dir) setConfig((prev) => ({ ...prev, screenshotDir: dir }))
  }

  const handleToggleLaunchAtStartup = async (): Promise<void> => {
    setTogglingStartup(true)
    try {
      const next = !config.launchAtStartup
      await window.api.setLaunchAtStartup(next)
      setConfig((prev) => ({ ...prev, launchAtStartup: next }))
      showToast(next ? '已开启开机自启动' : '已关闭开机自启动', 'success')
    } catch {
      showToast('操作失败', 'error')
    } finally {
      setTogglingStartup(false)
    }
  }

  const handleToggleAutoClicker = async (): Promise<void> => {
    if (!autoClickerStatus.supported) {
      showToast('桌面长按连点仅支持 Windows', 'error')
      return
    }

    setTogglingAutoClicker(true)
    try {
      const next = !autoClickerStatus.enabled
      const status = await window.api.setAutoClickerEnabled(next)
      setAutoClickerStatus(status)
      setConfig((prev) => ({ ...prev, autoClickerEnabled: status.enabled }))
      showToast(status.enabled ? '已开启桌面长按连点' : '已关闭桌面长按连点', 'success')
    } catch {
      showToast('操作失败', 'error')
    } finally {
      setTogglingAutoClicker(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!config.extensionDir.trim()) {
      showToast('请先设置插件安装目录', 'error')
      return
    }
    setSaving(true)
    try {
      await window.api.saveConfig(config)
      showToast('设置已保存', 'success')
    } catch {
      showToast('保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="page-title">设置</div>

      <div className="card">
        <div className="card-title">插件目录</div>

        <div className="form-group">
          <label className="form-label">插件安装目录</label>
          <div className="input-row">
            <input
              className="form-input"
              type="text"
              value={config.extensionDir}
              onChange={(e) => setConfig((prev) => ({ ...prev, extensionDir: e.target.value }))}
              placeholder={'例如：C:\\FlowPilot\\extension'}
            />
            <button className="btn btn-secondary" onClick={handleBrowse}>
              浏览...
            </button>
            {config.extensionDir && (
              <button
                className="btn btn-secondary"
                onClick={() => window.api.openInExplorer(config.extensionDir)}
              >
                打开
              </button>
            )}
          </div>
          <div className="form-hint">
            浏览器加载插件时，直接指向此目录，目录内应包含 manifest.json。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">版本信息</div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">当前客户端版本</label>
          <div
            className="form-input"
            style={{
              maxWidth: 160,
              background: 'var(--bg-secondary, #f5f5f5)',
              cursor: 'default',
              userSelect: 'text'
            }}
          >
            {config.currentVersion}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">截图保存目录</div>
        <div className="form-group">
          <label className="form-label">保存路径</label>
          <div className="input-row">
            <input
              className="form-input"
              type="text"
              value={config.screenshotDir ?? ''}
              readOnly
              style={{ cursor: 'default' }}
            />
            <button className="btn btn-secondary" onClick={handleBrowseScreenshot}>
              浏览...
            </button>
            {config.screenshotDir && (
              <button
                className="btn btn-secondary"
                onClick={() => window.api.openInExplorer(config.screenshotDir!)}
              >
                打开
              </button>
            )}
          </div>
          <div className="form-hint">
            元素截图会保存到此目录，需要 FlowPilot 客户端保持运行。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">系统</div>
        <div className="form-group">
          <div className="input-row" style={{ alignItems: 'center', gap: 12 }}>
            <label className="form-label" style={{ marginBottom: 0, flex: 1 }}>
              开机自启动
              <div className="form-hint" style={{ marginTop: 2 }}>
                电脑开机后自动在后台运行客户端，托盘图标可见。
              </div>
            </label>
            <button
              className={`btn ${config.launchAtStartup ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleToggleLaunchAtStartup}
              disabled={togglingStartup}
              style={{ minWidth: 72, flexShrink: 0 }}
            >
              {config.launchAtStartup ? '已开启' : '已关闭'}
            </button>
          </div>
        </div>

        {AUTO_CLICKER_VISIBLE && (
          <div className="form-group" style={{ marginBottom: 0 }}>
            <div className="input-row" style={{ alignItems: 'center', gap: 12 }}>
              <label className="form-label" style={{ marginBottom: 0, flex: 1 }}>
                桌面长按连点
                <div className="form-hint" style={{ marginTop: 2 }}>
                  开启后，在任意 Windows 桌面位置左键长按 1200ms，可选择 200/500/1000ms 连续点击；按 Esc 停止。
                </div>
                <div className="form-hint" style={{ marginTop: 2 }}>
                  {autoClickerStatus.supported
                    ? autoClickerStatus.clicking
                      ? '当前状态：连点中'
                      : '当前状态：空闲'
                    : '当前系统暂不支持'}
                </div>
              </label>
              <button
                className={`btn ${autoClickerStatus.enabled ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleToggleAutoClicker}
                disabled={togglingAutoClicker || !autoClickerStatus.supported}
                style={{ minWidth: 72, flexShrink: 0 }}
              >
                {autoClickerStatus.enabled ? '已开启' : '已关闭'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="save-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </>
  )
}
