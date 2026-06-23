import React from 'react'

export type TimeRangeType = 'today' | '7days' | '30days' | 'custom'

export interface TimeRange {
  type: TimeRangeType
  start?: string
  end?: string
}

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min}`
}

function getTodayRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)
  return { start: formatDateTimeLocal(start), end: formatDateTimeLocal(end) }
}

function getDaysRange(days: number): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)
  return { start: formatDateTimeLocal(start), end: formatDateTimeLocal(end) }
}

/** 将 "YYYY-MM-DD HH:mm" 转为 datetime-local input 需要的 "YYYY-MM-DDTHH:mm" */
function toDateTimeLocalValue(value?: string): string {
  if (!value) return ''
  return value.replace(' ', 'T')
}

/** 将 datetime-local input 的 "YYYY-MM-DDTHH:mm" 转回 "YYYY-MM-DD HH:mm" */
function fromDateTimeLocalValue(value: string): string {
  return value.replace('T', ' ')
}

export default function TimeRangeSelector({
  value,
  onChange,
}: TimeRangeSelectorProps): React.JSX.Element {
  const handleQuickSelect = (type: TimeRangeType): void => {
    if (type === 'today') {
      onChange({ type: 'today', ...getTodayRange() })
    } else if (type === '7days') {
      onChange({ type: '7days', ...getDaysRange(7) })
    } else if (type === '30days') {
      onChange({ type: '30days', ...getDaysRange(30) })
    }
  }

  const handleCustomChange = (field: 'start' | 'end', raw: string): void => {
    onChange({
      type: 'custom',
      start: field === 'start' ? fromDateTimeLocalValue(raw) : value.start,
      end: field === 'end' ? fromDateTimeLocalValue(raw) : value.end,
    })
  }

  const handleClear = (): void => {
    onChange({ type: 'today' })
  }

  const isActive = (type: TimeRangeType): boolean => value.type === type

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input
          className="form-input"
          type="datetime-local"
          value={toDateTimeLocalValue(value.start)}
          onChange={(e) => handleCustomChange('start', e.target.value)}
          style={{ width: 170, fontSize: 13 }}
        />
        <span style={{ color: 'var(--text-muted)' }}>~</span>
        <input
          className="form-input"
          type="datetime-local"
          value={toDateTimeLocalValue(value.end)}
          onChange={(e) => handleCustomChange('end', e.target.value)}
          style={{ width: 170, fontSize: 13 }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <button
          className={`btn btn-sm ${isActive('today') ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleQuickSelect('today')}
        >
          今天
        </button>
        <button
          className={`btn btn-sm ${isActive('7days') ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleQuickSelect('7days')}
        >
          最近7天
        </button>
        <button
          className={`btn btn-sm ${isActive('30days') ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => handleQuickSelect('30days')}
        >
          最近30天
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={handleClear}
        >
          清除
        </button>
      </div>
    </div>
  )
}
