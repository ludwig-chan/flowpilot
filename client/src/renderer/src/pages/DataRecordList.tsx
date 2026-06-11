import React, { useEffect, useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'
import ImageLightbox from '../components/ImageLightbox'
import TagEditor from '../components/TagEditor'

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

interface DataRecordListProps {
  records: RecordItem[]
  tags: Tag[]
  tagFilter: string
  selectedIds: Set<string>
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onTagFilterChange: (tagId: string) => void
  onSelectionChange: (ids: Set<string>) => void
  onRefresh: () => void
}

function formatDate(value: string): string {
  if (!value) return '-'
  return value
}

export default function DataRecordList({
  records,
  tags,
  tagFilter,
  selectedIds,
  showToast,
  onTagFilterChange,
  onSelectionChange,
  onRefresh,
}: DataRecordListProps): React.JSX.Element {
  const [detailRecord, setDetailRecord] = useState<RecordItem | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [newTagById, setNewTagById] = useState<Record<string, string>>({})
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)
  const [lightboxLoading, setLightboxLoading] = useState(false)
  const [ocrResults, setOcrResults] = useState<Record<string, string>>({})
  const [ocrLoading, setOcrLoading] = useState<Record<string, boolean>>({})
  const [ocrDialog, setOcrDialog] = useState<{ text: string; label: string } | null>(null)
  const [tagEditRecord, setTagEditRecord] = useState<RecordItem | null>(null)

  // ── 预加载截图库已有 OCR 结果，避免重复识别 ──
  useEffect(() => {
    window.api.listScreenshots().then((list) => {
      const map: Record<string, string> = {}
      for (const s of list.screenshots) {
        if (s.ocrText) map[s.id] = s.ocrText
      }
      setOcrResults((prev) => ({ ...map, ...prev }))
    }).catch(() => {})
  }, [])

  const activeRecords = React.useMemo(
    () => records.filter((r) => {
      if (r.status !== 'active') return false
      if (tagFilter !== 'all' && !r.tagIds.includes(tagFilter)) return false
      return true
    }),
    [records, tagFilter],
  )

  const handleTrash = async (item: RecordItem): Promise<void> => {
    if (!window.confirm(`移入回收站：这条记录？`)) return
    try {
      await window.api.trashDataRecord(item.id)
      showToast('已移入回收站', 'success')
      onRefresh()
    } catch (err) {
      showToast(`操作失败：${(err as Error).message}`, 'error')
    }
  }

  const handleBatchTrash = async (): Promise<void> => {
    const items = activeRecords.filter((r) => selectedIds.has(r.id))
    if (items.length === 0) return
    if (!window.confirm(`移入回收站 ${items.length} 条记录？`)) return
    for (const item of items) {
      await window.api.trashDataRecord(item.id)
    }
    showToast(`已移入回收站 ${items.length} 条`, 'success')
    onSelectionChange(new Set())
    onRefresh()
  }

  const addExistingTag = async (item: RecordItem, tagId: string): Promise<void> => {
    if (!tagId || item.tagIds.includes(tagId)) return
    await window.api.updateDataRecordTags(item.id, [...item.tagIds, tagId])
    onRefresh()
  }

  const addNewTag = async (item: RecordItem): Promise<void> => {
    const value = (newTagById[item.id] || '').trim()
    if (!value) return
    try {
      const tag = await window.api.createDataRecordTag(value)
      await addExistingTag(item, tag.id)
      setNewTagById((prev) => ({ ...prev, [item.id]: '' }))
    } catch {
      showToast('标签保存失败', 'error')
    }
  }

  const removeTag = async (item: RecordItem, tagId: string): Promise<void> => {
    await window.api.updateDataRecordTags(item.id, item.tagIds.filter((id) => id !== tagId))
    onRefresh()
  }

  const runOcrForField = async (screenshotId: string): Promise<void> => {
    if (ocrLoading[screenshotId]) return
    if (ocrResults[screenshotId]) return
    setOcrLoading((prev) => ({ ...prev, [screenshotId]: true }))
    try {
      const result = await window.api.ocrScreenshot(screenshotId)
      if (result.success && result.text) {
        setOcrResults((prev) => ({ ...prev, [screenshotId]: result.text! }))
      }
    } catch { /* 忽略 OCR 失败 */ }
    finally {
      setOcrLoading((prev) => ({ ...prev, [screenshotId]: false }))
    }
  }

  const openDetail = async (item: RecordItem): Promise<void> => {
    setDetailRecord(item)
    // 预加载截图缩略图
    const newThumbs: Record<string, string> = { ...thumbnails }
    for (const [, val] of Object.entries(item.fields)) {
      if (val.startsWith('shot_') && !val.includes(' ') && !newThumbs[val]) {
        try {
          const img = await window.api.getScreenshotImage(val)
          if (img) newThumbs[val] = img.dataUrl
        } catch { /* 忽略加载失败 */ }
      }
    }
    setThumbnails(newThumbs)

    // 自动触发 OCR（仅对未识别过的截图字段）
    for (const [, val] of Object.entries(item.fields)) {
      if (val.startsWith('shot_') && !val.includes(' ')) {
        void runOcrForField(val)
      }
    }
  }

  // ── 详情弹窗的上/下条导航 ──
  const detailIndex = detailRecord
    ? activeRecords.findIndex((r) => r.id === detailRecord.id)
    : -1

  const prevRecord = detailIndex > 0 ? activeRecords[detailIndex - 1] : null
  const nextRecord = detailIndex < activeRecords.length - 1 ? activeRecords[detailIndex + 1] : null

  const goToPrev = () => { if (prevRecord) void openDetail(prevRecord) }
  const goToNext = () => { if (nextRecord) void openDetail(nextRecord) }

  const renderFieldPreview = (item: RecordItem): React.ReactNode => {
    const entries = Object.entries(item.fields)
    if (!entries.length) return <span className="tag-empty">无字段</span>

    const preview = entries.slice(0, 2)
    const more = entries.length - 2

    return (
      <span
        className="field-preview"
        title="点击查看完整字段"
        onClick={(e) => { e.stopPropagation(); void openDetail(item) }}
        style={{ cursor: 'pointer' }}
      >
        {preview.map(([k, v]) => (
          <span key={k} className="field-chip">
            {k}: {v.length > 30 ? v.slice(0, 30) + '…' : v}
          </span>
        ))}
        {more > 0 && <span className="field-chip field-more">+{more} 项</span>}
      </span>
    )
  }

  const columns = React.useMemo<Column<RecordItem>[]>(() => [
    {
      key: 'fields',
      header: '字段',
      render: (item) => renderFieldPreview(item),
    },
    {
      key: 'flow',
      header: '来源流程',
      render: (item) => item.flowName ?? '-',
    },
    {
      key: 'source',
      header: '页面',
      render: (item) => item.sourceTitle ?? item.sourceUrl ?? '-',
    },
    {
      key: 'date',
      header: '时间',
      width: '130px',
      render: (item) => formatDate(item.createdAt),
    },
    {
      key: 'tags',
      header: '标签',
      render: (item) => (
        <div className="tag-row datatable-tag-row" onClick={(e) => e.stopPropagation()}>
          {item.tags.length === 0 && <span className="tag-empty">-</span>}
          {item.tags.map((tag) => (
            <button
              key={tag.id}
              className="tag-pill"
              onClick={() => removeTag(item, tag.id)}
              title="点击移除标签"
            >
              {tag.name} ×
            </button>
          ))}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '156px',
      align: 'right',
      render: (item) => (
        <div className="screenshot-actions datatable-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={() => setTagEditRecord(item)}>
            标签
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleTrash(item)}>
            删除
          </button>
        </div>
      ),
    },
  ], [activeRecords])

  return (
    <>
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
        <button className="btn btn-secondary" onClick={onRefresh}>
          刷新
        </button>
        {selectedIds.size > 0 ? (
          <>
            <span className="batch-hint">已选 {selectedIds.size} 条</span>
            <button className="btn btn-danger" onClick={handleBatchTrash}>
              删除选中
            </button>
            <button className="btn btn-secondary" onClick={() => onSelectionChange(new Set())}>
              取消选择
            </button>
          </>
        ) : null}
      </div>

      {activeRecords.length === 0 ? (
        <div className="empty-tip">还没有数据记录</div>
      ) : (
        <DataTable
          columns={columns}
          data={activeRecords}
          rowKey={(item) => item.id}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={onSelectionChange}
          onRowClick={(item) => { void openDetail(item) }}
        />
      )}

      {/* 字段详情弹窗 */}
      {detailRecord && (
        <div
          className="ocr-dialog-overlay"
          onClick={() => setDetailRecord(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') goToPrev()
            else if (e.key === 'ArrowRight') goToNext()
            else if (e.key === 'Escape') setDetailRecord(null)
          }}
          tabIndex={0}
        >
          <div className="ocr-dialog" onClick={(e) => e.stopPropagation()} style={{ width: '75vw', maxWidth: 960, maxHeight: '85vh' }}>
            <div className="ocr-dialog-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  className="ocr-dialog-nav-btn"
                  onClick={goToPrev}
                  disabled={!prevRecord}
                  title="上一条"
                >
                  ←
                </button>
                <span>
                  字段详情
                  {activeRecords.length > 1 && (
                    <span style={{ fontWeight: 400, color: '#a6adc8', marginLeft: 6, fontSize: 12 }}>
                      {detailIndex + 1} / {activeRecords.length}
                    </span>
                  )}
                </span>
                <button
                  className="ocr-dialog-nav-btn"
                  onClick={goToNext}
                  disabled={!nextRecord}
                  title="下一条"
                >
                  →
                </button>
              </div>
              <button className="ocr-dialog-close" onClick={() => setDetailRecord(null)}>×</button>
            </div>
            <div className="ocr-dialog-body">
              <div style={{ marginBottom: 10, color: '#a6adc8', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {detailRecord.flowName && <span>流程：{detailRecord.flowName}</span>}
                <span>{detailRecord.createdAt}</span>
                {detailRecord.sourceTitle && <span>页面：{detailRecord.sourceTitle}</span>}
              </div>
              <table className="detail-fields-table">
                <tbody>
                  {Object.entries(detailRecord.fields).map(([key, val]) => {
                    const isScreenshot = val.startsWith('shot_') && !val.includes(' ')
                    const ocrText = isScreenshot ? (ocrResults[val] ?? null) : null
                    return (
                      <tr key={key} className="detail-field-row">
                        <td className="detail-field-key">
                          {key}
                          {isScreenshot && (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: 10, padding: '1px 6px', marginLeft: 4 }}
                              onClick={() => {
                                if (ocrText) {
                                  setOcrDialog({ text: ocrText, label: key })
                                } else {
                                  void runOcrForField(val)
                                }
                              }}
                              disabled={ocrLoading[val]}
                            >
                              {ocrLoading[val] ? '识别中…' : 'OCR'}
                            </button>
                          )}
                        </td>
                        <td className="detail-field-val">
                          {isScreenshot && thumbnails[val] ? (
                            <img
                              src={thumbnails[val]}
                              alt={key}
                              onClick={() => {
                                setLightboxLoading(true)
                                window.api.getScreenshotImage(val).then((img) => {
                                  setLightboxLoading(false)
                                  if (img) setLightboxImage({ src: img.dataUrl, alt: key })
                                }).catch(() => setLightboxLoading(false))
                              }}
                              style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, cursor: 'zoom-in' }}
                            />
                          ) : (
                            <span>{val || '(空)'}</span>
                          )}
                          {isScreenshot && ocrText && (
                            <div className="ocr-text" title={ocrText} style={{ marginTop: 4, fontSize: 11 }}>
                              <span className="ocr-label">OCR：</span>
                              {ocrText.length > 60 ? `${ocrText.slice(0, 60)}...` : ocrText}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

            </div>
          </div>
        </div>
      )}

      {tagEditRecord && (
        <TagEditor
          title="标签管理"
          itemTags={tagEditRecord.tags}
          itemTagIds={tagEditRecord.tagIds}
          allTags={tags}
          newTagName={newTagById[tagEditRecord.id] || ''}
          onNewTagNameChange={(value) => setNewTagById((prev) => ({ ...prev, [tagEditRecord.id]: value }))}
          onAddExistingTag={async (tagId) => { await addExistingTag(tagEditRecord, tagId) }}
          onAddNewTag={async () => { await addNewTag(tagEditRecord) }}
          onRemoveTag={async (tagId) => { await removeTag(tagEditRecord, tagId) }}
          onClose={() => setTagEditRecord(null)}
        />
      )}

      <ImageLightbox
        image={lightboxImage}
        loading={lightboxLoading}
        onClose={() => setLightboxImage(null)}
      />

      {ocrDialog && (
        <div className="ocr-dialog-overlay" onClick={() => setOcrDialog(null)}>
          <div className="ocr-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ocr-dialog-header">
              <span>OCR 识别结果 — {ocrDialog.label}</span>
              <button className="ocr-dialog-close" onClick={() => setOcrDialog(null)}>×</button>
            </div>
            <div className="ocr-dialog-body">{ocrDialog.text}</div>
          </div>
        </div>
      )}
    </>
  )
}
