import React, { useEffect, useMemo, useState } from 'react'
import DataTable, { type Column } from '../components/DataTable'
import ImageLightbox from '../components/ImageLightbox'

type ViewMode = 'active' | 'trash'
type LayoutMode = 'table' | 'card'

interface ScreenshotRun {
  id: string
  startedAt: string
  flowName?: string
  sourceUrl?: string
  sourceTitle?: string
}

interface ScreenshotTag {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

interface ScreenshotItem {
  id: string
  filename: string
  status: ViewMode
  runId: string
  createdAt: string
  size: number
  deletedAt?: string
  tagIds: string[]
  run?: ScreenshotRun
  tags: ScreenshotTag[]
  thumbnailDataUrl: string
  ocrText?: string
  ocrAt?: string
}

interface ScreenshotListResult {
  screenshots: ScreenshotItem[]
  tags: ScreenshotTag[]
  screenshotDir: string
  trashDir: string
}

interface ScreenshotImageResult {
  id: string
  filename: string
  dataUrl: string
}

interface ScreenshotsProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

function formatDate(value: string): string {
  if (!value) return '-'
  return new Date(value).toLocaleString('zh-CN')
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function getRunName(item: ScreenshotItem): string {
  return item.run?.flowName || '历史截图/未知执行'
}

export default function Screenshots({ showToast }: ScreenshotsProps): React.JSX.Element {
  const [data, setData] = useState<ScreenshotListResult>({
    screenshots: [],
    tags: [],
    screenshotDir: '',
    trashDir: ''
  })
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('active')
  const [layoutMode] = useState<LayoutMode>('table')
  const [tagFilter, setTagFilter] = useState('all')
  const [newTagById, setNewTagById] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<{ index: number; image: ScreenshotImageResult } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState<Record<string, boolean>>({})
  const [batchOcrLoading, setBatchOcrLoading] = useState(false)
  const [batchOcrProgress, setBatchOcrProgress] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ocrDialog, setOcrDialog] = useState<{ text: string; filename: string } | null>(null)

  const loadData = async (): Promise<void> => {
    setLoading(true)
    try {
      setData(await window.api.listScreenshots())
    } catch {
      showToast('截图列表加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    const unsub = window.api.onScreenshotsUpdated(() => {
      void loadData()
    })
    return unsub
  }, [])

  const filteredScreenshots = useMemo(() => {
    return data.screenshots.filter((item) => {
      if (item.status !== viewMode) return false
      if (tagFilter !== 'all' && !item.tagIds.includes(tagFilter)) return false
      return true
    })
  }, [data.screenshots, tagFilter, viewMode])

  const screenshotColumns = useMemo<Column<ScreenshotItem>[]>(() => [
    {
      key: 'preview',
      header: '预览',
      width: '52px',
      render: (item) => (
        <img
          className="datatable-thumb"
          src={item.thumbnailDataUrl}
          alt={item.filename}
          onClick={() => openPreview(item.id)}
          style={{ cursor: 'zoom-in' }}
        />
      ),
    },
    {
      key: 'filename',
      header: '文件名',
      render: (item) => (
        <span className="screenshot-name" title={item.filename}>
          {item.filename}
        </span>
      ),
    },
    {
      key: 'run',
      header: '来源流程',
      render: (item) => getRunName(item),
    },
    {
      key: 'source',
      header: '页面',
      render: (item) => item.run?.sourceTitle ?? '-',
    },
    {
      key: 'date',
      header: '时间',
      width: '130px',
      render: (item) => formatDate(item.createdAt),
    },
    {
      key: 'size',
      header: '大小',
      width: '72px',
      align: 'right',
      render: (item) => formatSize(item.size),
    },
    {
      key: 'tags',
      header: '标签',
      render: (item) => (
        <div className="tag-row datatable-tag-row">
          {item.tags.length === 0 && <span className="tag-empty">-</span>}
          {item.tags.map((tag) => (
            <button
              key={tag.id}
              className="tag-pill"
              onClick={(e) => { e.stopPropagation(); removeTag(item, tag.id) }}
              title="点击移除标签"
            >
              {tag.name} ×
            </button>
          ))}
        </div>
      ),
    },
    {
      key: 'ocr',
      header: 'OCR识别',
      width: '160px',
      render: (item) => (
        item.ocrText ? (
          <span
            className="ocr-text-datatable"
            title="点击查看完整结果"
            onClick={(e) => { e.stopPropagation(); setOcrDialog({ text: item.ocrText!, filename: item.filename }) }}
          >
            {item.ocrText.length > 30
              ? `${item.ocrText.slice(0, 30)}...`
              : item.ocrText}
          </span>
        ) : (
          <span className="ocr-text-datatable ocr-empty">-</span>
        )
      ),
    },
    {
      key: 'actions',
      header: '操作',
      width: '164px',
      align: 'right',
      render: (item) => (
        <div className="screenshot-actions datatable-actions" onClick={(e) => e.stopPropagation()}>
          <button className="btn btn-secondary btn-sm" onClick={() => window.api.openScreenshotInExplorer(item.id)}>
            位置
          </button>
          {viewMode === 'active' && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => runOcr(item)}
              disabled={ocrLoading[item.id]}
            >
              {ocrLoading[item.id] ? '识别中...' : 'OCR'}
            </button>
          )}
          {viewMode === 'active' ? (
            <button className="btn btn-danger btn-sm" onClick={() => moveToTrash(item)}>
              删除
            </button>
          ) : (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => restore(item)}>
                恢复
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => deleteForever(item)}>
                永久删除
              </button>
            </>
          )}
        </div>
      ),
    },
  ], [viewMode, ocrLoading, filteredScreenshots])

  const openPreview = async (id: string): Promise<void> => {
    const index = filteredScreenshots.findIndex(s => s.id === id)
    if (index < 0) return
    setPreviewLoading(true)
    try {
      const image = await window.api.getScreenshotImage(id)
      if (!image) {
        showToast('图片文件不存在', 'error')
        await loadData()
        return
      }
      setPreview({ index, image })
    } finally {
      setPreviewLoading(false)
    }
  }

  const navigatePreview = (direction: 'prev' | 'next'): void => {
    if (!preview || filteredScreenshots.length === 0) return
    const total = filteredScreenshots.length
    const newIndex = direction === 'next'
      ? (preview.index + 1) % total
      : (preview.index - 1 + total) % total
    void openPreview(filteredScreenshots[newIndex].id)
  }

  const addExistingTag = async (item: ScreenshotItem, tagId: string): Promise<void> => {
    if (!tagId || item.tagIds.includes(tagId)) return
    await window.api.updateScreenshotTags(item.id, [...item.tagIds, tagId])
    await loadData()
  }

  const addNewTag = async (item: ScreenshotItem): Promise<void> => {
    const value = (newTagById[item.id] || '').trim()
    if (!value) return

    try {
      const tag = await window.api.createScreenshotTag(value)
      await addExistingTag(item, tag.id)
      setNewTagById((prev) => ({ ...prev, [item.id]: '' }))
    } catch {
      showToast('标签保存失败', 'error')
    }
  }

  const removeTag = async (item: ScreenshotItem, tagId: string): Promise<void> => {
    await window.api.updateScreenshotTags(item.id, item.tagIds.filter((id) => id !== tagId))
    await loadData()
  }

  const moveToTrash = async (item: ScreenshotItem): Promise<void> => {
    if (!window.confirm(`移入回收站：${item.filename}？`)) return
    await window.api.trashScreenshot(item.id)
    showToast('已移入回收站', 'success')
    await loadData()
  }

  const restore = async (item: ScreenshotItem): Promise<void> => {
    await window.api.restoreScreenshot(item.id)
    showToast('已恢复', 'success')
    await loadData()
  }

  const deleteForever = async (item: ScreenshotItem): Promise<void> => {
    if (!window.confirm(`永久删除：${item.filename}？此操作不可撤销。`)) return
    await window.api.deleteScreenshotPermanently(item.id)
    showToast('已永久删除', 'success')
    await loadData()
  }

  const runOcr = async (item: ScreenshotItem): Promise<void> => {
    setOcrLoading((prev) => ({ ...prev, [item.id]: true }))
    try {
      const result = await window.api.ocrScreenshot(item.id)
      if (result.success) {
        showToast(result.text ? 'OCR 识别完成' : 'OCR 识别完成（未识别到文字）', 'success')
      } else {
        showToast(`OCR 失败：${result.error}`, 'error')
      }
      await loadData()
    } catch (err) {
      showToast(`OCR 异常：${(err as Error).message}`, 'error')
    } finally {
      setOcrLoading((prev) => ({ ...prev, [item.id]: false }))
    }
  }

  const runBatchOcr = async (): Promise<void> => {
    const unprocessed = data.screenshots.filter((s) => s.status === 'active' && !s.ocrText)
    if (unprocessed.length === 0) {
      showToast('没有需要识别的截图', 'info')
      return
    }

    setBatchOcrLoading(true)
    setBatchOcrProgress(`正在识别 0/${unprocessed.length}...`)
    try {
      const ids = unprocessed.map((s) => s.id)
      const result = await window.api.ocrScreenshotsBatch(ids)
      if (result.success) {
        const ok = result.results.filter((r) => r.text).length
        const fail = result.results.filter((r) => r.error).length
        showToast(`批量 OCR 完成：${ok} 张成功${fail > 0 ? `，${fail} 张失败` : ''}`, 'success')
      } else {
        showToast(`批量 OCR 失败：${result.error}`, 'error')
      }
      setBatchOcrProgress('')
      await loadData()
    } catch (err) {
      showToast(`批量 OCR 异常：${(err as Error).message}`, 'error')
    } finally {
      setBatchOcrLoading(false)
      setBatchOcrProgress('')
    }
  }

  const batchDelete = async (): Promise<void> => {
    const items = filteredScreenshots.filter((s) => selectedIds.has(s.id))
    if (items.length === 0) return

    if (viewMode === 'active') {
      if (!window.confirm(`移入回收站 ${items.length} 张截图？`)) return
      for (const item of items) {
        await window.api.trashScreenshot(item.id)
      }
      showToast(`已移入回收站 ${items.length} 张`, 'success')
    } else {
      if (!window.confirm(`永久删除 ${items.length} 张截图？此操作不可撤销。`)) return
      for (const item of items) {
        await window.api.deleteScreenshotPermanently(item.id)
      }
      showToast(`已永久删除 ${items.length} 张`, 'success')
    }
    setSelectedIds(new Set())
    await loadData()
  }

  const batchOcrSelected = async (): Promise<void> => {
    const items = filteredScreenshots.filter((s) => selectedIds.has(s.id) && s.status === 'active')
    if (items.length === 0) {
      showToast('没有可识别的截图', 'info')
      return
    }

    setBatchOcrLoading(true)
    setBatchOcrProgress(`正在识别 0/${items.length}...`)
    try {
      const ids = items.map((s) => s.id)
      const result = await window.api.ocrScreenshotsBatch(ids)
      if (result.success) {
        const ok = result.results.filter((r) => r.text).length
        const fail = result.results.filter((r) => r.error).length
        showToast(`批量 OCR 完成：${ok} 张成功${fail > 0 ? `，${fail} 张失败` : ''}`, 'success')
      } else {
        showToast(`批量 OCR 失败：${result.error}`, 'error')
      }
      setBatchOcrProgress('')
      setSelectedIds(new Set())
      await loadData()
    } catch (err) {
      showToast(`批量 OCR 异常：${(err as Error).message}`, 'error')
    } finally {
      setBatchOcrLoading(false)
      setBatchOcrProgress('')
    }
  }

  return (
    <>
      <div className="page-title">截图</div>

      <div className="screenshot-toolbar">
        <div className="segmented">
          <button
            className={viewMode === 'active' ? 'active' : ''}
            onClick={() => setViewMode('active')}
          >
            全部
          </button>
          <button
            className={viewMode === 'trash' ? 'active' : ''}
            onClick={() => setViewMode('trash')}
          >
            回收站
          </button>
        </div>

        <select
          className="form-select screenshot-filter"
          value={tagFilter}
          onChange={(event) => setTagFilter(event.target.value)}
        >
          <option value="all">全部标签</option>
          {data.tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>

        <button className="btn btn-secondary" onClick={loadData} disabled={loading}>
          刷新
        </button>

        {selectedIds.size > 0 ? (
          <>
            <span className="batch-hint">已选 {selectedIds.size} 张</span>
            {viewMode === 'active' && (
              <button
                className="btn btn-primary"
                onClick={batchOcrSelected}
                disabled={batchOcrLoading}
              >
                {batchOcrLoading ? (batchOcrProgress || '识别中...') : 'OCR 选中'}
              </button>
            )}
            <button className="btn btn-danger" onClick={batchDelete}>
              {viewMode === 'active' ? '删除选中' : '永久删除选中'}
            </button>
            <button className="btn btn-secondary" onClick={() => setSelectedIds(new Set())}>
              取消选择
            </button>
          </>
        ) : (
          viewMode === 'active' && (
            <button
              className="btn btn-primary"
              onClick={runBatchOcr}
              disabled={batchOcrLoading}
            >
              {batchOcrLoading ? (batchOcrProgress || '识别中...') : '批量 OCR'}
            </button>
          )
        )}
      </div>

      {loading ? (
        <div className="empty-tip">加载中...</div>
      ) : filteredScreenshots.length === 0 ? (
        <div className="empty-tip">
          {viewMode === 'trash' ? '回收站为空' : '还没有截图'}
        </div>
      ) : layoutMode === 'table' ? (
        <DataTable
          columns={screenshotColumns}
          data={filteredScreenshots}
          rowKey={(item) => item.id}
          selectable
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      ) : (
        <div className="screenshot-grid">
          {filteredScreenshots.map((item) => (
            <div key={item.id} className="screenshot-card">
              <button className="screenshot-thumb" onClick={() => openPreview(item.id)}>
                <img src={item.thumbnailDataUrl} alt={item.filename} />
              </button>

              <div className="screenshot-meta">
                <div className="screenshot-name" title={item.filename}>
                  {item.filename}
                </div>
                <div className="screenshot-sub">{getRunName(item)}</div>
                <div className="screenshot-sub">{formatDate(item.createdAt)} · {formatSize(item.size)}</div>
                {item.run?.sourceTitle && (
                  <div className="screenshot-sub" title={item.run.sourceUrl}>
                    {item.run.sourceTitle}
                  </div>
                )}
              </div>

              {item.ocrText ? (
                <div className="ocr-text" title={item.ocrText}>
                  <span className="ocr-label">OCR：</span>
                  {item.ocrText.length > 80
                    ? `${item.ocrText.slice(0, 80)}...`
                    : item.ocrText}
                </div>
              ) : (
                item.status === 'active' && (
                  <div className="ocr-text ocr-empty">未识别</div>
                )
              )}

              <div className="tag-row">
                {item.tags.length === 0 && <span className="tag-empty">无标签</span>}
                {item.tags.map((tag) => (
                  <button
                    key={tag.id}
                    className="tag-pill"
                    onClick={() => removeTag(item, tag.id)}
                    title="移除标签"
                  >
                    {tag.name} ×
                  </button>
                ))}
              </div>

              <div className="tag-edit-row">
                <select
                  className="form-select"
                  value=""
                  onChange={(event) => addExistingTag(item, event.target.value)}
                >
                  <option value="">选择标签</option>
                  {data.tags
                    .filter((tag) => !item.tagIds.includes(tag.id))
                    .map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="tag-edit-row">
                <input
                  className="form-input"
                  value={newTagById[item.id] || ''}
                  onChange={(event) =>
                    setNewTagById((prev) => ({ ...prev, [item.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void addNewTag(item)
                  }}
                  placeholder="新标签"
                />
                <button className="btn btn-secondary btn-sm" onClick={() => addNewTag(item)}>
                  添加
                </button>
              </div>

              <div className="screenshot-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => window.api.openScreenshotInExplorer(item.id)}>
                  位置
                </button>
                {viewMode === 'active' && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => runOcr(item)}
                    disabled={ocrLoading[item.id]}
                  >
                    {ocrLoading[item.id] ? '识别中...' : 'OCR'}
                  </button>
                )}
                {viewMode === 'active' ? (
                  <button className="btn btn-danger btn-sm" onClick={() => moveToTrash(item)}>
                    删除
                  </button>
                ) : (
                  <>
                    <button className="btn btn-secondary btn-sm" onClick={() => restore(item)}>
                      恢复
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => deleteForever(item)}>
                      永久删除
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ImageLightbox
        image={preview ? { src: preview.image.dataUrl, alt: preview.image.filename } : null}
        loading={previewLoading}
        index={preview?.index}
        total={filteredScreenshots.length}
        onClose={() => setPreview(null)}
        onPrev={() => navigatePreview('prev')}
        onNext={() => navigatePreview('next')}
      />

      {ocrDialog && (
        <div className="ocr-dialog-overlay" onClick={() => setOcrDialog(null)}>
          <div className="ocr-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ocr-dialog-header">
              <span>OCR 识别结果 — {ocrDialog.filename}</span>
              <button className="ocr-dialog-close" onClick={() => setOcrDialog(null)}>×</button>
            </div>
            <div className="ocr-dialog-body">{ocrDialog.text}</div>
          </div>
        </div>
      )}
    </>
  )
}
