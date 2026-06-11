import React from 'react'

export interface TagItem {
  id: string
  name: string
}

interface TagEditorProps {
  title: string
  itemTags: TagItem[]
  itemTagIds: string[]
  allTags: TagItem[]
  newTagName: string
  onNewTagNameChange: (value: string) => void
  onAddExistingTag: (tagId: string) => Promise<void>
  onAddNewTag: () => Promise<void>
  onRemoveTag: (tagId: string) => Promise<void>
  onClose: () => void
}

export default function TagEditor({
  title,
  itemTags,
  itemTagIds,
  allTags,
  newTagName,
  onNewTagNameChange,
  onAddExistingTag,
  onAddNewTag,
  onRemoveTag,
  onClose,
}: TagEditorProps): React.JSX.Element {
  return (
    <div className="ocr-dialog-overlay" onClick={onClose}>
      <div className="ocr-dialog" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="ocr-dialog-header">
          <span>{title}</span>
          <button className="ocr-dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="ocr-dialog-body">
          <div className="tag-row" style={{ marginBottom: 8 }}>
            {itemTags.length === 0 && <span className="tag-empty">无标签</span>}
            {itemTags.map((tag) => (
              <button key={tag.id} className="tag-pill"
                onClick={() => void onRemoveTag(tag.id)}
                title="移除标签">{tag.name} ×</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="form-select" value=""
              onChange={(e) => { if (e.target.value) void onAddExistingTag(e.target.value) }}
              style={{ flex: 1 }}>
              <option value="">选择标签</option>
              {allTags.filter((t) => !itemTagIds.includes(t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <input className="form-input" placeholder="新标签"
              value={newTagName}
              onChange={(e) => onNewTagNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void onAddNewTag() }}
              style={{ flex: 1 }} />
            <button className="btn btn-secondary btn-sm" onClick={() => void onAddNewTag()}>添加</button>
          </div>
        </div>
      </div>
    </div>
  )
}
