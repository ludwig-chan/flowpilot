import React, { useState, useCallback } from 'react'
import Home from './pages/Home'
import Tutorial from './pages/Tutorial'

import DataRecords from './pages/DataRecords'
import Settings from './pages/Settings'

type Page = 'home' | 'tutorial' | 'data-records' | 'settings'

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
        <div className="sidebar-logo">FlowPilot</div>
        <nav>
          <div
            className={`nav-item ${page === 'home' ? 'active' : ''}`}
            onClick={() => setPage('home')}
          >
            主页
          </div>
          <div
            className={`nav-item ${page === 'tutorial' ? 'active' : ''}`}
            onClick={() => setPage('tutorial')}
          >
            安装教程
          </div>
          <div
            className={`nav-item ${page === 'data-records' ? 'active' : ''}`}
            onClick={() => setPage('data-records')}
          >
            数据
          </div>
          <div
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => setPage('settings')}
          >
            设置
          </div>
        </nav>
      </aside>

      <main className="content">
        {page === 'home' && <Home showToast={showToast} />}
        {page === 'tutorial' && <Tutorial showToast={showToast} />}
        {page === 'data-records' && <DataRecords showToast={showToast} />}
        {page === 'settings' && <Settings showToast={showToast} />}
      </main>

      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}
