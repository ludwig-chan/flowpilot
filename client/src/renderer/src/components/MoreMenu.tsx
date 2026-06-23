import React, { useState, useRef, useEffect } from 'react'

interface MoreMenuProps {
  onTagRecords?: () => void
  onBatchDelete?: () => void
  disabled?: boolean
}

export default function MoreMenu({
  onTagRecords,
  onBatchDelete,
  disabled = false,
}: MoreMenuProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleMenuItemClick = (action?: () => void): void => {
    setIsOpen(false)
    if (action) action()
  }

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        className="btn btn-secondary"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
      >
        更多 ▼
      </button>
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            minWidth: 140,
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {onTagRecords && (
            <div
              onClick={() => handleMenuItemClick(onTagRecords)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              打标签
            </div>
          )}
          {onBatchDelete && (
            <div
              onClick={() => handleMenuItemClick(onBatchDelete)}
              style={{
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'background 0.15s',
                borderTop: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              批量删除
            </div>
          )}
        </div>
      )}
    </div>
  )
}
