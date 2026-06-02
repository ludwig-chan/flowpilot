import React, { useState, useEffect } from 'react'

interface HomeProps {
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export default function Home(_props: HomeProps): React.JSX.Element {
  const [currentVersion, setCurrentVersion] = useState('')
  const [lastUpdatedAt, setLastUpdatedAt]   = useState('')

  useEffect(() => {
    window.api.getConfig().then((cfg) => {
      setCurrentVersion(cfg.currentVersion)
      setLastUpdatedAt(cfg.lastUpdatedAt ?? '')
    })
  }, [])

  const updatedAtText = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString('zh-CN')
    : '—'

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
            <div className="version-badge">
              <span className="label">插件更新</span>
              <span className="value">{updatedAtText}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
