import React, { useState, useEffect } from 'react'

interface BrowserInfo {
  id: string
  name: string
  exePath: string
}

interface TutorialProps {
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void
}

const EXT_PAGE_URLS: Record<string, string> = {
  chrome: 'chrome://extensions',
  edge: 'edge://extensions'
}

export default function Tutorial({ showToast }: TutorialProps): React.JSX.Element {
  const [extensionDir, setExtensionDir] = useState('')
  const [browsers, setBrowsers] = useState<BrowserInfo[]>([])

  useEffect(() => {
    window.api.getConfig().then((cfg) => setExtensionDir(cfg.extensionDir))
    window.api.detectBrowsers().then(setBrowsers)
  }, [])

  const copyPath = async (): Promise<void> => {
    if (!extensionDir) return
    await navigator.clipboard.writeText(extensionDir)
    showToast('路径已复制到剪贴板', 'success')
  }

  const copyExtUrl = async (url: string): Promise<void> => {
    await navigator.clipboard.writeText(url)
    showToast('地址已复制到剪贴板', 'success')
  }

  const openExtPage = async (browser: BrowserInfo): Promise<void> => {
    const result = await window.api.openBrowserExtPage(browser.id)
    if (!result.success) showToast(result.error || '打开失败', 'error')
  }

  return (
    <div>
      <h1 className="page-title">安装教程</h1>

      {/* 插件位置 */}
      <div className="card">
        <div className="card-title">📁 插件文件位置</div>
        <p className="card-desc">以下路径是插件在您电脑上的位置，后续步骤需要用到：</p>
        <div className="path-row">
          <span className="path-text">{extensionDir || '未配置，请前往设置页面配置'}</span>
          {extensionDir && (
            <>
              <button
                onClick={() => window.api.openInExplorer(extensionDir)}
                className="btn btn-sm btn-secondary"
              >
                打开文件夹
              </button>
              <button onClick={copyPath} className="btn btn-sm btn-secondary">
                复制路径
              </button>
            </>
          )}
        </div>
      </div>

      {/* 安装步骤 */}
      <div className="card">
        <div className="card-title">📋 首次安装步骤</div>
        <div className="step-list">
          <div className="step-item">
            <div className="step-number">1</div>
            <div className="step-content">
              <div className="step-title">打开浏览器扩展管理页</div>
              <p>点击下方按钮，浏览器将自动跳转到扩展管理页面：</p>
              <div className="browser-buttons">
                {browsers.length === 0 ? (
                  <div className="text-muted tut-small">
                    <p>未检测到 Chrome 或 Edge，请手动在浏览器地址栏粘贴以下地址：</p>
                    {Object.entries(EXT_PAGE_URLS).map(([, url]) => (
                      <div key={url} className="path-row" style={{ marginTop: 6 }}>
                        <span className="path-text">{url}</span>
                        <button
                          onClick={() => copyExtUrl(url)}
                          className="btn btn-sm btn-secondary"
                        >
                          复制地址
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  browsers.map((b) => (
                    <div key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button onClick={() => openExtPage(b)} className="btn btn-primary">
                        打开 {b.name} 扩展页
                      </button>
                      <button
                        onClick={() => copyExtUrl(EXT_PAGE_URLS[b.id] ?? '')}
                        className="btn btn-sm btn-secondary"
                      >
                        复制地址
                      </button>
                    </div>
                  ))
                )}
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
