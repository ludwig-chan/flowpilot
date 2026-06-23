import React, { useState } from 'react'
import SearchInput from './SearchInput'
import MoreMenu from './MoreMenu'
import AdvancedFilterPanel, { type FilterState } from './AdvancedFilterPanel'

interface Tag {
  id: string
  name: string
}

interface FilterToolbarProps {
  tags: Tag[]
  tagFilter: string
  searchKeyword: string
  filterState: FilterState
  onTagFilterChange: (tagId: string) => void
  onSearchChange: (keyword: string) => void
  onFilterStateChange: (state: FilterState) => void
  onApplyFilter: () => void
  onClearFilter: () => void
  onRefresh: () => void
  onTagRecords?: () => void
  onBatchDelete?: () => void
  selectedCount?: number
}

function generateId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export default function FilterToolbar({
  tags,
  tagFilter,
  searchKeyword,
  filterState,
  onTagFilterChange,
  onSearchChange,
  onFilterStateChange,
  onApplyFilter,
  onClearFilter,
  onRefresh,
  onTagRecords,
  onBatchDelete,
  selectedCount = 0,
}: FilterToolbarProps): React.JSX.Element {
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false)

  const handleClearFilter = (): void => {
    const defaultState: FilterState = {
      whitelistGroups: [{ id: generateId(), keywords: [], matchMode: 'AND' }],
      blacklistGroups: [{ id: generateId(), keywords: [], matchMode: 'OR' }],
      timeRange: { type: 'today' },
    }
    onFilterStateChange(defaultState)
    onClearFilter()
  }

  return (
    <div>
      <div className="screenshot-toolbar">
        <select
          className="form-select screenshot-filter"
          value={tagFilter}
          onChange={(e) => onTagFilterChange(e.target.value)}
        >
          <option value="all">全部标签</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>

        <SearchInput
          value={searchKeyword}
          onChange={onSearchChange}
          placeholder="🔍 搜索..."
        />

        <button
          className={`btn ${showAdvancedFilter ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setShowAdvancedFilter(!showAdvancedFilter)}
        >
          高级筛选 {showAdvancedFilter ? '▲' : '▼'}
        </button>

        <MoreMenu
          onTagRecords={onTagRecords}
          onBatchDelete={onBatchDelete}
          disabled={selectedCount === 0}
        />

        <button className="btn btn-secondary" onClick={onRefresh}>
          刷新
        </button>

        {selectedCount > 0 && (
          <span className="batch-hint">已选 {selectedCount} 条</span>
        )}
      </div>

      {showAdvancedFilter && (
        <AdvancedFilterPanel
          filterState={filterState}
          onChange={onFilterStateChange}
          onApply={() => {
            onApplyFilter()
            setShowAdvancedFilter(false)
          }}
          onClear={handleClearFilter}
        />
      )}
    </div>
  )
}
