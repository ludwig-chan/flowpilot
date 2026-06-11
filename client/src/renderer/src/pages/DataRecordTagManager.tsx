import React, { useState } from 'react'

interface Tag {
  id: string
  name: string
}

interface RecordItem {
  id: string
  tagIds: string[]
}

interface DataRecordTagProps {
  tags: Tag[]
  records: RecordItem[]
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onRefresh: () => void
}

export default function DataRecordTagManager({
  tags,
  records,
  showToast,
  onRefresh,
}: DataRecordTagProps): React.JSX.Element {
  const [newTagName, setNewTagName] = useState('')
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null)

  const tagCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of records) {
      for (const tagId of r.tagIds) {
        counts[tagId] = (counts[tagId] || 0) + 1
      }
    }
    return counts
  }, [records])

  const handleCreate = async (): Promise<void> => {
    const name = newTagName.trim()
    if (!name) return
    try {
      await window.api.createDataRecordTag(name)
      setNewTagName('')
      showToast(`标签「${name}」已创建`, 'success')
      onRefresh()
    } catch (err) {
      showToast(`创建失败：${(err as Error).message}`, 'error')
    }
  }

  const handleDelete = async (tag: Tag): Promise<void> => {
    if (!window.confirm(`删除标签「${tag.name}」？不会删除关联的记录。`)) return
    setDeletingTagId(tag.id)
    try {
      for (const r of records) {
        if (r.tagIds.includes(tag.id)) {
          await window.api.updateDataRecordTags(r.id, r.tagIds.filter((id) => id !== tag.id))
        }
      }
      showToast(`标签「${tag.name}」已删除`, 'success')
      onRefresh()
    } catch (err) {
      showToast(`删除失败：${(err as Error).message}`, 'error')
    } finally {
      setDeletingTagId(null)
    }
  }

  return (
    <div className="data-tag-manager">
      <div className="screenshot-toolbar">
        <input
          className="form-input"
          style={{ width: 200 }}
          placeholder="输入标签名"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate()
          }}
        />
        <button className="btn btn-primary" onClick={handleCreate} disabled={!newTagName.trim()}>
          新建标签
        </button>
      </div>

      {tags.length === 0 ? (
        <div className="empty-tip">还没有标签</div>
      ) : (
        <table className="datatable">
          <thead>
            <tr>
              <th>标签名</th>
              <th style={{ width: 80, textAlign: 'center' }}>记录数</th>
              <th style={{ width: 80, textAlign: 'right' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id}>
                <td>{tag.name}</td>
                <td style={{ textAlign: 'center' }}>{tagCounts[tag.id] || 0}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(tag)}
                    disabled={deletingTagId === tag.id}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
