import React from 'react'
import DataTable, { type Column } from '../components/DataTable'

/** 根据别名映射显示友好的字段名，无映射时对 varN 格式生成默认别名 */
function displayFieldKey(key: string, aliases?: Record<string, string>): string {
  if (aliases && aliases[key]) return aliases[key]
  const match = key.match(/^var(\d+)$/)
  if (match) return `变量${parseInt(match[1]) + 1}`
  return key
}

interface RecordItem {
  id: string
  createdAt: string
  fields: Record<string, string>
  fieldAliases?: Record<string, string>
  status: 'active' | 'trash'
  tagIds: string[]
  deletedAt?: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

interface DataRecordTrashProps {
  records: RecordItem[]
  selectedIds: Set<string>
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onSelectionChange: (ids: Set<string>) => void
  onRefresh: () => void
}

export default function DataRecordTrash({
  records,
  selectedIds,
  showToast,
  onSelectionChange,
  onRefresh,
}: DataRecordTrashProps): React.JSX.Element {
  const trashRecords = React.useMemo(
    () => records.filter((r) => r.status === 'trash').sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')),
    [records],
  )

  const handleRestore = async (item: RecordItem): Promise<void> => {
    try {
      await window.api.restoreDataRecord(item.id)
      showToast('已恢复', 'success')
      onRefresh()
    } catch (err) {
      showToast(`恢复失败：${(err as Error).message}`, 'error')
    }
  }

  const handleDeleteForever = async (item: RecordItem): Promise<void> => {
    if (!window.confirm(`永久删除这条记录？此操作不可撤销。`)) return
    try {
      await window.api.deleteDataRecordPermanently(item.id)
      showToast('已永久删除', 'success')
      onRefresh()
    } catch (err) {
      showToast(`删除失败：${(err as Error).message}`, 'error')
    }
  }

  const handleBatchDelete = async (): Promise<void> => {
    const items = trashRecords.filter((r) => selectedIds.has(r.id))
    if (items.length === 0) return
    if (!window.confirm(`永久删除 ${items.length} 条记录？此操作不可撤销。`)) return
    for (const item of items) {
      await window.api.deleteDataRecordPermanently(item.id)
    }
    showToast(`已永久删除 ${items.length} 条`, 'success')
    onSelectionChange(new Set())
    onRefresh()
  }

  const columns = React.useMemo<Column<RecordItem>[]>(() => [
    {
      key: 'fields',
      header: '字段',
      render: (item) => {
        const entries = Object.entries(item.fields).slice(0, 2)
        if (!entries.length) return <span className="tag-empty">无字段</span>
        return (
          <span className="field-preview">
            {entries.map(([k, v]) => (
              <span key={k} className="field-chip">{displayFieldKey(k, item.fieldAliases)}: {v.length > 30 ? v.slice(0, 30) + '…' : v}</span>
            ))}
            {Object.keys(item.fields).length > 2 && (
              <span className="field-chip field-more">+{Object.keys(item.fields).length - 2} 项</span>
            )}
          </span>
        )
      },
    },
    {
      key: 'flow',
      header: '来源流程',
      render: (item) => item.flowName ?? '-',
    },
    {
      key: 'deletedAt',
      header: '删除时间',
      width: '130px',
      render: (item) => item.deletedAt ?? '-',
    },
    {
      key: 'actions',
      header: '操作',
      width: '160px',
      align: 'right',
      render: (item) => (
        <div className="screenshot-actions datatable-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={() => handleRestore(item)}>
            恢复
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteForever(item)}>
            永久删除
          </button>
        </div>
      ),
    },
  ], [trashRecords])

  return (
    <>
      <div className="screenshot-toolbar">
        <button className="btn btn-secondary" onClick={onRefresh}>
          刷新
        </button>
        {selectedIds.size > 0 ? (
          <>
            <span className="batch-hint">已选 {selectedIds.size} 条</span>
            <button className="btn btn-danger" onClick={handleBatchDelete}>
              永久删除选中
            </button>
            <button className="btn btn-secondary" onClick={() => onSelectionChange(new Set())}>
              取消选择
            </button>
          </>
        ) : null}
      </div>

      {trashRecords.length === 0 ? (
        <div className="empty-tip">回收站为空</div>
      ) : (
        <DataTable
          columns={columns}
          data={trashRecords}
          rowKey={(item) => item.id}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={onSelectionChange}
        />
      )}
    </>
  )
}
