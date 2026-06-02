import React, { useState, useEffect } from 'react'

interface TutorialProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

interface BrowserOption {
  name: string
  url: string
}

const BROWSER_OPTIONS: BrowserOption[] = [
  { name: 'Google Chrome', url: 'chrome://extensions' },
  { name: 'Microsoft Edge', url: 'edge://extensions' },
  { name: 'Firefox', url: 'about:addons' },
  { name: '360 安全浏览器', url: 'se://extensions' },
  { name: '360 极速浏览器', url: 'chrome://extensions' },
  { name: 'QQ 浏览器', url: 'qqbrowser://extensions/manage' },
  { name: '搜狗浏览器', url: 'chrome://extensions' },
  { name: '2345 加速浏览器', url: 'chrome://extensions' },
  { name: '猎豹浏览器', url: 'chrome://extensions' },
  { name: '其他 Chromium 内核浏览器', url: 'chrome://extensions' }
]

export default function Tutorial({ showToast }: TutorialProps): React.JSX.Element {
  const [extensionDir, setExtensionDir] = useState('')
  const [selectedBrowser, setSelectedBrowser] = useState<BrowserOption>(BROWSER_OPTIONS[0])

  useEffect(() => {
    window.api.getConfig().then((cfg) => setExtensionDir(cfg.extensionDir))
  }, [])

  const copyPath = async (): Promise<void> => {
    if (!extensionDir) return
    await navigator.clipboard.writeText(extensionDir)
    showToast('路径已复制到剪贴板', 'success')
  }

  const copyExtUrl = async (): Promise<void> => {
    await navigator.clipboard.writeText(selectedBrowser.url)
    showToast('地址已复制到剪贴板', 'success')
  }

  return (
    <div>
      <h1 className="page-title">安装教程</h1>

      {/* 安装步骤 */}
      <div className="card">
        <div className="card-title">📋 首次安装步骤</div>
        <div className="step-list">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">打开浏览器扩展管理页</div>
              <p>选择您使用的浏览器，将地址复制后粘贴到浏览器地址栏并回车：</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                <select
                  value={selectedBrowser.name}
                  onChange={(e) => {
                    const found = BROWSER_OPTIONS.find((b) => b.name === e.target.value)
                    if (found) setSelectedBrowser(found)
                  }}
                  className="form-input"
                  style={{ flex: 1, maxWidth: 240 }}
                >
                  {BROWSER_OPTIONS.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="path-text" style={{ flex: 1 }}>
                  {selectedBrowser.url}
                </span>
                <button onClick={copyExtUrl} className="btn btn-sm btn-secondary">
                  复制地址
                </button>
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">2</div>
            <div className="step-content">
              <div className="step-title">开启开发者模式</div>
              <p>
                在扩展管理页面<strong>右上角</strong>
                找到"开发者模式"开关，将其打开（蓝色代表已开启）。
              </p>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">3</div>
            <div className="step-content">
              <div className="step-title">加载已解压的扩展程序</div>
              <p>
                开发者模式开启后，左上角会出现"
                <strong>加载已解压的扩展程序</strong>"按钮，点击它。
              </p>
              <p>在弹出的文件夹选择框中，选择以下路径：</p>
              <div className="path-row" style={{ marginTop: 8 }}>
                <span className="path-hint" style={{ flex: 1 }}>
                  {extensionDir || '（插件路径未配置）'}
                </span>
                {extensionDir && (
                  <button onClick={copyPath} className="btn btn-sm btn-secondary">
                    复制路径
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="step-item">
            <div className="step-number">4</div>
            <div className="step-content">
              <div className="step-title">确认安装成功</div>
              <p>插件卡片出现在扩展列表中，浏览器右上角出现 FlowPilot 图标，即表示安装成功。</p>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
