import React, { useEffect, useState, useMemo } from 'react'
import DataRecordList from './DataRecordList'
import DataRecordTrash from './DataRecordTrash'
import DataRecordTagManager from './DataRecordTagManager'
import FilterToolbar from '../components/FilterToolbar'
import type { FilterState } from '../components/AdvancedFilterPanel'
import { applyFilter, type FilterCriteria } from '../utils/filterUtils'

type DataTab = 'records' | 'trash' | 'tags'
type ViewMode = 'active' | 'trash'

interface Tag {
  id: string
  name: string
}

interface RecordItem {
  id: string
  createdAt: string
  fields: Record<string, string>
  status: 'active' | 'trash'
  tagIds: string[]
  deletedAt?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
  tags: Tag[]
}

interface DataRecordListResult {
  records: RecordItem[]
  tags: Tag[]
}

interface DataRecordsProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function generateId(): string {
  return `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export default function DataRecords({ showToast }: DataRecordsProps): React.JSX.Element {
  const [data, setData] = useState<DataRecordListResult>({ records: [], tags: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<DataTab>('records')
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [tagFilter, setTagFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState('')
  const [filterState, setFilterState] = useState<FilterState>({
    whitelistGroups: [{ id: generateId(), keywords: [], matchMode: 'AND' }],
    blacklistGroups: [{ id: generateId(), keywords: [], matchMode: 'OR' }],
    timeRange: { type: 'today' },
  })
  const [ocrResults, setOcrResults] = useState<Record<string, string>>({})

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      setData(await window.api.listDataRecords())
    } catch {
      showToast('数据列表加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    const unsub = window.api.onDataRecordsUpdated(() => {
      void loadData()
    })
    return unsub
  }, [])

  // 预加载 OCR 结果
  useEffect(() => {
    window.api.listScreenshots().then((list) => {
      const map: Record<string, string> = {}
      for (const s of list.screenshots) {
        if (typeof s.ocrText === 'string') map[s.id] = s.ocrText
      }
      setOcrResults(map)
    }).catch(() => { /* 忽略错误 */ })
  }, [])

  const displayRecords = useMemo(() => {
    return viewMode === 'active'
      ? data.records.filter((r) => r.status === 'active')
      : data.records.filter((r) => r.status === 'trash')
  }, [data.records, viewMode])

  // 应用筛选
  const filteredRecords = useMemo(() => {
    if (viewMode !== 'active') return displayRecords

    const criteria: FilterCriteria = {
      searchKeyword,
      whitelistGroups: filterState.whitelistGroups,
      blacklistGroups: filterState.blacklistGroups,
      timeRange: filterState.timeRange,
      tagFilter,
    }

    return applyFilter(displayRecords, criteria, ocrResults)
  }, [displayRecords, searchKeyword, filterState, ocrResults, tagFilter])

  const handleApplyFilter = (): void => {
    // 筛选已经通过 useMemo 自动应用
  }

  const handleClearFilter = (): void => {
    setSearchKeyword('')
    setFilterState({
      whitelistGroups: [{ id: generateId(), keywords: [], matchMode: 'AND' }],
      blacklistGroups: [{ id: generateId(), keywords: [], matchMode: 'OR' }],
      timeRange: { type: 'today' },
    })
  }

  const handleOcrResultsUpdate = (results: Record<string, string>): void => {
    setOcrResults(results)
  }

  return (
    <>
      <div className="page-title">数据</div>

      {/* Tab 切换栏 */}
      <div className="screenshot-toolbar">
        <div className="segmented">
          <button
            className={tab === 'records' ? 'active' : ''}
            onClick={() => { setTab('records'); setViewMode('active') }}
          >
            数据
          </button>
          <button
            className={tab === 'trash' ? 'active' : ''}
            onClick={() => { setTab('trash'); setViewMode('trash') }}
          >
            回收站
          </button>
          <button
            className={tab === 'tags' ? 'active' : ''}
            onClick={() => setTab('tags')}
          >
            标签管理
          </button>
        </div>
      </div>

      {loading ? (
        <div className="empty-tip">加载中...</div>
      ) : (
        <>
          {tab === 'records' && (
            <>
              <FilterToolbar
                tags={data.tags}
                tagFilter={tagFilter}
                searchKeyword={searchKeyword}
                filterState={filterState}
                onTagFilterChange={setTagFilter}
                onSearchChange={setSearchKeyword}
                onFilterStateChange={setFilterState}
                onApplyFilter={handleApplyFilter}
                onClearFilter={handleClearFilter}
                onRefresh={loadData}
                selectedCount={selectedIds.size}
              />
              <DataRecordList
                records={filteredRecords}
                tags={data.tags}
                selectedIds={selectedIds}
                showToast={showToast}
                onSelectionChange={setSelectedIds}
                onRefresh={loadData}
                ocrResults={ocrResults}
                onOcrResultsUpdate={handleOcrResultsUpdate}
              />
            </>
          )}
          {tab === 'trash' && (
            <DataRecordTrash
              records={data.records}
              selectedIds={selectedIds}
              showToast={showToast}
              onSelectionChange={setSelectedIds}
              onRefresh={loadData}
            />
          )}
          {tab === 'tags' && (
            <DataRecordTagManager
              tags={data.tags}
              records={data.records}
              showToast={showToast}
              onRefresh={loadData}
            />
          )}
        </>
      )}
    </>
  )
}
