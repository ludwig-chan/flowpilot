import React, { useState, useCallback } from 'react'
import Home from './pages/Home'
import Tutorial from './pages/Tutorial'
import Usage from './pages/Usage'

type Page = 'home' | 'tutorial' | 'usage'

interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

export default function App(): React.JSX.Element {
  const [page, setPage] = useState<Page>('home')
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Date.now()
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000)
  }, [])

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">F</div>
          FlowPilot
        </div>
        <nav>
          <div
            className={`nav-item ${page === 'home' ? 'active' : ''}`}
            onClick={() => setPage('home')}
          >
            <span className="nav-icon">🏠</span> 主页
          </div>
          <div
            className={`nav-item ${page === 'tutorial' ? 'active' : ''}`}
            onClick={() => setPage('tutorial')}
          >
            <span className="nav-icon">📖</span> 安装教程
          </div>
          <div
            className={`nav-item ${page === 'usage' ? 'active' : ''}`}
            onClick={() => setPage('usage')}
          >
            <span className="nav-icon">🎓</span> 使用教程
          </div>
        </nav>
      </aside>

      <main className="content">
        {page === 'home' && <Home showToast={showToast} />}
        {page === 'tutorial' && <Tutorial showToast={showToast} />}
        {page === 'usage' && <Usage />}
      </main>

      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

