import React, { useEffect, useState } from 'react'
import DataRecordList from './DataRecordList'
import DataRecordTrash from './DataRecordTrash'
import DataRecordTagManager from './DataRecordTagManager'

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

export default function DataRecords({ showToast }: DataRecordsProps): React.JSX.Element {
  const [data, setData] = useState<DataRecordListResult>({ records: [], tags: [] })
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<DataTab>('records')
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [tagFilter, setTagFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

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

  const displayRecords = React.useMemo(() => {
    return viewMode === 'active'
      ? data.records.filter((r) => r.status === 'active')
      : data.records.filter((r) => r.status === 'trash')
  }, [data.records, viewMode])

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
            <DataRecordList
              records={displayRecords}
              tags={data.tags}
              tagFilter={tagFilter}
              selectedIds={selectedIds}
              showToast={showToast}
              onTagFilterChange={setTagFilter}
              onSelectionChange={setSelectedIds}
              onRefresh={loadData}
            />
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
