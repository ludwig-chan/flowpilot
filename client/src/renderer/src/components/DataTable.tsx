import React from 'react'

export interface Column<T> {
  key: string
  header: string
  width?: string
  align?: 'left' | 'center' | 'right'
  render: (item: T) => React.ReactNode
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  rowKey: (item: T) => string
  onRowClick?: (item: T) => void
  emptyText?: string
  selectable?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyText,
  selectable,
  selectedIds,
  onSelectionChange,
}: DataTableProps<T>): React.JSX.Element {
  if (data.length === 0) {
    return <div className="empty-tip">{emptyText ?? '暂无数据'}</div>
  }

  const allIds = data.map((item) => rowKey(item))
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds?.has(id))
  const someSelected = allIds.some((id) => selectedIds?.has(id))
  const indeterminate = someSelected && !allSelected

  const handleSelectAll = (): void => {
    if (allSelected) {
      onSelectionChange?.(new Set())
    } else {
      onSelectionChange?.(new Set(allIds))
    }
  }

  const handleSelectOne = (id: string): void => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    onSelectionChange?.(next)
  }

  return (
    <div className="datatable-wrap">
      <table className="datatable">
        <thead>
          <tr>
            {selectable && (
              <th className="datatable-check-col">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = indeterminate }}
                  onChange={handleSelectAll}
                />
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  textAlign: col.align ?? 'left',
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const id = rowKey(item)
            return (
              <tr
                key={id}
                onClick={() => onRowClick?.(item)}
                className={onRowClick ? 'clickable' : ''}
              >
                {selectable && (
                  <td className="datatable-check-col" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds?.has(id) ?? false}
                      onChange={() => handleSelectOne(id)}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
