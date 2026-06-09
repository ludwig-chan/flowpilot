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
}

export default function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyText,
}: DataTableProps<T>): React.JSX.Element {
  if (data.length === 0) {
    return <div className="empty-tip">{emptyText ?? '暂无数据'}</div>
  }

  return (
    <div className="datatable-wrap">
      <table className="datatable">
        <thead>
          <tr>
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
          {data.map((item) => (
            <tr
              key={rowKey(item)}
              onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'clickable' : ''}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ textAlign: col.align ?? 'left' }}>
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
