import React, { useState, useEffect } from 'react'

interface HomeProps {
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function Home(_props: HomeProps): React.JSX.Element {
  const [currentVersion, setCurrentVersion] = useState('')
  const [extensionDir, setExtensionDir] = useState('')

  useEffect(() => {
    window.api.getConfig().then((cfg) => {
      setCurrentVersion(cfg.currentVersion)
      setExtensionDir(cfg.extensionDir)
    })
  }, [])

  return (
    <>
      <div className="page-title">主页</div>

      {/* 版本状态卡片 */}
      <div className="card">
        <div className="card-title">版本状态</div>
        <div className="version-row">
          <div className="version-badges">
            <div className="version-badge">
              <span className="label">当前版本</span>
              <span className="value">{currentVersion || '—'}</span>
            </div>
          </div>
        </div>

        <div className="btn-group" style={{ marginTop: 16 }}>
          {extensionDir && (
            <button
              className="btn btn-secondary"
              onClick={() => window.api.openInExplorer(extensionDir)}
            >
              📂 打开插件目录
            </button>
          )}
        </div>
      </div>
    </>
  )
}
