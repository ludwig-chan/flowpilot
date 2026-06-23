import React, { useState, useEffect } from 'react'
import FilterGroup, { type FilterGroupData } from './FilterGroup'
import TimeRangeSelector, { type TimeRange } from './TimeRangeSelector'

export interface FilterState {
  whitelistGroups: FilterGroupData[]
  blacklistGroups: FilterGroupData[]
  timeRange: TimeRange
}

interface FilterPreset {
  id: string
  name: string
  createdAt: string
  filterState: unknown
}

interface AdvancedFilterPanelProps {
  filterState: FilterState
  onChange: (state: FilterState) => void
  onApply: () => void
  onClear: () => void
}

function generateId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export default function AdvancedFilterPanel({
  filterState,
  onChange,
  onApply,
  onClear,
}: AdvancedFilterPanelProps): React.JSX.Element {
  const [presets, setPresets] = useState<FilterPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [showPresetInput, setShowPresetInput] = useState(false)

  const loadPresets = async (): Promise<void> => {
    try {
      const list = await window.api.listFilterPresets()
      setPresets(list)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadPresets()
  }, [])

  const handleAddWhitelistGroup = (): void => {
    const newGroup: FilterGroupData = {
      id: generateId(),
      keywords: [],
      matchMode: 'AND',
    }
    onChange({
      ...filterState,
      whitelistGroups: [...filterState.whitelistGroups, newGroup],
    })
  }

  const handleAddBlacklistGroup = (): void => {
    const newGroup: FilterGroupData = {
      id: generateId(),
      keywords: [],
      matchMode: 'OR',
    }
    onChange({
      ...filterState,
      blacklistGroups: [...filterState.blacklistGroups, newGroup],
    })
  }

  const handleUpdateWhitelistGroup = (index: number, group: FilterGroupData): void => {
    const updated = [...filterState.whitelistGroups]
    updated[index] = group
    onChange({ ...filterState, whitelistGroups: updated })
  }

  const handleUpdateBlacklistGroup = (index: number, group: FilterGroupData): void => {
    const updated = [...filterState.blacklistGroups]
    updated[index] = group
    onChange({ ...filterState, blacklistGroups: updated })
  }

  const handleDeleteWhitelistGroup = (index: number): void => {
    const updated = filterState.whitelistGroups.filter((_, i) => i !== index)
    onChange({ ...filterState, whitelistGroups: updated })
  }

  const handleDeleteBlacklistGroup = (index: number): void => {
    const updated = filterState.blacklistGroups.filter((_, i) => i !== index)
    onChange({ ...filterState, blacklistGroups: updated })
  }

  const handleTimeRangeChange = (timeRange: TimeRange): void => {
    onChange({ ...filterState, timeRange })
  }

  const handleLoadPreset = (presetId: string): void => {
    if (!presetId) return
    const preset = presets.find((p) => p.id === presetId)
    if (!preset) return
    const state = preset.filterState as FilterState
    if (state && state.whitelistGroups && state.blacklistGroups && state.timeRange) {
      onChange(state)
    }
  }

  const handleSavePreset = async (): Promise<void> => {
    const name = presetName.trim()
    if (!name) return
    try {
      await window.api.saveFilterPreset(name, filterState)
      setPresetName('')
      setShowPresetInput(false)
      await loadPresets()
    } catch {
      /* ignore */
    }
  }

  const handleDeletePreset = async (id: string): Promise<void> => {
    try {
      await window.api.deleteFilterPreset(id)
      await loadPresets()
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        marginTop: 12,
        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        ▲ 从"高级筛选"按钮展开
      </div>

      {/* 白名单 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          包含关键字（白名单）
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
            多组条件，组间为 AND 关系（所有组都要满足）
          </span>
        </div>
        {filterState.whitelistGroups.map((group, index) => (
          <FilterGroup
            key={group.id}
            group={group}
            groupIndex={index}
            variant="blue"
            canDelete={filterState.whitelistGroups.length > 1}
            onChange={(g) => handleUpdateWhitelistGroup(index, g)}
            onDelete={() => handleDeleteWhitelistGroup(index)}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleAddWhitelistGroup}
          >
            + 添加新组
          </button>
        </div>
      </div>

      {/* 黑名单 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
          排除关键字（黑名单）
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8, fontWeight: 400 }}>
            多组条件，组间为 OR 关系（任一组命中就排除）
          </span>
        </div>
        {filterState.blacklistGroups.map((group, index) => (
          <FilterGroup
            key={group.id}
            group={group}
            groupIndex={index}
            variant="red"
            canDelete={filterState.blacklistGroups.length > 1}
            onChange={(g) => handleUpdateBlacklistGroup(index, g)}
            onDelete={() => handleDeleteBlacklistGroup(index)}
          />
        ))}
        <div style={{ marginTop: 8 }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={handleAddBlacklistGroup}
          >
            + 添加新组
          </button>
        </div>
      </div>

      {/* 时间范围 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>时间范围</div>
        <TimeRangeSelector
          value={filterState.timeRange}
          onChange={handleTimeRangeChange}
        />
      </div>

      {/* 预设 */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>预设</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="form-select"
            style={{ flex: 1 }}
            value=""
            onChange={(e) => handleLoadPreset(e.target.value)}
          >
            <option value="">选择预设...</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => setShowPresetInput(!showPresetInput)}
          >
            保存为预设
          </button>
        </div>
        {/* 预设列表（可删除） */}
        {presets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {presets.map((preset) => (
              <span
                key={preset.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 500,
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  cursor: 'default',
                }}
              >
                <span
                  onClick={() => handleLoadPreset(preset.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {preset.name}
                </span>
                <span
                  onClick={() => void handleDeletePreset(preset.id)}
                  style={{ cursor: 'pointer', fontSize: 10, opacity: 0.7, marginLeft: 2, color: 'var(--red)' }}
                >
                  ×
                </span>
              </span>
            ))}
          </div>
        )}
        {showPresetInput && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              className="form-input"
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleSavePreset() }}
              placeholder="输入预设名称"
              style={{ flex: 1 }}
            />
            <button className="btn btn-sm btn-primary" onClick={() => void handleSavePreset()}>
              保存
            </button>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setShowPresetInput(false)
                setPresetName('')
              }}
            >
              取消
            </button>
          </div>
        )}
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn btn-secondary" onClick={onClear}>
          清除筛选
        </button>
        <button className="btn btn-primary" onClick={onApply}>
          应用
        </button>
      </div>
    </div>
  )
}
