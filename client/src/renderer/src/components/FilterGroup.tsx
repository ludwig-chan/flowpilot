import React from 'react'
import KeywordTagInput from './KeywordTagInput'

export type MatchMode = 'AND' | 'OR'

export interface FilterGroupData {
  id: string
  keywords: string[]
  matchMode: MatchMode
}

interface FilterGroupProps {
  group: FilterGroupData
  groupIndex: number
  variant?: 'blue' | 'red'
  canDelete?: boolean
  onChange: (group: FilterGroupData) => void
  onDelete?: () => void
}

export default function FilterGroup({
  group,
  groupIndex,
  variant = 'blue',
  canDelete = true,
  onChange,
  onDelete,
}: FilterGroupProps): React.JSX.Element {
  const labelColor = variant === 'blue' ? 'var(--primary)' : 'var(--warning)'
  const label = variant === 'blue' ? `第 ${groupIndex + 1} 组` : `第 ${groupIndex + 1} 组`

  const handleKeywordsChange = (keywords: string[]): void => {
    onChange({ ...group, keywords })
  }

  const handleMatchModeChange = (mode: MatchMode): void => {
    onChange({ ...group, matchMode: mode })
  }

  return (
    <div
      style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: 12,
        marginTop: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, color: labelColor, fontWeight: 600 }}>{label}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name={`matchMode-${group.id}`}
                checked={group.matchMode === 'AND'}
                onChange={() => handleMatchModeChange('AND')}
                style={{ accentColor: 'var(--primary)' }}
              />
              AND（都要有）
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name={`matchMode-${group.id}`}
                checked={group.matchMode === 'OR'}
                onChange={() => handleMatchModeChange('OR')}
                style={{ accentColor: 'var(--primary)' }}
              />
              OR（有一个就行）
            </label>
          </div>
          {canDelete && onDelete && (
            <span
              onClick={onDelete}
              style={{ cursor: 'pointer', color: 'var(--danger)', fontSize: 12, marginLeft: 8 }}
            >
              删除此组
            </span>
          )}
        </div>
      </div>
      <KeywordTagInput
        keywords={group.keywords}
        onChange={handleKeywordsChange}
        placeholder="输入关键字，回车添加"
        variant={variant}
      />
    </div>
  )
}
