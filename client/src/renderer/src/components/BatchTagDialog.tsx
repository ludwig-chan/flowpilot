import React, { useState } from 'react'

interface Tag {
  id: string
  name: string
}

interface BatchTagDialogProps {
  selectedCount: number
  allTags: Tag[]
  onConfirm: (tagId: string | null, newTagName: string) => Promise<void>
  onClose: () => void
}

export default function BatchTagDialog({
  selectedCount,
  allTags,
  onConfirm,
  onClose,
}: BatchTagDialogProps): React.JSX.Element {
  const [selectedTagId, setSelectedTagId] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleConfirm = async (): Promise<void> => {
    if (loading) return
    setLoading(true)
    try {
      await onConfirm(selectedTagId || null, newTagName.trim())
    } finally {
      setLoading(false)
    }
  }

  const canConfirm = !loading && (selectedTagId || newTagName.trim())

  return (
    <div className="ocr-dialog-overlay" onClick={onClose}>
      <div className="ocr-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="ocr-dialog-header">
          <span>批量打标签</span>
          <button className="ocr-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="ocr-dialog-body">
          <div style={{ fontSize: 14, color: 'var(--accent)', marginBottom: 16 }}>
            已选中 {selectedCount} 条记录
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>选择标签</div>
            <select
              className="form-select"
              value={selectedTagId}
              onChange={(e) => { setSelectedTagId(e.target.value); setNewTagName('') }}
              style={{ width: '100%' }}
            >
              <option value="">请选择标签</option>
              {allTags.map((tag) => (
                <option key={tag.id} value={tag.id}>{tag.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>或输入新标签</div>
            <input
              className="form-input"
              placeholder="请输入标签名..."
              value={newTagName}
              onChange={(e) => { setNewTagName(e.target.value); setSelectedTagId('') }}
              onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) void handleConfirm() }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose} disabled={loading}>取消</button>
            <button className="btn btn-primary" onClick={() => void handleConfirm()} disabled={!canConfirm}>
              {loading ? '处理中...' : '确定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
