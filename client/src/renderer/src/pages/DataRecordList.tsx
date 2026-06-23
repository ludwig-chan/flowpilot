import React, { useEffect, useRef, useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'
import ImageLightbox from '../components/ImageLightbox'
import OcrTextDialog from '../components/OcrTextDialog'
import TagEditor from '../components/TagEditor'

interface Tag {
  id: string
  name: string
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
  tags: Tag[]
}

interface DataRecordListProps {
  records: RecordItem[]
  tags: Tag[]
  selectedIds: Set<string>
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
  onSelectionChange: (ids: Set<string>) => void
  onRefresh: () => void
  ocrResults: Record<string, string>
  onOcrResultsUpdate: (results: Record<string, string>) => void
}

/** 根据别名映射显示友好的字段名，无映射时对 varN 格式生成默认别名 */
function displayFieldKey(key: string, aliases?: Record<string, string>): string {
  if (aliases && aliases[key]) return aliases[key]
  const match = key.match(/^var(\d+)$/)
  if (match) return `变量${parseInt(match[1]) + 1}`
  return key
}

function formatDate(value: string): string {
  if (!value) return '-'
  return value
}

function isScreenshotId(value: string): boolean {
  return value.startsWith('shot_') && !value.includes(' ')
}

function hasOcrResult(results: Record<string, string>, screenshotId: string): boolean {
  return Object.prototype.hasOwnProperty.call(results, screenshotId)
}

function collectScreenshotIds(records: RecordItem[]): string[] {
  const ids = new Set<string>()
  for (const record of records) {
    for (const value of Object.values(record.fields)) {
      if (isScreenshotId(value)) ids.add(value)
    }
  }
  return [...ids]
}

export default function DataRecordList({
  records,
  tags,
  selectedIds,
  showToast,
  onSelectionChange,
  onRefresh,
  ocrResults,
  onOcrResultsUpdate,
}: DataRecordListProps): React.JSX.Element {
  const [detailRecord, setDetailRecord] = useState<RecordItem | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const [newTagById, setNewTagById] = useState<Record<string, string>>({})
  const [lightboxImage, setLightboxImage] = useState<{ src: string; alt: string } | null>(null)
  const [lightboxLoading, setLightboxLoading] = useState(false)
  const [ocrErrors, setOcrErrors] = useState<Record<string, string>>({})
  const [ocrLoading, setOcrLoading] = useState<Record<string, boolean>>({})
  const [ocrDialog, setOcrDialog] = useState<{ text: string; label: string } | null>(null)
  const [tagEditRecord, setTagEditRecord] = useState<RecordItem | null>(null)
  const queuedOcrIdsRef = useRef<Set<string>>(new Set())

  const recordScreenshotIds = React.useMemo(
    () => collectScreenshotIds(records),
    [records],
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
    const items = records.filter((r) => selectedIds.has(r.id))
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

  const runOcrForScreenshots = async (screenshotIds: string[]): Promise<void> => {
    const targets = screenshotIds.filter((screenshotId) => {
      if (ocrLoading[screenshotId]) return false
      if (hasOcrResult(ocrResults, screenshotId)) return false
      if (ocrErrors[screenshotId]) return false
      if (queuedOcrIdsRef.current.has(screenshotId)) return false
      return true
    })
    if (!targets.length) return

    for (const id of targets) queuedOcrIdsRef.current.add(id)
    setOcrLoading((prev) => {
      const next = { ...prev }
      for (const id of targets) next[id] = true
      return next
    })
    setOcrErrors((prev) => {
      const next = { ...prev }
      for (const id of targets) delete next[id]
      return next
    })

    try {
      const result = await window.api.ocrScreenshotsBatch(targets)
      const returnedIds = new Set(result.results.map((item) => item.id))

      const newOcrResults = { ...ocrResults }
      for (const item of result.results) {
        if (typeof item.text === 'string') newOcrResults[item.id] = item.text
      }
      onOcrResultsUpdate(newOcrResults)

      setOcrErrors((prev) => {
        const next = { ...prev }
        for (const item of result.results) {
          if (item.error) next[item.id] = item.error
        }
        for (const id of targets) {
          if (!returnedIds.has(id)) next[id] = result.error ?? 'OCR failed'
        }
        return next
      })
    } catch (err) {
      setOcrErrors((prev) => {
        const next = { ...prev }
        for (const id of targets) next[id] = (err as Error).message
        return next
      })
    } finally {
      for (const id of targets) queuedOcrIdsRef.current.delete(id)
      setOcrLoading((prev) => {
        const next = { ...prev }
        for (const id of targets) next[id] = false
        return next
      })
    }
  }

  useEffect(() => {
    void runOcrForScreenshots(recordScreenshotIds)
  }, [recordScreenshotIds])

  const openDetail = async (item: RecordItem): Promise<void> => {
    setDetailRecord(item)
    // 预加载截图缩略图
    const newThumbs: Record<string, string> = { ...thumbnails }
    for (const [, val] of Object.entries(item.fields)) {
      if (isScreenshotId(val) && !newThumbs[val]) {
        try {
          const img = await window.api.getScreenshotImage(val)
          if (img) newThumbs[val] = img.dataUrl
        } catch { /* 忽略加载失败 */ }
      }
    }
    setThumbnails(newThumbs)
  }

  // ── 详情弹窗的上/下条导航 ──
  const detailIndex = detailRecord
    ? records.findIndex((r) => r.id === detailRecord.id)
    : -1

  const prevRecord = detailIndex > 0 ? records[detailIndex - 1] : null
  const nextRecord = detailIndex < records.length - 1 ? records[detailIndex + 1] : null

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
            {displayFieldKey(k, item.fieldAliases)}: {v.length > 30 ? v.slice(0, 30) + '…' : v}
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
  ], [records])

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="screenshot-toolbar" style={{ marginTop: 8 }}>
          <span className="batch-hint">已选 {selectedIds.size} 条</span>
          <button className="btn btn-danger" onClick={handleBatchTrash}>
            删除选中
          </button>
          <button className="btn btn-secondary" onClick={() => onSelectionChange(new Set())}>
            取消选择
          </button>
        </div>
      )}

      {records.length === 0 ? (
        <div className="empty-tip">没有匹配的数据记录</div>
      ) : (
        <DataTable
          columns={columns}
          data={records}
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
                  {records.length > 1 && (
                    <span style={{ fontWeight: 400, color: '#a6adc8', marginLeft: 6, fontSize: 12 }}>
                      {detailIndex + 1} / {records.length}
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
                    const isScreenshot = isScreenshotId(val)
                    const ocrText = isScreenshot && hasOcrResult(ocrResults, val) ? ocrResults[val] : null
                    const ocrError = isScreenshot ? (ocrErrors[val] ?? null) : null
                    const ocrIsLoading = isScreenshot ? (ocrLoading[val] ?? false) : false
                    return (
                      <tr key={key} className="detail-field-row">
                        <td className="detail-field-key">{displayFieldKey(key, detailRecord.fieldAliases)}</td>
                        <td className="detail-field-val">
                          {isScreenshot ? (
                            <div className="detail-screenshot-field">
                              <img
                                src={thumbnails[val] || ''}
                                hidden={!thumbnails[val]}
                                alt={key}
                                onClick={() => {
                                  setLightboxLoading(true)
                                  window.api.getScreenshotImage(val).then((img) => {
                                    setLightboxLoading(false)
                                    if (img) setLightboxImage({ src: img.dataUrl, alt: key })
                                  }).catch(() => setLightboxLoading(false))
                                }}
                                style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, cursor: 'zoom-in', objectFit: 'contain' }}
                              />
                              {!thumbnails[val] && (
                                <div className="detail-screenshot-placeholder">截图加载中或文件不存在</div>
                              )}
                              {ocrIsLoading && <span className="ocr-loading-hint">OCR 识别中…</span>}
                              {ocrText && (
                                <button
                                  className="ocr-view-btn"
                                  onClick={() => setOcrDialog({ text: ocrText, label: key })}
                                >
                                  显示OCR识别结果
                                </button>
                              )}
                              <div className="detail-ocr-panel">
                                <div className="detail-ocr-header">OCR识别结果</div>
                                {ocrIsLoading ? (
                                  <div className="detail-ocr-state">OCR 识别中...</div>
                                ) : ocrError ? (
                                  <div className="detail-ocr-state detail-ocr-error">OCR 识别失败：{ocrError}</div>
                                ) : ocrText !== null ? (
                                  ocrText.trim() ? (
                                    <pre className="detail-ocr-text">{ocrText}</pre>
                                  ) : (
                                    <div className="detail-ocr-state">未识别到文字</div>
                                  )
                                ) : (
                                  <div className="detail-ocr-state">等待 OCR 识别...</div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span>{val || '(空)'}</span>
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
        <OcrTextDialog
          text={ocrDialog.text}
          label={ocrDialog.label}
          onClose={() => setOcrDialog(null)}
        />
      )}
    </>
  )
}
