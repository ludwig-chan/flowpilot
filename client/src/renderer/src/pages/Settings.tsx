import React, { useState, useEffect } from 'react'

interface AppConfig {
  extensionDir: string
  extensionHash: string
  lastUpdatedAt: string
  currentVersion: string
}

interface SettingsProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function Settings({ showToast }: SettingsProps): React.JSX.Element {
  const [config, setConfig] = useState<AppConfig>({
    extensionDir: '',
    extensionHash: '',
    lastUpdatedAt: '',
    currentVersion: 'v0.0.0'
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.api.getConfig().then(setConfig)
  }, [])

  const handleBrowse = async (): Promise<void> => {
    const dir = await window.api.openDirDialog()
    if (dir) setConfig((prev) => ({ ...prev, extensionDir: dir }))
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
              placeholder="例：C:\FlowPilot\extension"
            />
            <button className="btn btn-secondary" onClick={handleBrowse}>
              浏览…
            </button>
            {config.extensionDir && (
              <button
                className="btn btn-secondary"
                onClick={() => window.api.openInExplorer(config.extensionDir)}
              >
                📂
              </button>
            )}
          </div>
          <div className="form-hint">
            浏览器加载插件时，直接指向此目录（解压目录，包含 manifest.json）
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">版本信息</div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">当前插件版本</label>
          <div
            className="form-input"
            style={{ maxWidth: 160, background: 'var(--bg-secondary, #f5f5f5)', cursor: 'default', userSelect: 'text' }}
          >
            {config.currentVersion}
          </div>
          <div className="form-hint">自动从插件目录的 manifest.json 读取</div>
        </div>
      </div>

      <div className="save-row">
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? '保存中…' : '保存设置'}
        </button>
      </div>
    </>
  )
}
